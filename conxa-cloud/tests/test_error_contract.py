"""The shared error contract (app/api/errors.py): every error response carries
`detail` (untouched — the wire contract two shipped clients parse directly),
plus additive `message` and `request_id` fields."""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from app.api import deps as deps_mod
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_known_http_exception_carries_message_and_request_id():
    # invalid_slug is a real HTTPException raised by publish_routes._validate_slug.
    r = client.get("/api/v1/workflows/%2E%2E/installer/versions")
    assert r.status_code in (400, 404)
    body = r.json()
    assert "message" in body
    assert "request_id" in body and body["request_id"]
    # `detail` is untouched — Build Studio's LLMProxyClient and the frontend both
    # parse it directly.
    assert "detail" in body


def test_unhandled_exception_returns_internal_error_shape_and_logs(monkeypatch, caplog):
    def _boom(_request):
        raise RuntimeError("kaboom - unexpected failure")

    monkeypatch.setattr(deps_mod, "principal_from_request", _boom)

    with caplog.at_level(logging.ERROR):
        r = client.get("/api/v1/me")

    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "internal_error"
    assert "request_id" in body and body["request_id"]
    assert "Something went wrong" in body["message"]
    assert any("unhandled_error" in rec.message for rec in caplog.records)


def test_readyz_503s_on_filesystem_store_when_auth_required(monkeypatch):
    """Regression: /readyz used to report "ready" (200) with database: "filesystem"
    even when SKILL_AUTH_REQUIRED=true — which _validate_production_config already
    refuses to boot without a real database for. Readiness must agree with startup."""
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr("app.main.using_database", lambda: False)
    monkeypatch.setattr("app.main.healthcheck", lambda: None)

    r = client.get("/readyz")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "unavailable"
    assert body["database"] == "filesystem"


def test_admin_role_required_is_a_bare_code_not_prose():
    """Regression: app/services/rbac.py used to raise the prose string
    "admin role required" as the machine-readable detail. It's now a snake_case
    code like every other detail in the codebase, with the sentence carried in
    `message` instead."""
    from app.services.rbac import require_admin
    from app.services.saas import Principal
    from fastapi import HTTPException

    principal = Principal(
        user_id="u1", workspace_id="w1", workspace_slug="w1", workspace_name="w", role="member",
    )
    with pytest.raises(HTTPException) as exc_info:
        require_admin(principal)
    assert exc_info.value.detail == "admin_role_required"
