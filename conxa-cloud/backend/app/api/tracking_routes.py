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
from app.api.deps import current_principal
from app.api.product_ownership import validate_installer_version
from app.services.saas import Principal
from app.services.tracking import (
    _batches_for_principal,
    _cap_events,
    _dashboard_metrics,
    _drift_review_queue,
    _pre_exec_drift_queue,
    _run_summary,
    _tracking_company_rows,
    _tracking_diagnostics,
    _verify_token,
    _visible_run_records,
)

router = APIRouter(prefix="/tracking", tags=["tracking"])
public_router = APIRouter(prefix="/api/tracking", tags=["tracking"])
# Versioned equivalent of the ingest route below, nested under /plugins — see
# publish_routes.py for the sibling publish/installer-upload/delta endpoints.
versioned_router = APIRouter(prefix="/plugins", tags=["tracking"])


async def _ingest_events_impl(company: str, request: Request) -> dict[str, Any]:
    """Accept a compact event batch from the runtime. Fast 202 — never blocks execution."""
    token = request.headers.get("x-tracking-token", "")
    token_record = _verify_token(company, token)
    if token_record is None:
        raise HTTPException(status_code=401, detail="invalid_tracking_token")

    body = await request.json()

    run_id = body.get("rid", "")
    if not run_id:
        return {"ok": True}  # drop malformed batches silently

    evts = body.get("evts", [])
    if not isinstance(evts, list):
        evts = []
    capped_evts = _cap_events(evts, company)

    enriched: dict[str, Any] = {
        "run_id":      run_id,
        "company":     company,
        "plugin_id":   body.get("pid", ""),
        "plugin_ver":  body.get("pv", ""),
        "runtime_ver": body.get("rv", ""),
        "uid":         body.get("uid", ""),
        "wid":         body.get("wid", ""),
        "workspace_id": token_record.get("workspace_id", ""),
        "owner_user_id": token_record.get("owner_user_id", ""),
        "server_ts":   time.time(),
        "events":      capped_evts,
        "schema_v":    body.get("sv", 1),
    }
    db_append(f"tracking/{company}", run_id, [enriched])
    return {"ok": True}


@public_router.post("/{company}/events", status_code=202)
@router.post("/{company}/events", status_code=202)
async def ingest_events(company: str, request: Request) -> dict[str, Any]:
    """Legacy ingest route, served at both the bare ``/api/tracking/...`` path
    (permanent back-compat alias, not a bug — see CLAUDE.md Key Invariants) and
    ``/api/v1/tracking/...``. See ``ingest_events_v2`` for the versioned,
    company-scoped-by-installer-generation equivalent."""
    return await _ingest_events_impl(company, request)


@versioned_router.post("/{installer_version}/{company}/tracking/events", status_code=202)
async def ingest_events_v2(installer_version: str, company: str, request: Request) -> dict[str, Any]:
    validate_installer_version(installer_version)
    return await _ingest_events_impl(company, request)



@router.get("/companies")
def list_tracking_companies(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return companies with workspace-visible tracking or plugin metadata."""
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
    """Return safe workspace-scoping diagnostics for dashboard visibility."""
    return _tracking_diagnostics(principal)


@router.get("/dashboard")
def tracking_dashboard(
    range: str = "7d",
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return workspace-scoped adoption, reliability, and recovery aggregates."""
    return _dashboard_metrics(principal, range)


@router.get("/drift")
def tracking_drift_queue(
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the admin drift-review queue derived from runtime repair_event signals.

    Surfaces detected drift for manual review only — publishing a re-signed version is
    always an explicit admin action, never automatic.
    """
    records = _visible_run_records(principal)
    queue = _drift_review_queue(records)
    pre_exec = _pre_exec_drift_queue(records)
    return {
        "queue": queue,
        "total": len(queue),
        "pre_exec": pre_exec,
        "pre_exec_total": len(pre_exec),
    }


@router.get("/{company}/runs")
def list_runs(
    company: str,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return paginated run summaries for a company."""
    pairs = db_list_kv(f"tracking/{company}")
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


@router.get("/{company}/runs/{run_id}")
def get_run_timeline(
    company: str,
    run_id: str,
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Return the flattened event timeline for a single run."""
    data = db_get(f"tracking/{company}", run_id)
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
    return {
        "run_id":      run_id,
        "company":     company,
        "plugin_id":   meta.get("plugin_id", ""),
        "plugin_ver":  meta.get("plugin_ver", ""),
        "runtime_ver": meta.get("runtime_ver", ""),
        "uid":         meta.get("uid", ""),
        "wid":         meta.get("wid", ""),
        "workspace_id": meta.get("workspace_id", ""),
        "timeline":    events,
    }
