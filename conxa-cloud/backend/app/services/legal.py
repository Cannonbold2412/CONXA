"""Legal acceptance records — who accepted which terms, when, from where.

An acceptance is evidence, so it gets its own durable KV namespace rather than
riding on ``saas.audit_events`` (which keeps only the newest 500 events across
the whole deployment and would silently evict the row you most need). An audit
event is *also* emitted, so acceptances show up on the dashboard's Audit page,
but the row below is the record.

Rows are immutable: a second acceptance of the same version by the same user
returns the first row untouched, so the stored timestamp is always the moment
the person actually agreed.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import Request

from app.legal import CURRENT_LEGAL_VERSION, DOCUMENT_HASHES, DOCUMENTS
from app.services.saas import Principal, add_audit_event
from conxa_core.db import db_get, db_list, db_set

NAMESPACE = "legal_acceptances"


class LegalVersionMismatch(Exception):
    """The client accepted a version or document text the server is not serving."""


def _key(user_id: str, version: str) -> str:
    return f"{user_id}:{version}"


def client_ip(request: Request) -> str:
    """Caller's IP. Render fronts the app with a proxy, so the first
    ``x-forwarded-for`` hop is the real client where present."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "")[:64]


def acceptance_for(user_id: str, version: str = CURRENT_LEGAL_VERSION) -> dict[str, Any] | None:
    row = db_get(NAMESPACE, _key(user_id, version))
    return row if isinstance(row, dict) else None


def acceptances_for_workspace(workspace_id: str) -> list[dict[str, Any]]:
    # ponytail: full-namespace scan, add an index if this ever gets large.
    rows = [
        row
        for row in db_list(NAMESPACE)
        if isinstance(row, dict) and row.get("workspace_id") == workspace_id
    ]
    rows.sort(key=lambda row: float(row.get("accepted_at") or 0), reverse=True)
    return rows


def verify_documents(version: str, document_hashes: dict[str, str]) -> None:
    """Raise if the client did not accept exactly the text this server serves."""
    if version != CURRENT_LEGAL_VERSION:
        raise LegalVersionMismatch(version)
    for doc in DOCUMENTS:
        if document_hashes.get(doc.id) != doc.sha256:
            raise LegalVersionMismatch(doc.id)


def record_acceptance(
    principal: Principal,
    request: Request,
    *,
    version: str,
    document_hashes: dict[str, str],
    app_version: str = "",
) -> dict[str, Any]:
    verify_documents(version, document_hashes)

    existing = acceptance_for(principal.user_id, version)
    if existing is not None:
        return existing

    now = time.time()
    row: dict[str, Any] = {
        "id": f"legal_{int(now * 1000)}",
        "user_id": principal.user_id,
        "email": principal.email,
        "name": principal.name,
        "workspace_id": principal.workspace_id,
        "workspace_slug": principal.workspace_slug,
        "workspace_name": principal.workspace_name,
        "role": principal.role,
        "auth_provider": principal.auth_provider,
        "identity_source": principal.identity_source,
        "version": version,
        "document_hashes": dict(DOCUMENT_HASHES),
        "documents": [doc.public() for doc in DOCUMENTS],
        "accepted_at": now,
        "accepted_at_iso": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "client_ip": client_ip(request),
        "user_agent": request.headers.get("user-agent", "")[:256],
        "app_version": str(app_version or "")[:64],
        "machine_hash": request.headers.get("x-conxa-machine", "").strip()[:128],
    }
    db_set(NAMESPACE, _key(principal.user_id, version), row)

    add_audit_event(
        principal,
        "legal.accepted",
        resource_type="legal_document",
        resource_id=version,
        metadata={
            "record_id": row["id"],
            "app_version": row["app_version"],
            "client_ip": row["client_ip"],
        },
    )
    return row
