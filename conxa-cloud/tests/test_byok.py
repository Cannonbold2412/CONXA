"""Enterprise BYOK (Azure OpenAI) — key storage, plan gating, router routing."""

from __future__ import annotations

from fastapi.testclient import TestClient

from conxa_core.config import settings
from app.main import app
from app.services.saas import upsert_billing

client = TestClient(app)
STUDIO_HEADER = {"X-Conxa-Client": settings.llm_proxy_client_header}
TEST_KEY_B64 = "ahhYJyeFhnc/i4UW3Z7UYidOmc8n+rW1o43rVH1ziw8="


def _set_plan(plan: str, **overrides: object) -> None:
    patch: dict[str, object] = {"plan": plan}
    if overrides:
        patch["entitlement_overrides"] = overrides
    upsert_billing("wrk_local", patch)


def test_byok_requires_enterprise_plan(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "byok_encryption_key", TEST_KEY_B64)
    _set_plan("pro")

    r = client.put(
        "/api/v1/workspace/llm-key",
        json={
            "endpoint": "https://acme.openai.azure.com",
            "deployment": "gpt-4o",
            "api_version": "2024-08-01-preview",
            "api_key": "azure-secret-key",
        },
    )

    assert r.status_code == 403
    assert r.json()["detail"] == "byok_requires_enterprise"


def test_byok_key_get_never_returns_secret(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "byok_encryption_key", TEST_KEY_B64)
    _set_plan("enterprise", byok=True)

    put = client.put(
        "/api/v1/workspace/llm-key",
        json={
            "endpoint": "https://acme.openai.azure.com",
            "deployment": "gpt-4o",
            "api_version": "2024-08-01-preview",
            "api_key": "azure-secret-key",
        },
    )
    assert put.status_code == 200, put.text
    assert "api_key" not in put.text
    assert "azure-secret-key" not in put.text

    get = client.get("/api/v1/workspace/llm-key")
    assert get.status_code == 200, get.text
    body = get.json()
    assert body["configured"] is True
    assert body["deployment"] == "gpt-4o"
    assert "api_key" not in get.text
    assert "azure-secret-key" not in get.text

    delete = client.delete("/api/v1/workspace/llm-key")
    assert delete.status_code == 200, delete.text
    assert client.get("/api/v1/workspace/llm-key").json()["configured"] is False


def test_byok_routes_to_azure_endpoint_not_shared_pool(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "byok_encryption_key", TEST_KEY_B64)
    _set_plan("enterprise", byok=True)

    client.put(
        "/api/v1/workspace/llm-key",
        json={
            "endpoint": "https://acme.openai.azure.com",
            "deployment": "gpt-4o",
            "api_version": "2024-08-01-preview",
            "api_key": "azure-secret-key",
        },
    )

    from app.api import llm_proxy_routes

    calls: list[dict] = []

    class FakeRouter:
        def call_entry_directly(self, entry, task, payload, timeout_ms, *, error_detail=None):
            calls.append({"entry": entry})
            return {"text": "ok"}

        def route_text(self, task, payload, timeout_ms, *, error_detail=None, pool=None):
            raise AssertionError("shared pool should not be used when BYOK is configured")

    monkeypatch.setattr(llm_proxy_routes, "get_router", lambda: FakeRouter())

    r = client.post(
        "/api/v1/llm/proxy/text",
        json={"task": "intent", "payload": {"prompt": "hello"}},
        headers=STUDIO_HEADER,
    )

    assert r.status_code == 200, r.text
    assert len(calls) == 1
    entry = calls[0]["entry"]
    assert entry.auth_style == "api_key_header"
    assert entry.api_key == "azure-secret-key"
    assert "acme.openai.azure.com" in entry.endpoint
    assert "gpt-4o" in entry.endpoint
