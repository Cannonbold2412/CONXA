"""Telemetry ingestion and query routes for company-scoped tracking.

POST /api/tracking/{company}/events     — called by runtime, HMAC-authenticated
POST /api/v1/tracking/{company}/events  — same ingest endpoint for v1 API bases
GET  /api/v1/tracking/{company}/runs    — paginated run summaries (Clerk-authenticated)
GET  /api/v1/tracking/{company}/runs/{run_id} — single run event timeline

Aggregation logic lives in ``app.services.tracking``.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from conxa_core.db import db_append, db_get, db_list_kv
from app.api.deps import current_principal, entitlement_http_error
from app.api.product_ownership import validate_installer_version
from app.services.entitlements import ensure_ops_tier
from app.services.rbac import require_admin
from app.services.saas import Principal
from app.services.tracking import (
    _batches_for_principal,
    _cap_events,
    _drift_review_queue,
    _pre_exec_drift_queue,
    _run_summary,
    _tracking_company_rows,
    _tracking_diagnostics,
    _verify_token,
    _visible_run_records,
)
from app.services import tracking_analytics

router = APIRouter(prefix="/tracking", tags=["tracking"])
public_router = APIRouter(prefix="/api/tracking", tags=["tracking"])
# Versioned equivalent of the ingest route below, nested under /workflows — see
# publish_routes.py for the sibling publish/installer-upload/delta endpoints.
versioned_router = APIRouter(prefix="/workflows", tags=["tracking"])


async def _ingest_events_impl(workspace_id: str, request: Request) -> dict[str, Any]:
    """Accept a compact event batch from the runtime. Fast 202 — never blocks execution."""
    token = request.headers.get("x-tracking-token", "")
    token_record = _verify_token(workspace_id, token)
    if token_record is None:
        raise HTTPException(status_code=401, detail="invalid_tracking_token")

    body = await request.json()

    run_id = body.get("rid", "")
    if not run_id:
        return {"ok": True}  # drop malformed batches silently

    evts = body.get("evts", [])
    if not isinstance(evts, list):
        evts = []
    capped_evts = _cap_events(evts, workspace_id)

    enriched: dict[str, Any] = {
        "run_id":      run_id,
        "company":     workspace_id,
        "workflow_id":  body.get("wfid", ""),
        "workflow_ver": body.get("wfv", ""),
        "runtime_ver": body.get("rv", ""),
        "uid":         body.get("uid", ""),
        "wid":         body.get("wid", ""),
        "workspace_id": token_record.get("workspace_id", ""),
        "owner_user_id": token_record.get("owner_user_id", ""),
        "server_ts":   time.time(),
        "events":      capped_evts,
        "schema_v":    body.get("sv", 1),
    }
    db_append(f"tracking/{workspace_id}", run_id, [enriched])
    return {"ok": True}


@public_router.post("/{workspace_id}/events", status_code=202)
@router.post("/{workspace_id}/events", status_code=202)
async def ingest_events(workspace_id: str, request: Request) -> dict[str, Any]:
    """Legacy ingest route, served at both the bare ``/api/tracking/...`` path
    (permanent back-compat alias, not a bug — see CLAUDE.md Key Invariants) and
    ``/api/v1/tracking/...``. See ``ingest_events_v2`` for the versioned,
    workspace-scoped-by-installer-generation equivalent."""
    return await _ingest_events_impl(workspace_id, request)


@versioned_router.post("/{installer_version}/{workspace_id}/tracking/events", status_code=202)
async def ingest_events_v2(installer_version: str, workspace_id: str, request: Request) -> dict[str, Any]:
    validate_installer_version(installer_version)
    return await _ingest_events_impl(workspace_id, request)



def _ensure_dashboard_access(principal: Principal) -> None:
    """Free's ops_tier is "none" — the pilot feedback's own reasoning for why:
    Free has zero analytics retention, so there'd be nothing to show anyway."""
    try:
        ensure_ops_tier(principal, "basic")
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc


