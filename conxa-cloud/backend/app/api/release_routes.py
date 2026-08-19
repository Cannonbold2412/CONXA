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
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from conxa_core.db import db_get, db_list, db_list_kv, db_set

from app.api.deps import current_principal
from app.api.product_ownership import (
    _assert_not_owned_by_other,
    _assert_owner,
    _claim_owner,
    _owner_of,
    validate_installer_version,
)
from app.api.publish_routes import PublishFile, _validate_rel_path, _validate_slug, _SEMVER_RE
from app.api.skillpack_storage import (
    list_known_groups,
    list_known_skills,
    read_pack_json_mirror,
    read_release_snapshot,
    record_known_group,
    skillpack_versions_ns,
    write_mutable_mirror_files,
    write_pack_json_mirror,
)
from conxa_core.storage.skill_pack_store import get_skill_pack_by_slug, upsert_skill_pack_by_slug
from app.api.skillpack_update_routes import _STALE_RUNTIME_DAYS
from app.api.updates_routes import _COMPONENT_VERSIONS_NS, _MANIFEST_NS, _compose_manifest
from app.services import release_channel, release_diff
from app.services.rbac import require_admin
from app.services.saas import add_audit_event

router = APIRouter(prefix="/workflows", tags=["releases"])


class ReleasePreviewBody(BaseModel):
    version: str = Field(default="", max_length=32)
    skill_slug: str = Field(..., min_length=1, max_length=64)
    group_id: str = Field(default="", max_length=64)
    files: list[PublishFile] = Field(default_factory=list)


class UpsertGroupBody(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=128)
    company_name: str = Field(default="", max_length=128)


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


def _version_row(slug: str, skill_slug: str, version: str) -> dict[str, Any] | None:
    row = db_get(skillpack_versions_ns(slug, skill_slug), version)
    return row if isinstance(row, dict) else None


@router.post("/{installer_version}/{company_slug}/releases/preview")
def post_release_preview(installer_version: str, company_slug: str, body: ReleasePreviewBody, request: Request) -> dict[str, Any]:
    """Everything the Release Center's "Release Candidate" + "What Will Change"
    sections need before the user clicks Publish — computed the exact same way
    publish itself computes it, so the numbers shown here never drift from what
    actually gets recorded once they do publish. Scoped to one skill: the
    diff, previous version, and duplicate/no-op checks are all against that
    skill's own history only."""
    validate_installer_version(installer_version)
    principal, slug = _require_owned_slug(company_slug, request)
    skill_slug = body.skill_slug.strip()
    if not skill_slug:
        raise HTTPException(status_code=400, detail="skill_slug_required")

    decoded_files = _decode_preview_files(body.files)
    artifact_sha256 = _artifact_sha256(decoded_files)

    current_stable_version = release_channel.get_stable_version(slug, skill_slug)
    previous_row = _version_row(slug, skill_slug, current_stable_version) if current_stable_version else None
    previous_files = read_release_snapshot(slug, skill_slug, current_stable_version) if current_stable_version else {}

    group_id = body.group_id.strip()
    diff = release_diff.compute_diff(
        previous_files,
        decoded_files,
        previous_skill_groups={skill_slug: (previous_row or {}).get("group_id", "")} if previous_row else {},
        candidate_skill_groups={skill_slug: group_id} if group_id else {},
    )

    proposed_version = body.version.strip()
    version_valid = bool(proposed_version) and bool(_SEMVER_RE.fullmatch(proposed_version))
    version_available = True
    if version_valid:
        existing = _version_row(slug, skill_slug, proposed_version)
        version_available = existing is None or existing.get("status", "published") == "pending"

    artifact_unchanged = bool(previous_row) and previous_row.get("artifact_sha256") == artifact_sha256

    return {
        "slug": slug,
        "skill_slug": skill_slug,
        "previous_version": current_stable_version,
        "proposed_version": proposed_version or None,
        "version_valid": version_valid,
        "version_available": version_available,
        "artifact_sha256": artifact_sha256,
        "artifact_unchanged": artifact_unchanged,
        "diff": diff,
    }


@router.get("/{installer_version}/{company_slug}/releases/events")
def get_release_events(installer_version: str, company_slug: str, skill_slug: str, request: Request) -> dict[str, Any]:
    # Registered BEFORE /releases/{version} below — FastAPI matches routes in
    # registration order, and a single-segment static path here would
    # otherwise always lose to {version} capturing "events" as a version string.
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    return {"slug": slug, "skill_slug": skill_slug, "events": release_channel.list_release_events(slug, skill_slug)}


