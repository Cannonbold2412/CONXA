"""Legal document versions and acceptance records.

Build Studio blocks on these: it reads the current version, checks whether the
signed-in user has accepted it, and records the acceptance. All four routes are
Clerk-authenticated — an acceptance is only evidence if the accepting party is
identified, so there is deliberately no public/unauthenticated variant.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import current_principal
from app.legal import CURRENT_LEGAL_VERSION, current_documents
from app.services.legal import (
    LegalVersionMismatch,
    acceptance_for,
    acceptances_for_workspace,
    record_acceptance,
)
from app.services.rbac import require_admin

router = APIRouter(prefix="/legal", tags=["legal"])


class AcceptBody(BaseModel):
    version: str = Field(..., min_length=1, max_length=64)
    document_hashes: dict[str, str] = Field(default_factory=dict)
    app_version: str = Field(default="", max_length=64)


def _status(user_id: str) -> dict[str, Any]:
    row = acceptance_for(user_id)
    return {
        "version": CURRENT_LEGAL_VERSION,
        "accepted": row is not None,
        "accepted_at": row.get("accepted_at") if row else None,
        "record_id": row.get("id") if row else None,
    }


@router.get("/current")
def get_current(request: Request) -> dict[str, Any]:
    current_principal(request)
    return {"version": CURRENT_LEGAL_VERSION, "documents": current_documents()}


@router.get("/acceptance")
def get_acceptance(request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    return _status(principal.user_id)


@router.post("/acceptance")
def post_acceptance(body: AcceptBody, request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    try:
        row = record_acceptance(
            principal,
            request,
            version=body.version,
            document_hashes=body.document_hashes,
            app_version=body.app_version,
        )
    except LegalVersionMismatch as exc:
        raise HTTPException(status_code=409, detail="legal_version_mismatch") from exc
    return {"accepted": True, "record": row}


@router.get("/acceptances")
def list_acceptances(request: Request) -> dict[str, Any]:
    """Every acceptance recorded for this workspace — the evidence export."""
    principal = current_principal(request)
    require_admin(principal)
    return {
        "version": CURRENT_LEGAL_VERSION,
        "acceptances": acceptances_for_workspace(principal.workspace_id),
    }
