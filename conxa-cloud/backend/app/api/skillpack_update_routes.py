"""Endpoints consumed by conxa-runtime.exe at startup for skill pack sync."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_list, db_list_kv, using_database
from app.services.saas import principal_from_request, ensure_principal

router = APIRouter(prefix="/skill-packs", tags=["skill-packs"])

_STALE_RUNTIME_DAYS = 30

# Rate limiter: {token_prefix: last_request_ts}
_rate_cache: dict[str, float] = {}
_RATE_LIMIT_SECONDS = 300  # 5 minutes between sync requests per token


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip() or None
    return None


def _rate_limit_key(token: str) -> str:
    # Use first 16 chars of token hash as key — avoids storing full tokens
    return hashlib.sha256(token.encode()).hexdigest()[:16]


def _check_rate_limit(token: str) -> None:
    key = _rate_limit_key(token)
    last = _rate_cache.get(key, 0.0)
    if time.time() - last < _RATE_LIMIT_SECONDS:
        raise HTTPException(
            status_code=429,
            detail="Too many sync requests. Wait 5 minutes between syncs.",
            headers={"Retry-After": str(int(_RATE_LIMIT_SECONDS - (time.time() - last)))},
        )
    _rate_cache[key] = time.time()


def _verify_sync_token(company: str, token: str | None) -> None:
    """Validate the Bearer token against the per-company sync_token.

    In production (SKILL_AUTH_REQUIRED=true) a valid sync token is required.
    The sync token is minted at publish time and embedded in the installer's
    pack.json — end users never need a Conxa login.

    In local dev (auth_required=false) validation is skipped so the Build
    Studio can sync without a published token.
    """
    if not settings.auth_required:
        return
    stored = db_get("sync_tokens", company)
    if not isinstance(stored, dict) or not stored.get("token"):
        raise HTTPException(status_code=401, detail="sync_token_not_configured")
    if not token or not secrets.compare_digest(str(stored["token"]), token):
        raise HTTPException(status_code=401, detail="invalid_sync_token")


def _skill_packs_dir(company: str) -> Path:
    return settings.data_dir / "skill-packs" / company


def _skillpack_files_ns(company: str) -> str:
    return f"skillpack_files__{company}"


def _ensure_skill_pack_on_disk(company: str) -> None:
    """Rehydrate the local skill-pack cache from Postgres if the disk was wiped.

    Render's free plan has no persistent disk and idles out, so the files written by
    publish_routes.post_publish can vanish between runtime sync requests. Postgres
    (written at publish time under the same namespace) is the durable source of truth.
    """
    if not using_database():
        return
    pack_path = _skill_packs_dir(company) / "pack.json"
    if pack_path.is_file():
        return
    rows = db_list_kv(_skillpack_files_ns(company))
    if not rows:
        return
    packs_dir = _skill_packs_dir(company)
    for rel, value in rows:
        if not isinstance(value, dict) or not value.get("content_base64"):
            continue
        target = packs_dir / str(value.get("path") or rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(value["content_base64"]))


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def _pack_version(company: str) -> str:
    pack_path = _skill_packs_dir(company) / "pack.json"
    if not pack_path.is_file():
        return "0"
    try:
        return json.loads(pack_path.read_text(encoding="utf-8")).get("skill_pack_version", "0")
    except Exception:
        return "0"


def _skill_version(company: str, slug: str) -> str:
    """Each skill's own version, recorded independently in component_versions KV at
    publish time (see publish_routes.post_publish). Falls back to the shared pack-level
    version for skill packs published before independent per-skill versioning existed,
    so old publishes don't regress to "always changed"."""
    rec = db_get("component_versions", f"skill_packs:{company}:{slug}")
    if isinstance(rec, dict) and rec.get("version"):
        return str(rec["version"])
    return _pack_version(company)