@router.get("/companies")
def list_tracking_companies(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return companies with workspace-visible tracking or workflow metadata.

    Not ops_tier-gated — this is a lightweight workspace-scoped lookup used by
    navigation (e.g. Workflows, publish flows), not analytics content."""
    companies = _tracking_company_rows(principal)
    return {
        "companies": companies,
        "total": len(companies),
        "workspace_id": principal.workspace_id,
    }


@router.get("/diagnostics")
def tracking_diagnostics(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return safe workspace-scoping diagnostics for dashboard visibility.

    Not ops_tier-gated — this reports scoping/auth health, not analytics content."""
    return _tracking_diagnostics(principal)


@router.get("/dashboard")
def tracking_dashboard(
    range: str = "7d",
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the full operations payload: adoption, reliability, recovery, health, ROI, insights.

    Accepts ``24h``, ``7d``, ``30d``, ``90d``; anything else falls back to ``7d``.
    """
    _ensure_dashboard_access(principal)
    return tracking_analytics.dashboard(principal, range)


@router.get("/activity")
def tracking_activity(
    limit: int = 50,
    before: int | None = None,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return recent runs across every visible company for the live activity feed."""
    _ensure_dashboard_access(principal)
    return tracking_analytics.activity_feed(principal, limit=limit, before=before)


@router.get("/roi-assumptions")
def get_roi_assumptions(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the workspace's ROI assumptions, defaulted where unset."""
    _ensure_dashboard_access(principal)
    return tracking_analytics.read_assumptions(principal.workspace_id)


@router.put("/roi-assumptions")
def put_roi_assumptions(
    payload: dict[str, Any],
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Update the workspace's ROI assumptions. Admin only — this drives a reported figure."""
    require_admin(principal)
    _ensure_dashboard_access(principal)
    return tracking_analytics.write_assumptions(
        principal.workspace_id, payload, user_id=principal.user_id
    )


@router.get("/workflows/{company}/{slug}")
def tracking_workflow_detail(
    company: str,
    slug: str,
    range: str = "7d",
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return step-level analytics for a single skill."""
    _ensure_dashboard_access(principal)
    return tracking_analytics.workflow_detail(principal, company, slug, range)


@router.get("/drift")
def tracking_drift_queue(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the admin drift-review queue derived from runtime repair_event signals.

    Surfaces detected drift for manual review only — publishing a re-signed version is
    always an explicit admin action, never automatic. Drift detection is a "full"
    ops_tier capability (Pro/Enterprise) — see docs/PRD.md §11's capability ladder.
    """
    try:
        ensure_ops_tier(principal, "full")
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc
    records = _visible_run_records(principal)
    queue = _drift_review_queue(records)
    pre_exec = _pre_exec_drift_queue(records)
    return {
        "queue": queue,
        "total": len(queue),
        "pre_exec": pre_exec,
        "pre_exec_total": len(pre_exec),
    }


@router.get("/{workspace_id}/runs")
def list_runs(
    workspace_id: str,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return paginated run summaries for a workspace."""
    _ensure_dashboard_access(principal)
    pairs = db_list_kv(f"tracking/{workspace_id}")
    summaries = []
    hidden_workspace_runs = 0
    for run_id, batches in pairs:
        scoped = _batches_for_principal(batches, principal)
        if scoped:
            summaries.append(_run_summary(run_id, scoped))
        else:
            hidden_workspace_runs += 1

    # newest first by server_ts
    summaries.sort(key=lambda s: s.get("server_ts", 0), reverse=True)
    return {
        "runs": summaries[offset : offset + limit],
        "total": len(summaries),
        "workspace_id": principal.workspace_id,
        "total_all_workspaces": len(pairs),
        "hidden_workspace_runs": hidden_workspace_runs,
    }


@router.get("/{workspace_id}/runs/{run_id}")
def get_run_timeline(
    workspace_id: str,
    run_id: str,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the flattened event timeline for a single run."""
    _ensure_dashboard_access(principal)
    data = db_get(f"tracking/{workspace_id}", run_id)
    if not data:
        raise HTTPException(status_code=404, detail="run_not_found")

    batches = _batches_for_principal(data, principal)
    if not batches:
        raise HTTPException(status_code=404, detail="run_not_found_for_workspace")
    events: list[dict] = []
    for b in batches:
        events.extend(b.get("events", []))
    events.sort(key=lambda e: e.get("ts", 0))

    meta = batches[-1] if batches else {}
    summary = _run_summary(run_id, batches)
    return {
        "run_id":      run_id,
        "company":     workspace_id,
        "workflow_id":  meta.get("workflow_id", ""),
        "workflow_ver": meta.get("workflow_ver", ""),
        "runtime_ver": meta.get("runtime_ver", ""),
        "uid":         meta.get("uid", ""),
        "wid":         meta.get("wid", ""),
        "workspace_id": meta.get("workspace_id", ""),
        "timeline":    events,
        "summary":     summary,
        # Step-by-step outcome, derived server-side so the run view and the dashboard
        # aggregates classify recoveries the same way.
        "steps": tracking_analytics.run_step_flow(
            {"company": workspace_id, "summary": summary, "events": events}
        ),
    }
