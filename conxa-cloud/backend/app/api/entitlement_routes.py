"""Current entitlement meters and compile-credit reservation endpoints."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import current_principal, entitlement_http_error
from app.api.machine_binding import register_request_machine
from app.api.updates_routes import _require_admin
from app.services.entitlements import (
    PLAN_LIMITS,
    commit_compile_credit,
    current_entitlements,
    list_machines,
    release_compile_credit,
    reserve_compile_credit,
    revoke_machine,
)
from app.services.rbac import require_admin
from app.services.saas import upsert_billing

router = APIRouter(tags=["entitlements"])
_ASSIGNABLE_PLANS = {"free", "starter", "pro", "enterprise"}


class ReserveCompileBody(BaseModel):
    reservation_id: str = Field(..., min_length=1, max_length=256)
    plugin_id: str = Field(default="", max_length=128)
    workflow_id: str = Field(default="", max_length=128)
    session_id: str = Field(default="", max_length=128)


class ReservationBody(BaseModel):
    reservation_id: str = Field(..., min_length=1, max_length=256)


class RevokeMachineBody(BaseModel):
    machine_hash: str = Field(..., min_length=1, max_length=128)


class AssignPlanBody(BaseModel):
    workspace_id: str = Field(..., min_length=1, max_length=256)
    plan: str = Field(..., min_length=1, max_length=32)
    duration_days: int | None = Field(default=None, gt=0, le=3650)


@router.get("/entitlements/current")
def get_current_entitlements(request: Request) -> dict[str, Any]:
    try:
        return current_entitlements(current_principal(request))
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.post("/usage/compile/reserve")
def post_compile_reserve(body: ReserveCompileBody, request: Request) -> dict[str, Any]:
    try:
        principal = current_principal(request)
        register_request_machine(request, principal)
        return reserve_compile_credit(
            principal,
            reservation_id=body.reservation_id,
            plugin_id=body.plugin_id,
            workflow_id=body.workflow_id,
            session_id=body.session_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.post("/usage/compile/commit")
def post_compile_commit(body: ReservationBody, request: Request) -> dict[str, Any]:
    try:
        return commit_compile_credit(current_principal(request), body.reservation_id)
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.post("/usage/compile/release")
def post_compile_release(body: ReservationBody, request: Request) -> dict[str, Any]:
    try:
        return release_compile_credit(current_principal(request), body.reservation_id)
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.get("/entitlements/machines")
def get_registered_machines(request: Request) -> dict[str, Any]:
    """Settings' device list — what's consuming this workspace's machine limit."""
    principal = current_principal(request)
    require_admin(principal)
    return {"machines": list_machines(principal.workspace_id)}


@router.post("/entitlements/machines/revoke")
def post_revoke_machine(body: RevokeMachineBody, request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    revoke_machine(principal, body.machine_hash)
    return {"machine_hash": body.machine_hash, "revoked": True}


@router.post("/entitlements/admin/billing")
def post_assign_plan(body: AssignPlanBody, authorization: str = Header(default="")) -> dict[str, Any]:
    """Admin-only (Bearer CONXA_ADMIN_TOKEN). Manually sets a workspace's plan —
    for comps, sales demos, or support fixes outside the normal Cashfree
    checkout/webhook flow (see cashfree_routes.py). Bypasses payment; the
    caller is trusted to have a real reason.

    ``duration_days``, if given, time-boxes the grant: entitlements.normalize_plan
    reverts the workspace to "free" once ``plan_expires_at`` passes, with no
    downgrade job needed. Omit it for a permanent grant (also clears any prior
    expiry when re-assigning a workspace that previously had a timed grant)."""
    _require_admin(authorization)
    plan = body.plan.strip().lower()
    if plan not in _ASSIGNABLE_PLANS:
        raise HTTPException(status_code=400, detail=f"unknown_plan: must be one of {sorted(_ASSIGNABLE_PLANS)}")
    expires_at = int(time.time() + body.duration_days * 86400) if body.duration_days else None
    billing = upsert_billing(
        body.workspace_id,
        {"plan": plan, "status": "active", "plan_expires_at": expires_at},
    )
    return {
        "workspace_id": body.workspace_id,
        "plan": plan,
        "expires_at": expires_at,
        "limits": PLAN_LIMITS[plan],
        "billing": billing,
    }
