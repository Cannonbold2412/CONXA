"""Unified signed manifest.json: KV-backed component versions, Ed25519 signing,
tamper rejection, and independent per-skill versioning within one company."""

from __future__ import annotations

import importlib

from conxa_core.config import settings
from fastapi.testclient import TestClient

from app.main import app
from app.api import manifest_signer as ms

client = TestClient(app)


def _reload_updates_routes():
    """_ADMIN_TOKEN is read from env once at import time — reload after changing it."""
    import app.api.updates_routes as m
    importlib.reload(m)
    return m


def test_manifest_json_public_no_auth(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    r = client.get("/api/v1/manifest.json")
    assert r.status_code == 200
    body = r.json()
    assert body["manifest_version"] == 3
    assert "conxa_runtime" in body
    assert "conxa_app" in body
    assert "skill_packs" in body


def test_admin_endpoint_rejects_without_token(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_ADMIN_TOKEN", "secret-token")
    _reload_updates_routes()
    r = TestClient(app).post("/api/v1/admin/component-versions/conxa_runtime", json={"version": "host-v1.0.0"})
    assert r.status_code == 401


def test_publish_sign_and_verify_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_ADMIN_TOKEN", "secret-token")
    priv_pem, pub_b64 = ms.generate_keypair_pem()
    monkeypatch.setenv("CONXA_MANIFEST_SIGNING_KEY", priv_pem)
    _reload_updates_routes()
    c = TestClient(app)
    headers = {"Authorization": "Bearer secret-token"}

    r = c.post(
        "/api/v1/admin/component-versions/conxa_runtime",
        json={
            "version": "host-v1.2.0",
            "released_at": "2026-07-01T00:00:00Z",
            "files": [{"filename": "conxa-runtime.exe", "url": "https://x/conxa-runtime.exe", "sha256": "a" * 64}],
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text

    manifest = c.get("/api/v1/manifest.json").json()
    assert manifest["conxa_runtime"]["version"] == "host-v1.2.0"
    assert manifest["signature"]
    assert ms.verify_manifest(manifest, pub_b64) is True

    tampered = dict(manifest)
    tampered["conxa_runtime"] = {**tampered["conxa_runtime"], "version": "host-v9.9.9"}
    assert ms.verify_manifest(tampered, pub_b64) is False


def test_independent_skill_versions_within_one_company(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_ADMIN_TOKEN", "secret-token")
    _reload_updates_routes()
    c = TestClient(app)
    headers = {"Authorization": "Bearer secret-token"}

    c.post(
        "/api/v1/admin/component-versions/skill_packs:acme:invoice-automation",
        json={"version": "v1.2.0", "released_at": "2026-07-01T00:00:00Z", "files": []},
        headers=headers,
    )
    c.post(
        "/api/v1/admin/component-versions/skill_packs:acme:approval-workflow",
        json={"version": "v2.0.0", "released_at": "2026-07-01T00:00:00Z", "files": []},
        headers=headers,
    )

    manifest = c.get("/api/v1/manifest.json").json()
    acme = manifest["skill_packs"]["acme"]
    assert acme["invoice-automation"]["version"] == "v1.2.0"
    assert acme["approval-workflow"]["version"] == "v2.0.0"


def test_deprecated_shims_reflect_kv_after_publish(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_ADMIN_TOKEN", "secret-token")
    _reload_updates_routes()
    c = TestClient(app)
    headers = {"Authorization": "Bearer secret-token"}

    c.post(
        "/api/v1/admin/component-versions/conxa_app",
        json={
            "version": "app-v1.5.0",
            "released_at": "2026-07-01T00:00:00Z",
            "min_host": "host-v1.0.0",
            "files": [{"filename": "conxa-app-app-v1.5.0.zip", "url": "https://x/app.zip", "sha256": "b" * 64}],
        },
        headers=headers,
    )

    shim = c.get("/api/v1/updates/conxa-app-manifest").json()
    assert shim["app_version"] == "app-v1.5.0"
    assert shim["bundle_sha256"] == "b" * 64
    assert shim["bundle_url"] == "https://x/app.zip"
