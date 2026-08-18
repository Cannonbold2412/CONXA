"""Release-system tests: immutable versions, the stable channel pointer,
rollback, release-lifecycle audit events, and deterministic diff.

Covers the 15 backend cases from the release-system plan. Follows the existing
TestClient + monkeypatch(settings.data_dir, tmp_path) pattern used throughout
this test suite (see test_llm_proxy_and_publish.py).
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from conxa_core.config import settings
from conxa_core.db import db_get
from app.main import app
from app.api import publish_routes
from app.services import release_channel, release_diff

client = TestClient(app)


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _files(marker: str, *, extra: dict[str, str] | None = None) -> list[dict]:
    """A minimal but varying artifact — pack.json plus one skill file, so
    successive publishes with a different marker never collide on
    skill_pack_artifact_unchanged."""
    out = [{"path": "pack.json", "content_base64": _b64(f'{{"marker":"{marker}"}}')}]
    if extra:
        for path, content in extra.items():
            out.append({"path": path, "content_base64": _b64(content)})
    return out


def _publish(slug: str, version: str, marker: str, *, skills: list[str] | None = None, extra: dict[str, str] | None = None):
    return client.post(
        "/api/v1/workflows/publish",
        json={
            "slug": slug,
            "display_name": slug.title(),
            "skill_pack_version": version,
            "release_notes": f"release {version}",
            "skills": skills or [],
            "files": _files(marker, extra=extra),
        },
    )


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")


# ---------------------------------------------------------------------------
# 1-2: immutable versions
# ---------------------------------------------------------------------------

def test_first_publish_creates_1_0_0_and_becomes_stable():
    r = _publish("acme-rel", "1.0.0", "v1")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel") == "1.0.0"


def test_second_publish_creates_a_new_immutable_version():
    _publish("acme-rel2", "1.0.0", "v1")
    r = _publish("acme-rel2", "1.1.0", "v2")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel2") == "1.1.0"

    versions = client.get("/api/v1/workflows/v2/acme-rel2/skill-packs/versions").json()["versions"]
    assert {v["version"] for v in versions} == {"1.0.0", "1.1.0"}


def test_published_version_cannot_be_overwritten():
    _publish("acme-rel3", "1.0.0", "v1")
    r = client.post(
        "/api/v1/workflows/publish",
        json={
            "slug": "acme-rel3",
            "skill_pack_version": "1.0.0",
            "skills": [],
            "files": _files("different-content"),
        },
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "skill_pack_version_exists"


# ---------------------------------------------------------------------------
# 3-4: transactional publish
# ---------------------------------------------------------------------------

def test_failed_publish_does_not_change_stable(monkeypatch):
    _publish("acme-rel4", "1.0.0", "v1")
    assert release_channel.get_stable_version("acme-rel4") == "1.0.0"

    def _boom(*_a, **_kw):
        raise RuntimeError("disk full")

    monkeypatch.setattr(publish_routes, "write_mutable_mirror_files", _boom)
    unraising_client = TestClient(app, raise_server_exceptions=False)
    r = unraising_client.post(
        "/api/v1/workflows/publish",
        json={"slug": "acme-rel4", "skill_pack_version": "1.1.0", "skills": [], "files": _files("v2")},
    )
    assert r.status_code == 500

    # Stable is untouched, and the attempted version is left "pending" (safe to retry).
    assert release_channel.get_stable_version("acme-rel4") == "1.0.0"
    row = db_get(publish_routes.skillpack_versions_ns("acme-rel4"), "1.1.0")
    assert row["status"] == "pending"

    events = release_channel.list_release_events("acme-rel4")
    actions = [e["action"] for e in events]
    assert "skill_publish_failed" in actions
    assert "stable_channel_changed" not in actions or actions.index("skill_publish_failed") < actions.index(
        "stable_channel_changed"
    )


def test_successful_publish_changes_stable_and_retry_after_failure_succeeds(monkeypatch):
    from app.api.skillpack_storage import write_mutable_mirror_files as _real_write_mutable_mirror_files

    _publish("acme-rel5", "1.0.0", "v1")

    def _boom(*_a, **_kw):
        raise RuntimeError("disk full")

    monkeypatch.setattr(publish_routes, "write_mutable_mirror_files", _boom)
    unraising_client = TestClient(app, raise_server_exceptions=False)
    failed = unraising_client.post(
        "/api/v1/workflows/publish",
        json={"slug": "acme-rel5", "skill_pack_version": "1.1.0", "skills": [], "files": _files("v2")},
    )
    assert failed.status_code == 500
    assert release_channel.get_stable_version("acme-rel5") == "1.0.0"

    # Restore the patched attribute directly rather than monkeypatch.undo() —
    # undo() reverts every patch made through this test's (function-scoped,
    # shared-by-name) monkeypatch fixture, including the autouse _isolate
    # fixture's settings.data_dir/database_url patches.
    monkeypatch.setattr(publish_routes, "write_mutable_mirror_files", _real_write_mutable_mirror_files)
    retried = _publish("acme-rel5", "1.1.0", "v2-retry")
    assert retried.status_code == 200, retried.text
    assert release_channel.get_stable_version("acme-rel5") == "1.1.0"


# ---------------------------------------------------------------------------
# 5-7: rollback
# ---------------------------------------------------------------------------

def test_rollback_changes_stable_pointer_without_mutating_old_versions():
    _publish("acme-rel6", "1.0.0", "v1")
    _publish("acme-rel6", "1.1.0", "v2")
    assert release_channel.get_stable_version("acme-rel6") == "1.1.0"

    before = db_get(publish_routes.skillpack_versions_ns("acme-rel6"), "1.1.0")

    r = client.post("/api/v1/workflows/v2/acme-rel6/releases/1.0.0/rollback")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel6") == "1.0.0"

    after = db_get(publish_routes.skillpack_versions_ns("acme-rel6"), "1.1.0")
    assert after["artifact_sha256"] == before["artifact_sha256"]
    assert after["status"] == "published"  # untouched, not deleted or reverted

    # The rolled-back-from version becomes superseded (derived: not the channel target).
    assert after["is_latest"] is False
    rolled_to = db_get(publish_routes.skillpack_versions_ns("acme-rel6"), "1.0.0")
    assert rolled_to["is_latest"] is True


def test_rollback_to_unavailable_release_is_rejected():
    _publish("acme-rel7", "1.0.0", "v1")
    r = client.post("/api/v1/workflows/v2/acme-rel7/releases/9.9.9/rollback")
    assert r.status_code == 404


def test_rollback_when_already_stable_is_a_clean_no_op_rejection():
    _publish("acme-rel8", "1.0.0", "v1")
    r = client.post("/api/v1/workflows/v2/acme-rel8/releases/1.0.0/rollback")
    assert r.status_code == 400
    assert r.json()["detail"] == "already_stable"


# ---------------------------------------------------------------------------
# 8-9: RBAC
# ---------------------------------------------------------------------------

def test_unauthorized_user_cannot_publish(monkeypatch):
    monkeypatch.setattr(settings, "api_proxy_shared_secret", "proxy-secret")
    r = client.post(
        "/api/v1/workflows/publish",
        json={"slug": "acme-rel9", "skill_pack_version": "1.0.0", "skills": [], "files": _files("v1")},
        headers={
            "x-conxa-proxy-secret": "proxy-secret",
            "x-conxa-user-id": "user_norole",
            "x-conxa-org-id": "org_norole",
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "admin role required"


def test_unauthorized_user_cannot_rollback(monkeypatch):
    _publish("acme-rel10", "1.0.0", "v1")
    _publish("acme-rel10", "1.1.0", "v2")

    monkeypatch.setattr(settings, "api_proxy_shared_secret", "proxy-secret")
    r = client.post(
        "/api/v1/workflows/v2/acme-rel10/releases/1.0.0/rollback",
        headers={
            "x-conxa-proxy-secret": "proxy-secret",
            "x-conxa-user-id": "user_norole",
            "x-conxa-org-id": "org_norole",
        },
    )
    assert r.status_code == 403
    assert release_channel.get_stable_version("acme-rel10") == "1.1.0"  # unaffected


# ---------------------------------------------------------------------------
# 10-11: audit
# ---------------------------------------------------------------------------

def test_audit_event_created_for_publish():
    _publish("acme-rel11", "1.0.0", "v1")
    events = client.get("/api/v1/workflows/v2/acme-rel11/releases/events").json()["events"]
    actions = [e["action"] for e in events]
    assert "skill_publish_succeeded" in actions
    assert "stable_channel_changed" in actions


def test_audit_event_created_for_rollback():
    _publish("acme-rel12", "1.0.0", "v1")
    _publish("acme-rel12", "1.1.0", "v2")
    client.post("/api/v1/workflows/v2/acme-rel12/releases/1.0.0/rollback")

    events = client.get("/api/v1/workflows/v2/acme-rel12/releases/events").json()["events"]
    actions = [e["action"] for e in events]
    assert "rollback_started" in actions
    assert "rollback_completed" in actions


# ---------------------------------------------------------------------------
# 12: artifact integrity
# ---------------------------------------------------------------------------

def test_artifact_sha256_is_validated():
    import hashlib

    _publish("acme-rel13", "1.0.0", "v1")
    detail = client.get("/api/v1/workflows/v2/acme-rel13/releases/1.0.0").json()
    pack_file = next(f for f in detail["files"] if f["path"] == "pack.json")
    expected = hashlib.sha256(b'{"marker":"v1"}').hexdigest()
    assert pack_file["sha256"] == expected


# ---------------------------------------------------------------------------
# 13: version history ordering
# ---------------------------------------------------------------------------

def test_version_history_returns_correct_ordering():
    _publish("acme-rel14", "1.0.0", "v1")
    _publish("acme-rel14", "1.1.0", "v2")
    _publish("acme-rel14", "1.2.0", "v3")

    versions = client.get("/api/v1/workflows/v2/acme-rel14/skill-packs/versions").json()["versions"]
    assert [v["version"] for v in versions] == ["1.2.0", "1.1.0", "1.0.0"]


# ---------------------------------------------------------------------------
# 14: deterministic diff
# ---------------------------------------------------------------------------

def test_diff_is_deterministic():
    prev = {
        "grp/skill_a/execution.json": b'[{"type":"click","selector":"#a"}]',
        "grp/skill_a/recovery.json": b'{"rules":[]}',
    }
    curr = {
        "grp/skill_a/execution.json": b'[{"type":"click","selector":"#a"},{"type":"click","selector":"#b"}]',
        "grp/skill_a/recovery.json": b'{"rules":["r1"]}',
    }
    result1 = release_diff.compute_diff(prev, curr)
    result2 = release_diff.compute_diff(prev, curr)
    assert result1 == result2
    assert result1["steps_added"] == 1
    assert result1["recovery_changed_skills"] == ["skill_a"]


def test_diff_endpoint_matches_preview_before_publishing():
    _publish("acme-rel15", "1.0.0", "v1", skills=["deploy"], extra={"grp/deploy/execution.json": "[]"})

    preview = client.post(
        "/api/v1/workflows/v2/acme-rel15/releases/preview",
        json={
            "version": "1.1.0",
            "skills": ["deploy"],
            "skill_groups": {"deploy": "grp"},
            "files": _files("v2", extra={"grp/deploy/execution.json": '[{"type":"click","selector":"#x"}]'}),
        },
    ).json()
    assert preview["diff"]["steps_added"] == 1

    _publish("acme-rel15", "1.1.0", "v2", skills=["deploy"], extra={"grp/deploy/execution.json": '[{"type":"click","selector":"#x"}]'})
    published_diff = client.get("/api/v1/workflows/v2/acme-rel15/releases/1.1.0/diff").json()
    assert published_diff["available"] is True
    assert published_diff["steps_added"] == preview["diff"]["steps_added"]


# ---------------------------------------------------------------------------
# 15: runtime desired version follows the channel
# ---------------------------------------------------------------------------

def test_runtime_desired_version_follows_publish_and_rollback():
    # "_default" (not an arbitrary group id) — _build_delta falls back to that
    # group when the publish body carries no skill_groups mapping, which this
    # test's minimal _publish() helper doesn't send.
    _publish("acme-rel16", "1.0.0", "v1", skills=["deploy"], extra={"_default/deploy/execution.json": '["step-a"]'})
    _publish("acme-rel16", "1.1.0", "v2", skills=["deploy"], extra={"_default/deploy/execution.json": '["step-b"]'})

    delta = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy = next(s for s in delta["skills"] if s["name"] == "deploy")
    assert deploy["version"] == "1.1.0"

    client.post("/api/v1/workflows/v2/acme-rel16/releases/1.0.0/rollback")
    delta_after = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy_after = next(s for s in delta_after["skills"] if s["name"] == "deploy")
    assert deploy_after["version"] == "1.0.0"
    file_entry = next(f for f in deploy_after["files"] if f["path"] == "execution.json")
    assert base64.b64decode(file_entry["content_base64"]) == b'["step-a"]'
