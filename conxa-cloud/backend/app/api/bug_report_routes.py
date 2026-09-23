"""Dashboard "Report a bug" submissions — emailed via Resend's HTTPS API.

Not SMTP: Render's free plan blocks outbound SMTP ports (25/465/587), so a
plain smtplib call would fail every time. Resend sends over normal HTTPS.

Attachments arrive base64-encoded in the JSON body (the browser posts here
directly, bypassing the Vercel proxy's ~4.5MB request cap — see
app/api/security.py's BUG_REPORT_UPLOAD_PATH for the raised body-size limit
this endpoint needs).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import current_principal

logger = logging.getLogger(__name__)

router = APIRouter(tags=["bug-reports"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_ATTACHMENTS = 5


class BugReportAttachment(BaseModel):
    filename: str = Field(..., min_length=1, max_length=256)
    content_type: str = Field(default="application/octet-stream", max_length=128)
    content_base64: str = Field(..., min_length=1)


class BugReportBody(BaseModel):
    description: str = Field(..., min_length=1, max_length=10_000)
    page_url: str = Field(default="", max_length=2048)
    contact_email: str = Field(default="", max_length=320)
    attachments: list[BugReportAttachment] = Field(default_factory=list)


def _decoded_size(b64: str) -> int:
    # Base64 expands data by ~4/3; padding makes this an estimate, not exact,
    # but it's within a few bytes — plenty for a size gate.
    return len(b64) * 3 // 4


def _send_via_resend(*, settings: Any, subject: str, text: str, reply_to: str, attachments: list[BugReportAttachment]) -> None:
    payload: dict[str, Any] = {
        "from": settings.bug_report_from_email,
        "to": [settings.bug_report_to_email],
        "subject": subject,
        "text": text,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    if attachments:
        payload["attachments"] = [
            {"filename": a.filename, "content": a.content_base64} for a in attachments
        ]

    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json=payload,
        timeout=30.0,
    )
    if resp.status_code >= 300:
        logger.error("bug report email send failed: %s %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="bug_report_send_failed")


@router.post("/bug-reports")
def submit_bug_report(body: BugReportBody, request: Request) -> dict[str, bool]:
    from conxa_core.config import settings

    if not settings.resend_api_key or not settings.bug_report_to_email:
        raise HTTPException(status_code=503, detail="bug_reports_not_configured")

    if len(body.attachments) > _MAX_ATTACHMENTS:
        raise HTTPException(status_code=413, detail="too_many_attachments")

    total_bytes = sum(_decoded_size(a.content_base64) for a in body.attachments)
    if total_bytes > settings.bug_report_max_bytes:
        raise HTTPException(status_code=413, detail="attachments_too_large")

    principal = current_principal(request)

    reply_to = body.contact_email.strip() if _EMAIL_RE.match(body.contact_email.strip()) else ""
    first_line = body.description.strip().splitlines()[0][:120]
    subject = f"[Bug] {principal.workspace_name}: {first_line}"

    text_lines = [
        body.description.strip(),
        "",
        f"Page: {body.page_url or '(not provided)'}",
        f"Contact: {reply_to or '(not provided)'}",
        f"User: {principal.user_id}",
        f"Workspace: {principal.workspace_name} ({principal.workspace_id})",
        f"User-Agent: {request.headers.get('user-agent', '(unknown)')}",
        f"Submitted: {datetime.now(timezone.utc).isoformat()}",
    ]

    _send_via_resend(
        settings=settings,
        subject=subject,
        text="\n".join(text_lines),
        reply_to=reply_to,
        attachments=body.attachments,
    )

    return {"ok": True}
