"""Dashboard "Report a bug" endpoint — Resend email send, not configured, size cap."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from conxa_core.config import settings
from app.main import app

client = TestClient(app)


def test_bug_report_disabled_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "")
    monkeypatch.setattr(settings, "bug_report_to_email", "")

    r = client.post("/api/v1/bug-reports", json={"description": "it broke"})

    assert r.status_code == 503
    assert r.json()["detail"] == "bug_reports_not_configured"


def test_bug_report_rejects_oversized_attachments(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "bug_report_to_email", "team@conxa.dev")
    monkeypatch.setattr(settings, "bug_report_max_bytes", 100)

    big_b64 = base64.b64encode(b"x" * 1000).decode()
    r = client.post(
        "/api/v1/bug-reports",
        json={
            "description": "it broke",
            "attachments": [{"filename": "rec.mp4", "content_base64": big_b64}],
        },
    )

    assert r.status_code == 413
    assert r.json()["detail"] == "attachments_too_large"


def test_bug_report_sends_email_via_resend(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "bug_report_to_email", "team@conxa.dev")

    from app.api import bug_report_routes

    calls: list[dict] = []

    class FakeResponse:
        status_code = 200
        text = "{}"

    def fake_post(url, *, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse()

    monkeypatch.setattr(bug_report_routes.httpx, "post", fake_post)

    screenshot_b64 = base64.b64encode(b"fake-png-bytes").decode()
    r = client.post(
        "/api/v1/bug-reports",
        json={
            "description": "Button did nothing when clicked",
            "page_url": "https://cloud.conxa.dev/settings",
            "contact_email": "reporter@example.com",
            "attachments": [
                {"filename": "screenshot.png", "content_type": "image/png", "content_base64": screenshot_b64}
            ],
        },
    )

    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    assert len(calls) == 1
    payload = calls[0]["json"]
    assert payload["to"] == ["team@conxa.dev"]
    assert payload["reply_to"] == "reporter@example.com"
    assert "Button did nothing when clicked" in payload["subject"]
    assert payload["attachments"] == [{"filename": "screenshot.png", "content": screenshot_b64}]
