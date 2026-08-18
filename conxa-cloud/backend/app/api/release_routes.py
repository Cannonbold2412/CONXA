"""Release-management endpoints layered on top of publish_routes.py's publish
transaction: preview a candidate before publishing, inspect a published
release, diff it against its predecessor, roll the stable channel back to an
earlier release, and read deployment/audit state for a slug.

Nothing here writes a skill-pack artifact — that's exclusively publish_routes.
This module only ever reads immutable release snapshots, or (for rollback)
moves the channel pointer and refreshes the same mutable mirror publish
refreshes. See docs/Implementation-Plan.md §3.4 and the release-system plan.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from conxa_core.db import db_get, db_list, db_list_kv, db_set

from app.api.deps import current_principal
from app.api.product_ownership import _assert_owner, _owner_of, validate_installer_version
from app.api.publish_routes import PublishFile, _validate_rel_path, _validate_slug, _SEMVER_RE
from app.api.skillpack_storage import (
    read_release_snapshot,
    skillpack_versions_ns,
    write_mutable_mirror_files,
    write_pack_json_mirror,
)
from app.api.skillpack_update_routes import _STALE_RUNTIME_DAYS
from app.api.updates_routes import _COMPONENT_VERSIONS_NS, _MANIFEST_NS, _compose_manifest
from app.services import release_channel, release_diff
from app.services.rbac import require_admin
from app.services.saas import add_audit_event

router = APIRouter(prefix="/workflows", tags=["releases"])


class ReleasePreviewBody(BaseModel):
    version: str = Field(default="", max_length=32)
    skills: list[str] = Field(default_factory=list)
    skill_groups: dict[str, str] = Field(default_factory=dict)
    files: list[PublishFile] = Field(default_factory=list)


def _require_owned_slug(slug: str, request: Request):
    """Shared read-path guard for release routes: admin role + slug either
    unclaimed or owned by the caller's workspace. Does not claim the slug —
    only publish does that."""
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(slug)
    owner = _owner_of(slug)
    if owner and owner != principal.workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")
    return principal, slug


def _decode_preview_files(files: list[PublishFile]) -> dict[str, bytes]:
    import base64

    decoded: dict[str, bytes] = {}
    for f in files:
        rel = _validate_rel_path(f.path)
        try:
            decoded[rel] = base64.b64decode(f.content_base64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail=f"invalid_base64: {rel}") from exc
    return decoded


def _artifact_sha256(files: dict[str, bytes]) -> str:
    hasher = hashlib.sha256()
    for path in sorted(files):
        hasher.update(path.encode("utf-8"))
        hasher.update(b"\x00")
        hasher.update(files[path])
        hasher.update(b"\x00")
    return hasher.hexdigest()


def _version_row(slug: str, version: str) -> dict[str, Any] | None:
    row = db_get(skillpack_versions_ns(slug), version)
    return row if isinstance(row, dict) else None


@router.post("/{installer_version}/{company_slug}/releases/preview")
def post_release_preview(installer_version: str, company_slug: str, body: ReleasePreviewBody, request: Request) -> dict[str, Any]:
    """Everything the Release Center's "Release Candidate" + "What Will Change"
    sections need before the user clicks Publish — computed the exact same way
    publish itself computes it, so the numbers shown here never drift from what
    actually gets recorded once they do publish."""
    validate_installer_version(installer_version)
    principal, slug = _require_owned_slug(company_slug, request)

    decoded_files = _decode_preview_files(body.files)
    artifact_sha256 = _artifact_sha256(decoded_files)

    current_stable_version = release_channel.get_stable_version(slug)
    previous_row = _version_row(slug, current_stable_version) if current_stable_version else None
    previous_files = read_release_snapshot(slug, current_stable_version) if current_stable_version else {}

    diff = release_diff.compute_diff(
        previous_files,
        decoded_files,
        previous_skill_groups=(previous_row or {}).get("skill_groups") or {},
        candidate_skill_groups=dict(body.skill_groups),
    )

    proposed_version = body.version.strip()
    version_valid = bool(proposed_version) and bool(_SEMVER_RE.fullmatch(proposed_version))
    version_available = True
    if version_valid:
        existing = _version_row(slug, proposed_version)
        version_available = existing is None or existing.get("status", "published") == "pending"

    artifact_unchanged = bool(previous_row) and previous_row.get("artifact_sha256") == artifact_sha256

    return {
        "slug": slug,
        "previous_version": current_stable_version,
        "proposed_version": proposed_version or None,
        "version_valid": version_valid,
        "version_available": version_available,
        "artifact_sha256": artifact_sha256,
        "artifact_unchanged": artifact_unchanged,
        "diff": diff,
    }


@router.get("/{installer_version}/{company_slug}/releases/events")
def get_release_events(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    # Registered BEFORE /releases/{version} below — FastAPI matches routes in
    # registration order, and a single-segment static path here would
    # otherwise always lose to {version} capturing "events" as a version string.
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    return {"slug": slug, "events": release_channel.list_release_events(slug)}


@router.get("/{installer_version}/{company_slug}/releases/{version}")
def get_release_detail(installer_version: str, company_slug: str, version: str, request: Request) -> dict[str, Any]:
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    row = _version_row(slug, version)
    if row is None:
        raise HTTPException(status_code=404, detail="release_not_found")

    snapshot = read_release_snapshot(slug, version)
    files = [
        {"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
        for path, raw in sorted(snapshot.items())
    ]
    return {
        "slug": slug,
        "release": row,
        "is_stable": release_channel.get_stable_version(slug) == version,
        "files": files,
        "snapshot_available": bool(snapshot),
    }


@router.get("/{installer_version}/{company_slug}/releases/{version}/diff")
def get_release_diff(installer_version: str, company_slug: str, version: str, request: Request) -> dict[str, Any]:
    """Deterministic diff against the release immediately preceding this one in
    publish order (not channel order — a rollback shouldn't change what "the
    previous release" means for a version that's already published)."""
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    row = _version_row(slug, version)
    if row is None:
        raise HTTPException(status_code=404, detail="release_not_found")

    all_rows = [r for _k, r in db_list_kv(skillpack_versions_ns(slug)) if isinstance(r, dict) and r.get("status", "published") == "published"]
    all_rows.sort(key=lambda r: float(r.get("published_at") or 0))
    prior_row = None
    for r in all_rows:
        if float(r.get("published_at") or 0) < float(row.get("published_at") or 0):
            prior_row = r
        else:
            break

    curr_snapshot = read_release_snapshot(slug, version)
    if not curr_snapshot:
        return {"slug": slug, "available": False, "reason": "release_snapshot_unavailable", "version": version}

    prior_version = prior_row.get("version") if prior_row else None
    prior_snapshot = read_release_snapshot(slug, prior_version) if prior_version else {}
    if prior_version and not prior_snapshot:
        return {
            "slug": slug,
            "available": False,
            "reason": "previous_release_snapshot_unavailable",
            "version": version,
            "from_version": prior_version,
        }

    diff = release_diff.compute_diff(
        prior_snapshot,
        curr_snapshot,
        previous_skill_groups=(prior_row or {}).get("skill_groups") or {},
        candidate_skill_groups=row.get("skill_groups") or {},
    )
    return {"slug": slug, "available": True, "from_version": prior_version, "to_version": version, **diff}


@router.post("/{installer_version}/{company_slug}/releases/{version}/rollback")
def post_release_rollback(installer_version: str, company_slug: str, version: str, request: Request) -> dict[str, Any]:
    """Move the stable channel pointer back to an already-published release.
    Never rebuilds, copies, or mutates an artifact — see release_channel.py and
    the release-system plan §9."""
    validate_installer_version(installer_version)
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(company_slug)
    _assert_owner(slug, principal.workspace_id)
    version = str(version or "").strip()

    target_row = _version_row(slug, version)
    if target_row is None:
        raise HTTPException(status_code=404, detail="release_not_found")
    if target_row.get("status", "published") != "published":
        raise HTTPException(status_code=400, detail="release_not_published")

    current_stable_version = release_channel.get_stable_version(slug)
    if current_stable_version == version:
        raise HTTPException(status_code=400, detail="already_stable")

    snapshot = read_release_snapshot(slug, version)
    if not snapshot:
        raise HTTPException(status_code=409, detail="release_snapshot_unavailable")

    release_channel.record_release_event(
        principal, slug, release_channel.EVT_ROLLBACK_STARTED, metadata={"from": current_stable_version, "to": version}
    )

    # 1. Move the pointer — the single act of activation, same as publish.
    release_channel.set_stable_version(
        slug, version, set_by=principal.user_id, reason="rollback", from_version=current_stable_version
    )

    # 2. Restore the mutable "currently live" mirror from the immutable snapshot —
    #    no artifact is copied into a new location or rebuilt, just re-served.
    write_mutable_mirror_files(slug, snapshot)
    target_pack: dict[str, Any] = {}
    if snapshot.get("pack.json"):
        try:
            target_pack = json.loads(snapshot["pack.json"].decode("utf-8"))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            target_pack = {}
    pack_updates = {
        "skill_pack_version": version,
        "release_notes": target_row.get("release_notes", ""),
        "skills": target_row.get("skills") or target_pack.get("skills") or [],
        "skill_groups": target_row.get("skill_groups") or target_pack.get("skill_groups") or {},
        "published_at": target_row.get("published_at"),
    }
    write_pack_json_mirror(slug, pack_updates)

    # 3. Rewrite component_versions (what the runtime's delta compares against)
    #    for exactly the skills this release declared.
    skill_versions = target_row.get("skill_versions") or {s: version for s in (target_row.get("skills") or [])}
    released_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    index = db_get(_MANIFEST_NS, "skill_pack_index") or []
    index_changed = False
    for skill_slug, skill_version in skill_versions.items():
        identifier = f"{slug}:{skill_slug}"
        db_set(
            _COMPONENT_VERSIONS_NS,
            f"skill_packs:{slug}:{skill_slug}",
            {"version": skill_version, "released_at": released_at_iso, "files": []},
        )
        if identifier not in index:
            index.append(identifier)
            index_changed = True
    if index_changed:
        db_set(_MANIFEST_NS, "skill_pack_index", index)
    if skill_versions:
        _compose_manifest()

    # 4. is_latest now tracks the channel, not "most recently published".
    for _key, row in db_list_kv(skillpack_versions_ns(slug)):
        if not isinstance(row, dict):
            continue
        should_be_latest = row.get("version") == version
        if bool(row.get("is_latest")) != should_be_latest:
            row["is_latest"] = should_be_latest
            db_set(skillpack_versions_ns(slug), row.get("version"), row)

    add_audit_event(
        principal, "rollback", resource_type="skill_pack", resource_id=slug,
        metadata={"from": current_stable_version, "to": version},
    )
    release_channel.record_release_event(
        principal, slug, release_channel.EVT_CHANNEL_CHANGED,
        metadata={"channel": release_channel.STABLE, "from": current_stable_version, "to": version},
    )
    release_channel.record_release_event(
        principal, slug, release_channel.EVT_ROLLBACK_COMPLETED, metadata={"from": current_stable_version, "to": version}
    )

    return {"slug": slug, "rolled_back_to": version, "previous_stable": current_stable_version}


@router.get("/{installer_version}/{company_slug}/deployments")
def get_deployments(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    """Runtime deployment status for a slug, derived only from data the runtime
    actually reports (runtime_registrations) — never fabricated. A registration
    that predates skill-version reporting (an already-deployed runtime that
    hasn't self-updated yet) reads as "unknown", not "up to date"."""
    validate_installer_version(installer_version)
    principal, slug = _require_owned_slug(company_slug, request)

    desired_version = release_channel.get_stable_version(slug)
    stale_cutoff = time.time() - _STALE_RUNTIME_DAYS * 86400

    machines: list[dict[str, Any]] = []
    counts = {"up_to_date": 0, "pending": 0, "offline": 0, "unknown": 0}
    for reg in db_list("runtime_registrations"):
        if not isinstance(reg, dict) or reg.get("company") != slug or reg.get("workspace_id") != principal.workspace_id:
            continue
        installed = reg.get("skill_versions") if isinstance(reg.get("skill_versions"), dict) else None
        last_seen = float(reg.get("last_seen") or 0)
        is_offline = last_seen < stale_cutoff
        if is_offline:
            status = "offline"
        elif installed is None or desired_version is None:
            status = "unknown"
        elif installed and all(v == desired_version for v in installed.values()):
            status = "up_to_date"
        else:
            status = "pending"
        counts[status] += 1
        machines.append(
            {
                "machine_id": reg.get("install_id") or reg.get("platform") or "",
                "platform": reg.get("platform", ""),
                "runtime_version": reg.get("runtime_version", ""),
                "installed_skill_versions": installed,
                "desired_skill_version": desired_version,
                "status": status,
                "last_seen": last_seen,
                "last_sync": last_seen,
            }
        )
    machines.sort(key=lambda m: m["last_seen"], reverse=True)

    return {
        "slug": slug,
        "desired_version": desired_version,
        "machines": machines,
        "summary": {"total": len(machines), **counts},
    }
