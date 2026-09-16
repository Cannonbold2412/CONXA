"""Service-to-service bridge for Conxa Execute <-> Conxa Cloud (Execute seat
grants drawing from a workspace's shared AI Usage Credits pool — see
docs/TRD.md §13.4c).

Every route here is authenticated with a single shared bearer secret
(SKILL_EXECUTE_SERVICE_TOKEN), not a Clerk session — the caller is
conxa-execute's own backend, a service Conxa operates end-to-end, not an
end-user's browser. Kept in its own router/file because it's a different
trust boundary than the Clerk-principal routes in entitlement_routes.py,
same reasoning updates_routes.py's admin-token routes are their own file.
"""

from __future__ import annotations

import secrets
from typing import Any

from conxa_core.config import settings
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services.entitlements import (
    EntitlementError,
    claim_execute_grant,
    ensure_execute_pool_available,
    execute_pool_binding_for_user,
    execute_pool_status,
    record_execute_pool_usage,
)
from app.services.saas import workspace_name_for

router = APIRouter(tags=["execute-bridge"])


def _require_execute_service(authorization: str = Header(default="")) -> None:
    token = str(settings.execute_service_token or "").strip()
    if not token:
        raise HTTPException(status_code=503, detail="Execute service token not configured")
    scheme, _, provided = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(provided.strip(), token):
        raise HTTPException(status_code=401, detail="Unauthorized")


class BridgeClaimBody(BaseModel):
    grant_id: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=256)
    email: str = Field(..., min_length=3, max_length=320)


class BridgeCheckBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=256)
    estimated_tokens: int = Field(default=0, ge=0)


class BridgeDebitBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=256)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)


def _entitlement_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, EntitlementError):
        return HTTPException(status_code=exc.status_code, detail=exc.code)
    return HTTPException(status_code=500, detail="internal_error")


@router.post("/internal/execute/grants/claim")
def post_bridge_claim(body: BridgeClaimBody, authorization: str = Header(default="")) -> dict[str, Any]:
    _require_execute_service(authorization)
    try:
        result = claim_execute_grant(grant_id=body.grant_id, user_id=body.user_id, email=body.email)
    except Exception as exc:  # noqa: BLE001
        raise _entitlement_http_error(exc) from exc
    return {**result, "workspace_name": workspace_name_for(result["workspace_id"])}


@router.post("/internal/execute/pool/check")
def post_bridge_pool_check(body: BridgeCheckBody, authorization: str = Header(default="")) -> dict[str, Any]:
    """Pre-flight check before Conxa Execute dispatches a chat completion for
    a granted user. Returns a clean ok:false rather than an HTTP error so
    Execute doesn't need to unwind an exception on the hot chat path."""
    _require_execute_service(authorization)
    binding = execute_pool_binding_for_user(body.user_id)
    if not binding:
        return {"bound": False, "ok": False}
    workspace_id = binding["workspace_id"]
    workspace_name = workspace_name_for(workspace_id)
    status = execute_pool_status(workspace_id)
    try:
        ensure_execute_pool_available(workspace_id, estimated_tokens=body.estimated_tokens)
    except EntitlementError:
        return {"bound": True, "workspace_id": workspace_id, "workspace_name": workspace_name, "ok": False, "remaining": 0}
    return {
        "bound": True,
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
        "ok": True,
        "remaining": status["remaining"],
    }


@router.post("/internal/execute/pool/debit")
def post_bridge_pool_debit(body: BridgeDebitBody, authorization: str = Header(default="")) -> dict[str, Any]:
    """Post-call debit. No-ops (recorded:false) instead of erroring if the
    binding was revoked between check and debit — this is metering after the
    LLM call already happened, so failing the response here would just lose
    the usage record, not stop anything."""
    _require_execute_service(authorization)
    binding = execute_pool_binding_for_user(body.user_id)
    if not binding:
        return {"bound": False, "recorded": False}
    record_execute_pool_usage(
        binding["workspace_id"], input_tokens=body.input_tokens, output_tokens=body.output_tokens
    )
    return {"bound": True, "recorded": True}