@router.get("/{installer_version}/{company_slug}/releases/{version}")
def get_release_detail(
    installer_version: str, company_slug: str, version: str, skill_slug: str, request: Request
) -> dict[str, Any]:
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    row = _version_row(slug, skill_slug, version)
    if row is None:
        raise HTTPException(status_code=404, detail="release_not_found")

    snapshot = read_release_snapshot(slug, skill_slug, version)
    files = [
        {"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
        for path, raw in sorted(snapshot.items())
    ]
    return {
        "slug": slug,
        "skill_slug": skill_slug,
        "release": row,
        "is_stable": release_channel.get_stable_version(slug, skill_slug) == version,
        "files": files,
        "snapshot_available": bool(snapshot),
    }


@router.get("/{installer_version}/{company_slug}/releases/{version}/diff")
def get_release_diff(
    installer_version: str, company_slug: str, version: str, skill_slug: str, request: Request
) -> dict[str, Any]:
    """Deterministic diff against the release immediately preceding this one in
    this skill's own publish order (not channel order — a rollback shouldn't
    change what "the previous release" means for a version that's already
    published). A sibling skill's releases are never part of this scan."""
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)
    row = _version_row(slug, skill_slug, version)
    if row is None:
        raise HTTPException(status_code=404, detail="release_not_found")

    all_rows = [
        r for _k, r in db_list_kv(skillpack_versions_ns(slug, skill_slug))
        if isinstance(r, dict) and r.get("status", "published") == "published"
    ]
    all_rows.sort(key=lambda r: float(r.get("published_at") or 0))
    prior_row = None
    for r in all_rows:
        if float(r.get("published_at") or 0) < float(row.get("published_at") or 0):
            prior_row = r
        else:
            break

    curr_snapshot = read_release_snapshot(slug, skill_slug, version)
    if not curr_snapshot:
        return {"slug": slug, "available": False, "reason": "release_snapshot_unavailable", "version": version}

    prior_version = prior_row.get("version") if prior_row else None
    prior_snapshot = read_release_snapshot(slug, skill_slug, prior_version) if prior_version else {}
    if prior_version and not prior_snapshot:
        return {
            "slug": slug,
            "available": False,
            "reason": "previous_release_snapshot_unavailable",
            "version": version,
            "from_version": prior_version,
        }

    prior_group_id = (prior_row or {}).get("group_id", "")
    curr_group_id = row.get("group_id", "")
    diff = release_diff.compute_diff(
        prior_snapshot,
        curr_snapshot,
        previous_skill_groups={skill_slug: prior_group_id} if prior_group_id else {},
        candidate_skill_groups={skill_slug: curr_group_id} if curr_group_id else {},
    )
    return {"slug": slug, "skill_slug": skill_slug, "available": True, "from_version": prior_version, "to_version": version, **diff}


