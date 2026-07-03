"""Current entitlement meters and compile-credit reservation endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.api.deps import current_principal, entitlement_http_error
from app.services.entitlements import (
    commit_compile_credit,
    current_entitlements,
    release_compile_credit,
    reserve_compile_credit,
)

router = APIRouter(tags=["entitlements"])


class ReserveCompileBody(BaseModel):
    reservation_id: str = Field(..., min_length=1, max_length=256)
    plugin_id: str = Field(default="", max_length=128)
    workflow_id: str = Field(default="", max_length=128)
    session_id: str = Field(default="", max_length=128)


class ReservationBody(BaseModel):
    reservation_id: str = Field(..., min_length=1, max_length=256)


@router.get("/entitlements/current")
def get_current_entitlements(request: Request) -> dict[str, Any]:
    try:
        return current_entitlements(current_principal(request))
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.post("/usage/compile/reserve")
def post_compile_reserve(body: ReserveCompileBody, request: Request) -> dict[str, Any]:
    try:
        return reserve_compile_credit(
            current_principal(request),
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
