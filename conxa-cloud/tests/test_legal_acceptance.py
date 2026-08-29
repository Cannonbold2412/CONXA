"""Legal acceptance records — the evidence trail behind PROD-17.

These records exist to be produced in a dispute, so the properties that matter
are: the row survives, it is never silently rewritten, and a client cannot
record acceptance of text the server did not serve.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.legal import CURRENT_LEGAL_VERSION, DOCUMENT_HASHES
from app.main import app
from app.services import legal
from conxa_core.config import settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    """Filesystem-backed KV under a temp dir, so each test starts with no rows."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")


def _accept_body(**overrides):
    body = {
        "version": CURRENT_LEGAL_VERSION,
        "document_hashes": dict(DOCUMENT_HASHES),
        "app_version": "1.4.2",
    }
    body.update(overrides)
    return body


def test_current_serves_version_and_document_hashes():
    r = client.get("/api/v1/legal/current")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"] == CURRENT_LEGAL_VERSION
    ids = {doc["id"]: doc for doc in body["documents"]}
    assert set(ids) == {"terms", "privacy"}
    for doc_id, doc in ids.items():
        assert doc["sha256"] == DOCUMENT_HASHES[doc_id]
        assert len(doc["sha256"]) == 64
        assert doc["url"].startswith("https://")


def test_acceptance_starts_absent_then_records_the_full_evidence_bundle():
    assert client.get("/api/v1/legal/acceptance").json()["accepted"] is False

    r = client.post(
        "/api/v1/legal/acceptance",
        json=_accept_body(),
        headers={"X-Conxa-Machine": "machine-hash-abc", "User-Agent": "conxa-build-studio"},
    )

    assert r.status_code == 200, r.text
    row = r.json()["record"]
    assert row["version"] == CURRENT_LEGAL_VERSION
    assert row["document_hashes"] == DOCUMENT_HASHES
    assert row["app_version"] == "1.4.2"
    assert row["machine_hash"] == "machine-hash-abc"
    assert row["user_agent"] == "conxa-build-studio"
    assert row["client_ip"]
    assert row["accepted_at"] > 0
    assert row["accepted_at_iso"].endswith("+00:00")
    assert row["user_id"] and row["workspace_id"]

    status = client.get("/api/v1/legal/acceptance").json()
    assert status["accepted"] is True
    assert status["record_id"] == row["id"]


def test_second_acceptance_never_overwrites_the_first():
    first = client.post("/api/v1/legal/acceptance", json=_accept_body()).json()["record"]

    second = client.post(
        "/api/v1/legal/acceptance",
        json=_accept_body(app_version="9.9.9"),
        headers={"X-Conxa-Machine": "a-different-machine"},
    ).json()["record"]

    # The stored moment of agreement is the first one, not the latest replay.
    assert second == first
    assert second["app_version"] == "1.4.2"


def test_forwarded_ip_wins_over_the_proxy_socket():
    row = client.post(
        "/api/v1/legal/acceptance",
        json=_accept_body(),
        headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1"},
    ).json()["record"]

    assert row["client_ip"] == "203.0.113.9"


@pytest.mark.parametrize(
    "body",
    [
        _accept_body(version="1999-01-01"),
        _accept_body(document_hashes={"terms": "0" * 64, "privacy": "0" * 64}),
        _accept_body(document_hashes={"terms": DOCUMENT_HASHES["terms"]}),  # privacy missing
        _accept_body(document_hashes={}),
    ],
)
def test_accepting_text_the_server_did_not_serve_is_refused(body):
    r = client.post("/api/v1/legal/acceptance", json=body)

    assert r.status_code == 409
    assert r.json()["detail"] == "legal_version_mismatch"
    assert client.get("/api/v1/legal/acceptance").json()["accepted"] is False


def test_workspace_export_lists_the_row_and_requires_admin(monkeypatch):
    client.post("/api/v1/legal/acceptance", json=_accept_body())

    r = client.get("/api/v1/legal/acceptances")
    assert r.status_code == 200, r.text
    assert [row["version"] for row in r.json()["acceptances"]] == [CURRENT_LEGAL_VERSION]

    monkeypatch.setattr(legal, "acceptances_for_workspace", lambda _wid: [])
    from app.api import legal_routes

    monkeypatch.setattr(legal_routes, "require_admin", _deny)
    assert client.get("/api/v1/legal/acceptances").status_code == 403


def _deny(_principal):
    from fastapi import HTTPException

    raise HTTPException(status_code=403, detail="admin role required")