@router.post("/{installer_version}/{company_slug}/releases/{version}/rollback")
def post_release_rollback(
    installer_version: str, company_slug: str, version: str, skill_slug: str, request: Request
) -> dict[str, Any]:
    """Move ONE skill's stable channel pointer back to an already-published
    release of that same skill. Never rebuilds, copies, or mutates an
    artifact — see release_channel.py and the release-system plan §9. Scoped
    end-to-end to (slug, skill_slug): no other skill's channel, live files, or
    component_versions entry is ever touched by rolling this one back."""
    validate_installer_version(installer_version)
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(company_slug)
    _assert_owner(slug, principal.workspace_id)
    version = str(version or "").strip()
    skill_slug = str(skill_slug or "").strip()
    if not skill_slug:
        raise HTTPException(status_code=400, detail="skill_slug_required")

    target_row = _version_row(slug, skill_slug, version)
    if target_row is None:
        raise HTTPException(status_code=404, detail="release_not_found")
    if target_row.get("status", "published") != "published":
        raise HTTPException(status_code=400, detail="release_not_published")

    current_stable_version = release_channel.get_stable_version(slug, skill_slug)
    if current_stable_version == version:
        raise HTTPException(status_code=400, detail="already_stable")

    snapshot = read_release_snapshot(slug, skill_slug, version)
    if not snapshot:
        raise HTTPException(status_code=409, detail="release_snapshot_unavailable")

    release_channel.record_release_event(
        principal, slug, skill_slug, release_channel.EVT_ROLLBACK_STARTED,
        metadata={"from": current_stable_version, "to": version},
    )

    # 1. Move the pointer — the single act of activation, same as publish.
    release_channel.set_stable_version(
        slug, skill_slug, version, set_by=principal.user_id, reason="rollback", from_version=current_stable_version
    )

    # 2. Restore the mutable "currently live" mirror from the immutable snapshot —
    #    no artifact is copied into a new location or rebuilt, just re-served.
    #    `snapshot` is only this skill's own files (never pack.json — see
    #    skillpack_storage.write_release_snapshot), so company-level pack.json
    #    fields (target_url, tracking, other skills' entries) are untouched.
    write_mutable_mirror_files(slug, snapshot)

    # 3. Rewrite this skill's own component_versions entry (what the runtime's
    #    delta compares against) — no other skill's entry is touched.
    released_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    index = db_get(_MANIFEST_NS, "skill_pack_index") or []
    identifier = f"{slug}:{skill_slug}"
    db_set(
        _COMPONENT_VERSIONS_NS,
        f"skill_packs:{slug}:{skill_slug}",
        {"version": version, "released_at": released_at_iso, "files": []},
    )
    if identifier not in index:
        index.append(identifier)
        db_set(_MANIFEST_NS, "skill_pack_index", index)
    _compose_manifest()

    # 4. is_latest now tracks the channel, not "most recently published" —
    #    scoped to this skill's own version history only.
    for _key, row in db_list_kv(skillpack_versions_ns(slug, skill_slug)):
        if not isinstance(row, dict):
            continue
        should_be_latest = row.get("version") == version
        if bool(row.get("is_latest")) != should_be_latest:
            row["is_latest"] = should_be_latest
            db_set(skillpack_versions_ns(slug, skill_slug), row.get("version"), row)

    add_audit_event(
        principal, "rollback", resource_type="skill_pack", resource_id=slug,
        metadata={"skill_slug": skill_slug, "from": current_stable_version, "to": version},
    )
    release_channel.record_release_event(
        principal, slug, skill_slug, release_channel.EVT_CHANNEL_CHANGED,
        metadata={"channel": release_channel.STABLE, "from": current_stable_version, "to": version},
    )
    release_channel.record_release_event(
        principal, slug, skill_slug, release_channel.EVT_ROLLBACK_COMPLETED,
        metadata={"from": current_stable_version, "to": version},
    )

    return {"slug": slug, "skill_slug": skill_slug, "rolled_back_to": version, "previous_stable": current_stable_version}