def _build_delta(company: str, since_map: dict[str, str]) -> dict[str, Any]:
    """Per-skill delta: each skill in the pack is compared independently against the
    client's last-known version for that specific skill, so only the skills that
    actually changed are shipped — never the whole company just because one skill
    was republished."""
    _ensure_skill_pack_on_disk(company)
    packs_dir = _skill_packs_dir(company)
    pack_path = packs_dir / "pack.json"
    if not pack_path.is_file():
        raise HTTPException(status_code=404, detail=f"Skill pack not found: {company}")
    pack = json.loads(pack_path.read_text(encoding="utf-8"))

    skills_out: list[dict[str, Any]] = []
    for slug in pack.get("skills", []):
        current_version = _skill_version(company, slug)
        client_version = since_map.get(slug, "0")
        skill_dir = packs_dir / slug

        if current_version == client_version or not skill_dir.is_dir():
            skills_out.append({"name": slug, "action": "no_change"})
            continue

        files: list[dict[str, Any]] = []
        for fname in ("execution.json", "recovery.json", "inputs.json", "manifest.json", "validation.json"):
            fpath = skill_dir / fname
            if not fpath.is_file():
                continue
            files.append({
                "path": fname,
                "sha256": _sha256_file(fpath),
                "content_base64": base64.b64encode(fpath.read_bytes()).decode("ascii"),
            })
        skills_out.append({"name": slug, "version": current_version, "action": "update", "files": files})

    return {"skills": skills_out}


@router.get("/{company}/delta")
def get_skill_pack_delta(company: str, since: str = "{}", request: Request = None) -> dict[str, Any]:
    """Return per-skill deltas for skills whose version differs from the client's
    last-known version for that specific skill.

    `since` is a JSON-encoded map of {skill_slug: last_known_version}, letting each
    skill be compared and shipped independently instead of one shared pack version.

    Authentication: Bearer token must match the per-company sync_token minted
    at publish time and embedded in the installer's pack.json.
    Rate limited: 1 request per 5 minutes per token.
    """
    token = _extract_token(request) if request else None
    _verify_sync_token(company, token)
    if token:
        _check_rate_limit(token)
    try:
        since_map = json.loads(since) if since else {}
        if not isinstance(since_map, dict):
            since_map = {}
    except (json.JSONDecodeError, TypeError):
        since_map = {}
    return _build_delta(company, {str(k): str(v) for k, v in since_map.items()})


# ─── Telemetry ────────────────────────────────────────────────────────────────

class TelemetryBody(BaseModel):
    runtime_version: str = ""
    companies: list[str] = []
    platform: str = ""
    install_id: str = ""


telemetry_router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@telemetry_router.post("/runtime-start")
def post_telemetry_runtime_start(body: TelemetryBody) -> dict[str, Any]:
    """Non-critical. Records device registrations for ops visibility.

    Public endpoint — installed runtimes have no Clerk session.
    Workspace is derived from the per-company sync_token KV entry (set at publish time).
    Spoofing inflates counts but leaks nothing.
    """
    now = time.time()
    companies = [c.strip() for c in (body.companies or []) if c.strip()]
    platform = (body.platform or "").strip() or "unknown"
    install_id = "".join(c for c in (body.install_id or "").strip() if c.isalnum() or c in "-_")[:96]

    for company in companies:
        workspace_id = ""
        stored_token = db_get("sync_tokens", company)
        if isinstance(stored_token, dict):
            workspace_id = str(stored_token.get("workspace_id") or "")

        key = f"{company}:{install_id or platform}"
        existing = db_get("runtime_registrations", key) or {}
        db_set(
            "runtime_registrations",
            key,
            {
                "company": company,
                "install_id": install_id,
                "platform": platform,
                "runtime_version": (body.runtime_version or "").strip(),
                "workspace_id": workspace_id,
                "last_seen": now,
                "first_seen": existing.get("first_seen", now),
            },
        )

    return {"ok": True}


@telemetry_router.get("/runtimes")
def get_runtime_registrations(request: Request) -> dict[str, Any]:
    """Return runtime device registrations for the authenticated workspace.

    Filters to the caller's workspace; flags runtimes not seen in 30 days.
    """
    principal = principal_from_request(request)
    ensure_principal(principal)

    stale_cutoff = time.time() - _STALE_RUNTIME_DAYS * 86400
    all_regs = db_list("runtime_registrations")

    registrations = []
    version_counts: dict[str, int] = {}
    stale_count = 0

    for reg in all_regs:
        if not isinstance(reg, dict):
            continue
        if reg.get("workspace_id") != principal.workspace_id:
            continue
        is_stale = reg.get("last_seen", 0) < stale_cutoff
        if is_stale:
            stale_count += 1
        v = reg.get("runtime_version") or "unknown"
        version_counts[v] = version_counts.get(v, 0) + 1
        registrations.append({**reg, "stale": is_stale})

    registrations.sort(key=lambda r: r.get("last_seen", 0), reverse=True)
    return {
        "registrations": registrations,
        "stale_count": stale_count,
        "version_distribution": version_counts,
    }
