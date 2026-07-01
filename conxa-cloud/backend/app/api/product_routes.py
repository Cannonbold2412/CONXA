"""SaaS product API: identity, workspaces, dashboard, billing, releases, audit."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from conxa_core.config import settings
from app.services.rbac import require_admin
from app.services.saas import (
    Principal,
    audit_events_for,
    billing_for,
    dashboard_for,
    ensure_principal,
    principal_from_request,
    release_for,
    update_release,
    usage_for,
)
from conxa_core.storage.skill_packages import bundle_root_dir

router = APIRouter(tags=["product"])


def current_principal(request: Request) -> Principal:
    principal = principal_from_request(request)
    ensure_principal(principal)
    return principal


class ReleasePatchBody(BaseModel):
    state: str | None = Field(default=None, pattern="^(draft|published|archived)$")
    version: str | None = Field(default=None, min_length=1, max_length=64)
    release_notes: str | None = Field(default=None, max_length=20_000)


def _require_bundle(bundle_slug: str) -> None:
    root = bundle_root_dir(bundle_slug)
    if root is None or not root.is_dir():
        raise HTTPException(status_code=404, detail="package_bundle_not_found")


@router.get("/me")
def get_me(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {
        "user": principal.public_user(),
        "workspace": principal.public_workspace(),
        "auth_required": settings.auth_required,
        "identity_source": principal.identity_source,
        "proxy_identity_trusted": principal.proxy_identity_trusted,
        "proxy_identity_status": principal.proxy_identity_status,
        "clerk_secret_key_configured": bool(settings.clerk_secret_key.strip()),
    }


@router.get("/workspaces/current")
def get_current_workspace(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"workspace": principal.public_workspace()}


@router.get("/dashboard")
def get_dashboard(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
    return dashboard_for(principal)


@router.get("/usage")
def get_usage(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
    return usage_for(principal)


@router.get("/billing/subscription")
def get_subscription(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
    return {"subscription": billing_for(principal)}


@router.patch("/packages/bundles/{bundle_slug}/release")
def patch_bundle_release(
    bundle_slug: str,
    body: ReleasePatchBody,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    require_admin(principal)
    _require_bundle(bundle_slug)
    patch = body.model_dump(exclude_none=True)
    if patch.get("state") == "published":
        patch.setdefault("published_by", principal.user_id)
        patch.setdefault("published_at", time.time())
        patch.setdefault("archived_at", None)
    if patch.get("state") == "archived":
        patch.setdefault("archived_at", time.time())
    release = update_release(principal, bundle_slug, patch)
    return {"release": release}


@router.get("/packages/bundles/{bundle_slug}/release")
def get_bundle_release(
    bundle_slug: str,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    _require_bundle(bundle_slug)
    return {"release": release_for(principal, bundle_slug)}


@router.get("/audit-events")
def list_audit_events(
    limit: int = 100,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    return {"audit_events": audit_events_for(principal, limit=limit)}