@router.post("/{installer_version}/{company_slug}/releases/{version}/release")
def post_release_release(
    installer_version: str, company_slug: str, version: str, skill_slug: str, request: Request
) -> dict[str, Any]:
    """Activate ONE skill's "ready" (published-but-undeployed) version — the
    Cloud-only Release/Deploy action. This is what "publish ≠ deploy" means in
    practice: publish_routes.post_publish_v2 only ever gets a version to
    "ready"; moving the stable channel, refreshing the mutable mirror runtimes
    actually sync, and recording this skill's component_versions entry all
    happen here, and nowhere else for a first-time release. Mirrors
    post_release_rollback's structure — the only difference is the
    precondition (a "ready" row here, an already-"published" one there) and
    that this also folds the skill into pack.json's skills/skill_groups union,
    which rollback never needs to touch since the skill is already listed."""
    validate_installer_version(installer_version)
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(company_slug)
    _assert_owner(slug, principal.workspace_id)
    version = str(version or "").strip()
    skill_slug = str(skill_slug or "").strip()
    if not skill_slug:
        raise HTTPException(status_code=400, detail="skill_slug_required")

    target_row = _version_row(slug, skill_slug, version)
    if target_row is None:
        raise HTTPException(status_code=404, detail="release_not_found")
    if target_row.get("status") != "ready":
        raise HTTPException(status_code=400, detail="release_not_ready")

    current_stable_version = release_channel.get_stable_version(slug, skill_slug)
    snapshot = read_release_snapshot(slug, skill_slug, version)
    if not snapshot:
        raise HTTPException(status_code=409, detail="release_snapshot_unavailable")

    release_channel.record_release_event(
        principal, slug, skill_slug, release_channel.EVT_RELEASE_STARTED,
        metadata={"from": current_stable_version, "to": version},
    )

    try:
        # 1. Refresh the mutable "currently live" mirror that _build_delta
        #    serves — this skill's own files only (never pack.json).
        write_mutable_mirror_files(slug, snapshot)

        # 2. Fold this skill into pack.json's skills/skill_groups union — a
        #    no-op if it's already there (every release after the first for
        #    this skill), the thing that first makes it runtime-visible if not.
        existing_pack = read_pack_json_mirror(slug)
        existing_skills = [s for s in (existing_pack.get("skills") or []) if isinstance(s, str)]
        if skill_slug not in existing_skills:
            existing_skills.append(skill_slug)
        existing_skill_groups = dict(existing_pack.get("skill_groups") or {})
        group_id = str(target_row.get("group_id") or "")
        if group_id:
            existing_skill_groups[skill_slug] = group_id
        write_pack_json_mirror(slug, {"skills": existing_skills, "skill_groups": existing_skill_groups})

        # 3. Rewrite this skill's own component_versions entry (what the
        #    runtime's delta compares against) — no other skill's entry touched.
        released_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        index = db_get(_MANIFEST_NS, "skill_pack_index") or []
        identifier = f"{slug}:{skill_slug}"
        db_set(
            _COMPONENT_VERSIONS_NS,
            f"skill_packs:{slug}:{skill_slug}",
            {"version": version, "released_at": released_at_iso, "files": []},
        )
        if identifier not in index:
            index.append(identifier)
            db_set(_MANIFEST_NS, "skill_pack_index", index)
        _compose_manifest()

        # 4. Move the stable channel pointer — the single act of activation,
        #    and the last write that matters.
        release_channel.set_stable_version(
            slug, skill_slug, version, set_by=principal.user_id, reason="release", from_version=current_stable_version
        )

        # 5. Flip this row to "published" / is_latest within this skill's own
        #    version history.
        target_row["status"] = "published"
        target_row["is_latest"] = True
        db_set(skillpack_versions_ns(slug, skill_slug), version, target_row)
        for _key, row in db_list_kv(skillpack_versions_ns(slug, skill_slug)):
            if not isinstance(row, dict):
                continue
            should_be_latest = row.get("version") == version
            if bool(row.get("is_latest")) != should_be_latest:
                row["is_latest"] = should_be_latest
                db_set(skillpack_versions_ns(slug, skill_slug), row.get("version"), row)

        add_audit_event(
            principal, "release", resource_type="skill_pack", resource_id=slug,
            metadata={"skill_slug": skill_slug, "from": current_stable_version, "to": version},
        )
        release_channel.record_release_event(
            principal, slug, skill_slug, release_channel.EVT_CHANNEL_CHANGED,
            metadata={"channel": release_channel.STABLE, "from": current_stable_version, "to": version},
        )
        release_channel.record_release_event(
            principal, slug, skill_slug, release_channel.EVT_RELEASE_SUCCEEDED,
            metadata={"from": current_stable_version, "to": version},
        )
    except Exception as exc:  # noqa: BLE001
        release_channel.record_release_event(
            principal, slug, skill_slug, release_channel.EVT_RELEASE_FAILED,
            metadata={"version": version, "error": str(exc)[:300]},
        )
        raise

    return {"slug": slug, "skill_slug": skill_slug, "released": version, "previous_stable": current_stable_version}


@router.put("/{installer_version}/{company_slug}/groups/{group_id}")
def put_group(
    installer_version: str, company_slug: str, group_id: str, body: UpsertGroupBody, request: Request
) -> dict[str, Any]:
    """Build Studio group create/rename: record this group's id+name on Cloud
    so Skill Packages can show the folder before any workflow is published."""
    validate_installer_version(installer_version)
    principal, slug = _require_owned_slug(company_slug, request)
    gid = _validate_slug(group_id)
    _assert_not_owned_by_other(slug, principal.workspace_id)
    if get_skill_pack_by_slug(slug) is None:
        name = body.company_name.strip() or principal.workspace_name or slug
        upsert_skill_pack_by_slug(slug, workspace_id=principal.workspace_id, company_name=name)
        _claim_owner(slug, principal.workspace_id)
    record_known_group(slug, gid, body.group_name.strip())
    return {"slug": slug, "group_id": gid, "group_name": body.group_name.strip()}


@router.get("/{installer_version}/{company_slug}/groups")
def get_groups(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    """Cloud's Skill Packages → Group → Workflow navigation. Unions Studio-synced
    groups (possibly empty) with every skill ever published (from the publish-time
    skill registry, not the runtime-facing pack.json mirror)."""
    validate_installer_version(installer_version)
    _principal, slug = _require_owned_slug(company_slug, request)

    groups: dict[str, dict[str, Any]] = {}
    for row in list_known_groups(slug):
        group_id = str(row.get("group_id") or "")
        if not group_id:
            continue
        groups[group_id] = {
            "group_id": group_id,
            "group_name": str(row.get("group_name") or ""),
            "workflows": [],
        }
    for row in list_known_skills(slug):
        skill_slug = str(row.get("skill_slug") or "")
        if not skill_slug:
            continue
        group_id = str(row.get("group_id") or "")
        group = groups.setdefault(group_id, {"group_id": group_id, "group_name": "", "workflows": []})
        if not group["group_name"] and row.get("group_name"):
            group["group_name"] = row["group_name"]

        current_stable_version = release_channel.get_stable_version(slug, skill_slug)
        ready_row = None
        for _k, v in db_list_kv(skillpack_versions_ns(slug, skill_slug)):
            if isinstance(v, dict) and v.get("status") == "ready":
                if ready_row is None or float(v.get("published_at") or 0) > float(ready_row.get("published_at") or 0):
                    ready_row = v
        group["workflows"].append(
            {
                "skill_slug": skill_slug,
                "workflow_name": row.get("workflow_name") or skill_slug,
                "current_stable_version": current_stable_version,
                "has_ready_version": ready_row is not None,
                "ready_version": ready_row.get("version") if ready_row else None,
            }
        )

    return {"slug": slug, "groups": list(groups.values())}


@router.get("/{installer_version}/{company_slug}/deployments")
def get_deployments(installer_version: str, company_slug: str, skill_slug: str, request: Request) -> dict[str, Any]:
    """Runtime deployment status for ONE skill, derived only from data the
    runtime actually reports (runtime_registrations) — never fabricated. A
    registration that predates skill-version reporting (an already-deployed
    runtime that hasn't self-updated yet) reads as "unknown", not "up to
    date". A machine missing only this skill (but current on others) reads
    "pending", not "up to date" — this never looks at a sibling skill's
    version."""
    validate_installer_version(installer_version)
    principal, slug = _require_owned_slug(company_slug, request)

    desired_version = release_channel.get_stable_version(slug, skill_slug)
    stale_cutoff = time.time() - _STALE_RUNTIME_DAYS * 86400

    machines: list[dict[str, Any]] = []
    counts = {"up_to_date": 0, "pending": 0, "failed": 0, "offline": 0, "unknown": 0}
    for reg in db_list("runtime_registrations"):
        if not isinstance(reg, dict) or reg.get("company") != slug or reg.get("workspace_id") != principal.workspace_id:
            continue
        all_installed = reg.get("skill_versions") if isinstance(reg.get("skill_versions"), dict) else None
        installed = all_installed.get(skill_slug) if all_installed else None
        all_sync_errors = reg.get("sync_errors") if isinstance(reg.get("sync_errors"), dict) else None
        sync_error = all_sync_errors.get(skill_slug) if all_sync_errors else None
        last_seen = float(reg.get("last_seen") or 0)
        is_offline = last_seen < stale_cutoff
        if is_offline:
            status = "offline"
        elif sync_error and installed != desired_version:
            # A machine that already caught up (installed == desired) never
            # reads "failed" just because an older error is still cached —
            # only an unresolved failure (the version still hasn't advanced)
            # counts.
            status = "failed"
        elif installed is None or desired_version is None:
            status = "unknown"
        elif installed == desired_version:
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
                "sync_error": sync_error if status == "failed" else None,
                "last_seen": last_seen,
                "last_sync": last_seen,
            }
        )
    machines.sort(key=lambda m: m["last_seen"], reverse=True)

    return {
        "slug": slug,
        "skill_slug": skill_slug,
        "desired_version": desired_version,
        "machines": machines,
        "summary": {"total": len(machines), **counts},
    }
