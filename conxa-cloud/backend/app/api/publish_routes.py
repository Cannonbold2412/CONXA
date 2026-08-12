"""Publish + installer-hosting endpoints used by Build Studio and end users.

Build Studio compiles locally, then publishes the data-only skill pack here so
conxa-runtime.exe instances can pull deltas (served by skillpack_update_routes), and
uploads the built ``{Company}-Setup.exe`` for end-user download.

Ownership: the first workspace to publish a slug owns it. Subsequent publishes
or installer uploads for that slug must come from the same workspace (403
otherwise). Installer *downloads* are public — end users have no Clerk account.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_list_kv, using_database
from conxa_core.storage.skill_pack_store import (
    get_skill_pack_by_slug,
    save_skill_pack,
    upsert_skill_pack_by_slug,
)
from conxa_core.models.workflow import SkillPackBuild, SkillPackInstaller
from app.api.deps import current_principal, entitlement_http_error
from app.api.installer_storage import (
    installer_dir,
    installer_version_dir,
    installer_versions_ns,
    load_installer_from_db,
    sign_installer,
    verify_installer_signature,
)
from app.api.product_ownership import (
    SUPPORTED_INSTALLER_GENERATIONS,
    _assert_not_owned_by_other,
    _assert_owner,
    _claim_owner,
    _owner_of,
    validate_installer_version,
)
from app.api.skillpack_storage import skill_packs_dir, skillpack_files_ns, skillpack_versions_ns
from app.services.entitlements import (
    _limits_from_billing,
    ensure_distribution_allowed,
    ensure_trial_active,
    ensure_white_label_allowed,
    ensure_workflow_publishable,
    get_installer_domain,
    normalize_plan,
    record_published_workflow,
)
from app.services.rbac import require_admin
from app.services.saas import add_audit_event, billing_for
from app.api.updates_routes import (
    _COMPONENT_VERSIONS_NS,
    _MANIFEST_NS,
    _compose_manifest,
    _require_admin,
)

router = APIRouter(prefix="/workflows", tags=["publish"])
installers_router = APIRouter(prefix="/installers", tags=["installers"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

_SAFE_SLUG = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)

# Settings KV singleton holding the "current" installer generation stamped
# into newly built installers. Falls back to the last entry in
# SUPPORTED_INSTALLER_GENERATIONS when unset.
_PLATFORM_SETTINGS_NS = "platform"
_INSTALLER_GENERATIONS_KEY = "installer_generations"


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class PublishFile(BaseModel):
    path: str = Field(..., min_length=1, max_length=256)
    content_base64: str = Field(..., min_length=1)


class PublishBody(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field(default="", max_length=128)
    target_url: str = Field(default="")
    protected_url: str = Field(default="")
    skill_pack_version: str = Field(..., min_length=1, max_length=32)
    release_notes: str = Field(default="", max_length=2000)
    skills: list[str] = Field(default_factory=list)
    skill_groups: dict[str, str] = Field(default_factory=dict)
    files: list[PublishFile] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_slug(slug: str) -> str:
    s = slug.strip()
    if not s or any(c not in _SAFE_SLUG for c in s) or ".." in s:
        raise HTTPException(status_code=400, detail="invalid_slug")
    return s


def _validate_rel_path(rel: str) -> str:
    r = rel.strip().replace("\\", "/")
    if not r or r.startswith("/") or ".." in r.split("/"):
        raise HTTPException(status_code=400, detail=f"invalid_file_path: {rel}")
    return r


def _validate_version(version: str) -> str:
    value = str(version or "").strip()
    if not _SEMVER_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid_installer_version")
    return value


def _validate_skill_pack_version(version: str) -> str:
    value = str(version or "").strip()
    if not _SEMVER_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid_skill_pack_version")
    return value


def _validate_release_notes(notes: str | None) -> str:
    value = str(notes or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="release_notes_required")
    if len(value) > 2000:
        raise HTTPException(status_code=400, detail="release_notes_too_long")
    return value


def _random_installer_name() -> str:
    """Free-plan installers get an unbranded name — see docs/PRD.md §11."""
    return "".join(secrets.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(10))


def _mint_pack_token(
    namespace: str, slug: str, workspace_id: str, version: str, owner_user_id: str
) -> str:
    """Return the per-company long-lived token in ``namespace``, minting one on
    first publish and reusing it on republish.

    Rotating a token is done by deleting its KV entry, which forces a new one on
    the next publish.
    """
    existing = db_get(namespace, slug)
    if isinstance(existing, dict) and existing.get("token"):
        token = str(existing["token"])
    else:
        token = secrets.token_urlsafe(32)
    db_set(
        namespace,
        slug,
        {
            "token": token,
            "company": slug,
            "version": version,
            "workspace_id": workspace_id,
            "owner_user_id": owner_user_id,
            "updated_at": time.time(),
        },
    )
    return token


def _tracking_token(slug: str, workspace_id: str, version: str, owner_user_id: str) -> str:
    """Telemetry ingest token embedded in pack.json (see tracking_routes)."""
    return _mint_pack_token("tracking_tokens", slug, workspace_id, version, owner_user_id)


def _sync_token(slug: str, workspace_id: str, version: str, owner_user_id: str) -> str:
    """Long-lived skill-pack delta-sync token embedded in pack.json and shipped
    inside the installer so the runtime can pull updates without a Conxa login."""
    return _mint_pack_token("sync_tokens", slug, workspace_id, version, owner_user_id)


def _api_base(request: Request) -> str:
    if settings.api_base_url:
        return settings.api_base_url.rstrip("/")
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    return str(request.base_url).rstrip("/")


def _upsert_published_skill_pack(
    body: PublishBody, slug: str, skill_pack_version: str, workspace_id: str
) -> None:
    """Mirror a publish into the cloud's own SkillPack record for this slug —
    dashboard-visible build metadata. The workflows that compiled into this
    release live in Build Studio's local store, not here; the cloud only ever
    sees the published artifact, so it tracks the package, not the sources."""
    name = body.display_name.strip() or slug
    pack = upsert_skill_pack_by_slug(slug, workspace_id=workspace_id, company_name=name)
    pack.build = SkillPackBuild(last_built_at=time.time(), output_path="", version=skill_pack_version)
    save_skill_pack(pack)


# ---------------------------------------------------------------------------
# Publish skill pack data
# ---------------------------------------------------------------------------

def _publish_skill_pack_impl(
    slug: str, body: PublishBody, principal: Any, request: Request, installer_version: str | None
) -> dict[str, Any]:
    """Shared by the legacy ``/publish`` route and the versioned
    ``/{installer_version}/{slug}/skill-packs/upload`` route. ``installer_version``
    is ``None`` for the legacy route (unversioned URLs are minted into pack.json,
    matching every runtime already deployed against them).
    """
    try:
        ensure_trial_active(principal)
        ensure_workflow_publishable(principal, slug, body.skills)
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc

    # Conflict-check before claiming — a workspace may publish under any number
    # of slugs (the per-plan slot limit was removed 2026-08-08; see
    # docs/Implementation-Plan.md), the only remaining rule is that a slug
    # already claimed by another workspace can't be taken over.
    _assert_not_owned_by_other(slug, principal.workspace_id)
    _claim_owner(slug, principal.workspace_id)

    skill_pack_version = _validate_skill_pack_version(body.skill_pack_version)

    # A given semver is an immutable release, same as installer uploads — forces
    # a version bump rather than silently overwriting a prior release's history row.
    if db_get(skillpack_versions_ns(slug), skill_pack_version) is not None:
        raise HTTPException(status_code=409, detail="skill_pack_version_exists")

    packs_dir = skill_packs_dir(slug)
    packs_dir.mkdir(parents=True, exist_ok=True)
    pack_path = packs_dir / "pack.json"

    written = 0
    for f in body.files:
        rel = _validate_rel_path(f.path)
        try:
            raw = base64.b64decode(f.content_base64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(status_code=400, detail=f"invalid_base64: {rel}") from exc
        target = packs_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(target)
        db_set(skillpack_files_ns(slug), rel, {"path": rel, "content_base64": f.content_base64})
        written += 1

    published_at = time.time()
    api_base = _api_base(request)
    if installer_version:
        sync_url_path = f"/api/v1/workflows/{installer_version}/{slug}/skill-packs/delta"
        tracking_url_path = f"/api/v1/workflows/{installer_version}/{slug}/tracking/events"
    else:
        sync_url_path = f"/api/v1/skill-packs/{slug}/delta"
        tracking_url_path = f"/api/tracking/{slug}/events"
    tracking = {
        "enabled": True,
        "tracking_url": f"{api_base}{tracking_url_path}",
        "tracking_token": _tracking_token(slug, principal.workspace_id, skill_pack_version, principal.user_id),
        "company_id": slug,
        "schema_version": 1,
        "protocol_version": 1,
    }
    sync_token = _sync_token(slug, principal.workspace_id, skill_pack_version, principal.user_id)
    if pack_path.is_file():
        try:
            pack = json.loads(pack_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pack = {}
    else:
        # Local disk may have been wiped (Render free plan has no persistent disk) since
        # the last publish; recover the prior pack.json from Postgres so republishing
        # doesn't lose fields like company_display.
        stored_pack = db_get(skillpack_files_ns(slug), "pack.json")
        if isinstance(stored_pack, dict) and stored_pack.get("content_base64"):
            try:
                pack = json.loads(base64.b64decode(stored_pack["content_base64"]).decode("utf-8"))
            except (ValueError, json.JSONDecodeError):
                pack = {}
        else:
            pack = {}
    pack.update(
        {
            "company": pack.get("company") or slug,
            "company_display": body.display_name.strip() or pack.get("company_display") or slug,
            "skill_pack_version": skill_pack_version,
            "release_notes": body.release_notes.strip(),
            "skills": list(body.skills),
            "skill_groups": dict(body.skill_groups),
            "workspace_id": principal.workspace_id,
            "published_at": published_at,
            "sync_endpoint": f"{api_base}{sync_url_path}",
            "sync_token": sync_token,
            "tracking": tracking,
        }
    )
    if installer_version:
        pack["installer_version"] = installer_version
    pack_bytes = json.dumps(pack, ensure_ascii=False, indent=2).encode("utf-8")
    tmp = pack_path.with_suffix(".json.tmp")
    tmp.write_bytes(pack_bytes)
    tmp.replace(pack_path)
    db_set(
        skillpack_files_ns(slug),
        "pack.json",
        {"path": "pack.json", "content_base64": base64.b64encode(pack_bytes).decode("ascii")},
    )
    _upsert_published_skill_pack(body, slug, skill_pack_version, principal.workspace_id)

    # Record each skill's version in the unified signed manifest so runtimes can
    # compare against it before pulling a delta. `files` is intentionally left empty
    # here — skill content is delivered through the existing per-company delta-sync
    # (Bearer sync_token), not broadcast in a public manifest; the manifest only
    # needs to know "what version is current" and any compatibility gate.
    published_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(published_at))
    index = db_get(_MANIFEST_NS, "skill_pack_index") or []
    index_changed = False
    for skill_slug in body.skills:
        identifier = f"{slug}:{skill_slug}"
        db_set(
            _COMPONENT_VERSIONS_NS,
            f"skill_packs:{slug}:{skill_slug}",
            {"version": skill_pack_version, "released_at": published_at_iso, "files": []},
        )
        if identifier not in index:
            index.append(identifier)
            index_changed = True
        record_published_workflow(principal.workspace_id, slug, skill_slug)
    if index_changed:
        db_set(_MANIFEST_NS, "skill_pack_index", index)
    if body.skills:
        _compose_manifest()

    # Skill-pack release history — mirrors installer_versions_ns exactly (one KV
    # row per version, is_latest flip on every other row for this slug).
    history_row = {
        "slug": slug,
        "version": skill_pack_version,
        "release_notes": body.release_notes.strip(),
        "skills": list(body.skills),
        "workspace_id": principal.workspace_id,
        "owner_user_id": principal.user_id,
        "published_at": published_at,
        "files_written": written,
        "is_latest": True,
    }
    db_set(skillpack_versions_ns(slug), skill_pack_version, history_row)
    for _other_key, other_row in db_list_kv(skillpack_versions_ns(slug)):
        if not isinstance(other_row, dict):
            continue
        other_version = other_row.get("version")
        if other_version == skill_pack_version:
            continue
        if other_row.get("is_latest"):
            other_row["is_latest"] = False
            db_set(skillpack_versions_ns(slug), other_version, other_row)

    add_audit_event(
        principal,
        "publish",
        resource_type="skill_pack",
        resource_id=slug,
        metadata={"version": skill_pack_version, "files_written": written},
    )

    billing = billing_for(principal)
    limits = _limits_from_billing(billing)
    return {
        "slug": slug,
        "version": skill_pack_version,
        "files_written": written,
        "sync_url": sync_url_path,
        "sync_token": sync_token,
        "tracking": tracking,
        "workspace_id": principal.workspace_id,
        "published_at": published_at,
        "plan": normalize_plan(billing),
        "distribution": limits["distribution"],
    }


@router.post("/publish")
def post_publish(body: PublishBody, request: Request) -> dict[str, Any]:
    """Legacy, unversioned publish route. Kept permanently for already-deployed
    installers/tooling — see ``post_publish_v2`` for the versioned equivalent."""
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(body.slug)
    return _publish_skill_pack_impl(slug, body, principal, request, installer_version=None)


@router.post("/{installer_version}/{company_slug}/skill-packs/upload")
def post_publish_v2(
    installer_version: str, company_slug: str, body: PublishBody, request: Request
) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    installer_version = validate_installer_version(installer_version)
    slug = _validate_slug(company_slug)
    if body.slug and body.slug != slug:
        raise HTTPException(status_code=400, detail="slug_mismatch")
    return _publish_skill_pack_impl(slug, body, principal, request, installer_version=installer_version)


@router.get("/{installer_version}/{company_slug}/skill-packs/versions")
def get_skill_pack_versions_v2(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    return _skill_pack_versions_impl(company_slug, request)


def _skill_pack_versions_impl(slug: str, request: Request) -> dict[str, Any]:
    """Authenticated skill-pack release history for the dashboard — the
    version/release-comment/publishing-limit surface for Skill Pack Publishing."""
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(slug)
    owner = _owner_of(slug)
    if owner and owner != principal.workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")

    versions = [
        row
        for _key, row in db_list_kv(skillpack_versions_ns(slug))
        if isinstance(row, dict) and row.get("workspace_id") == principal.workspace_id
    ]
    versions.sort(key=lambda item: float(item.get("published_at") or 0), reverse=True)
    return {"slug": slug, "versions": versions}


# ---------------------------------------------------------------------------
# Installer upload (authed) + download (public)
# ---------------------------------------------------------------------------

async def _upload_installer_impl(slug: str, request: Request) -> dict[str, Any]:
    """Upload the built installer .exe as a raw octet-stream body.

    Query params: ``filename`` (display name), ``version``, ``release_notes``,
    ``distribution`` (``internal`` default | ``external``), ``white_label``.

    No product/skill-pack-slot entitlement check here — the per-slug slot limit
    was removed 2026-08-08 (see docs/Implementation-Plan.md). What's gated now
    is *reach*: Free and Starter may only upload an internal-use installer;
    external distribution requires Pro or Enterprise, and custom branding
    requires Enterprise (see docs/PRD.md §11, the capability ladder).
    """
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(slug)
    _assert_owner(slug, principal.workspace_id)

    distribution = request.query_params.get("distribution", "internal").strip().lower()
    if distribution not in ("internal", "external"):
        distribution = "internal"
    white_label = request.query_params.get("white_label", "false").strip().lower() == "true"
    try:
        ensure_trial_active(principal)
        ensure_distribution_allowed(principal, external=distribution == "external")
        ensure_white_label_allowed(principal, custom_branding=white_label)
    except Exception as exc:  # noqa: BLE001
        raise entitlement_http_error(exc) from exc

    max_bytes = settings.build_artifact_upload_max_bytes
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > max_bytes:
        raise HTTPException(status_code=413, detail="installer_too_large")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_installer_body")
    if len(body) > max_bytes:
        raise HTTPException(status_code=413, detail="installer_too_large")

    sha256 = hashlib.sha256(body).hexdigest()
    version = _validate_version(request.query_params.get("version", ""))
    release_notes = _validate_release_notes(request.query_params.get("release_notes"))
    filename = request.query_params.get("filename")
    if not filename:
        if normalize_plan(billing_for(principal)) == "free":
            filename = f"{_random_installer_name()}.exe"
        else:
            domain = get_installer_domain(principal.workspace_id)
            filename = f"{domain}.exe" if domain else f"{slug}-Setup.exe"
    filename = Path(filename).name  # strip any path components
    # Skill count for the installer's meta.json — read from the already-published
    # pack.json, the source of truth for what this slug's release actually contains.
    workflow_count = 0
    published_pack_path = skill_packs_dir(slug) / "pack.json"
    if published_pack_path.is_file():
        try:
            workflow_count = len(json.loads(published_pack_path.read_text(encoding="utf-8")).get("skills") or [])
        except Exception:
            workflow_count = 0

    out_dir = installer_dir(slug)
    out_dir.mkdir(parents=True, exist_ok=True)
    version_dir = installer_version_dir(slug, version)
    if version_dir.exists() or db_get(installer_versions_ns(slug), version) is not None:
        raise HTTPException(status_code=409, detail="installer_version_exists")
    version_dir.mkdir(parents=True, exist_ok=False)
    version_exe_path = version_dir / "installer.exe"
    tmp = version_exe_path.with_suffix(".exe.tmp")
    tmp.write_bytes(body)
    tmp.replace(version_exe_path)

    uploaded_at = time.time()
    meta = {
        "slug": slug,
        "filename": filename,
        "version": version,
        "release_notes": release_notes,
        "sha256": sha256,
        "size": len(body),
        "uploaded_at": uploaded_at,
        "workspace_id": principal.workspace_id,
        "is_latest": True,
        "workflow_count": workflow_count,
        "distribution": distribution,
        "white_label": white_label,
    }
    (version_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    for other_meta_path in (out_dir / "versions").glob("*/meta.json"):
        if other_meta_path == version_dir / "meta.json":
            continue
        try:
            other_meta = json.loads(other_meta_path.read_text(encoding="utf-8"))
            if other_meta.get("is_latest"):
                other_meta["is_latest"] = False
                other_meta_path.write_text(json.dumps(other_meta, indent=2), encoding="utf-8")
        except Exception:
            continue

    # Store metadata only — the binary is too large (~20 MB) to fit in a JSONB field.
    # Disk is the primary store; DB tracks version history and is_latest state.
    db_set(
        installer_versions_ns(slug),
        version,
        meta,
    )
    for _other_key, other_meta in db_list_kv(installer_versions_ns(slug)):
        if not isinstance(other_meta, dict):
            continue
        other_version = other_meta.get("version")
        if other_version == version:
            continue
        if other_meta.get("is_latest"):
            other_meta["is_latest"] = False
            db_set(installer_versions_ns(slug), other_version, other_meta)

    latest_exe_path = out_dir / "installer.exe"
    tmp_latest = latest_exe_path.with_suffix(".exe.tmp")
    tmp_latest.write_bytes(body)
    tmp_latest.replace(latest_exe_path)
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Persist installer metadata onto the SkillPack record so the dashboard can
    # surface version and a download button without reading the filesystem.
    pack = get_skill_pack_by_slug(slug)
    if pack is not None:
        pack.installer = SkillPackInstaller(
            built_at=uploaded_at,
            installer_path=str(latest_exe_path),
            filename=filename,
            version=version,
            runtime_version="",
            release_notes=release_notes,
        )
        save_skill_pack(pack)

    add_audit_event(
        principal,
        "installer_upload",
        resource_type="installer",
        resource_id=slug,
        metadata={"version": version, "size": len(body), "sha256": sha256, "release_notes": release_notes},
    )

    return {
        "slug": slug,
        "version": version,
        "sha256": sha256,
        "size": len(body),
        "download_url": f"/api/v1/installers/{slug}",
        "version_download_url": f"/api/v1/installers/{slug}/versions/{version}",
    }


@router.post("/{slug}/installer/upload")
async def post_installer_upload(slug: str, request: Request) -> dict[str, Any]:
    """Legacy, unversioned installer-upload route. Kept permanently — see
    ``post_installer_upload_v2`` for the versioned equivalent."""
    return await _upload_installer_impl(slug, request)


@router.post("/{installer_version}/{company_slug}/installer/upload")
async def post_installer_upload_v2(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    validate_installer_version(installer_version)
    return await _upload_installer_impl(company_slug, request)


def _installer_versions_impl(slug: str, request: Request) -> dict[str, Any]:
    """Authenticated installer release history for the dashboard."""
    principal = current_principal(request)
    require_admin(principal)
    slug = _validate_slug(slug)
    owner = _owner_of(slug)
    if owner and owner != principal.workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")

    def _row_from_meta(meta: dict[str, Any], fallback_version: str) -> dict[str, Any]:
        version = str(meta.get("version") or fallback_version)
        ts = int(time.time())
        sig = sign_installer(slug, version, ts)
        download_url = f"/api/v1/installers/{slug}/versions/{version}"
        if settings.installer_signing_key:
            download_url += f"?ts={ts}&sig={sig}"
        row = {
            "slug": slug,
            "version": version,
            "release_notes": str(meta.get("release_notes") or ""),
            "filename": str(meta.get("filename") or f"{slug}-Setup.exe"),
            "sha256": str(meta.get("sha256") or ""),
            "size": int(meta.get("size") or 0),
            "uploaded_at": float(meta.get("uploaded_at") or 0),
            "workspace_id": str(meta.get("workspace_id") or ""),
            "is_latest": bool(meta.get("is_latest")),
            "download_url": download_url,
        }
        if "workflow_count" in meta:
            row["workflow_count"] = int(meta.get("workflow_count") or 0)
        return row

    # Merge disk (fast path, may be missing after a wipe) with Postgres (durable source
    # of truth). Postgres wins on conflict since disk can only ever be stale or absent.
    versions_by_key: dict[str, dict[str, Any]] = {}
    versions_dir = installer_dir(slug) / "versions"
    if versions_dir.is_dir():
        for meta_path in versions_dir.glob("*/meta.json"):
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if meta.get("workspace_id") != principal.workspace_id:
                continue
            versions_by_key[meta_path.parent.name] = _row_from_meta(meta, meta_path.parent.name)
    if using_database():
        for key, meta in db_list_kv(installer_versions_ns(slug)):
            if not isinstance(meta, dict) or meta.get("workspace_id") != principal.workspace_id:
                continue
            dedup_key = str(meta.get("version") or key)
            versions_by_key[dedup_key] = _row_from_meta(meta, dedup_key)

    versions = list(versions_by_key.values())
    versions.sort(key=lambda item: float(item.get("uploaded_at") or 0), reverse=True)
    return {"slug": slug, "versions": versions}


@router.get("/{slug}/installer/versions")
def get_installer_versions(slug: str, request: Request) -> dict[str, Any]:
    """Legacy, unversioned route. Kept permanently — see
    ``get_installer_versions_v2`` for the versioned equivalent."""
    return _installer_versions_impl(slug, request)


@router.get("/{installer_version}/{company_slug}/installer/versions")
def get_installer_versions_v2(installer_version: str, company_slug: str, request: Request) -> dict[str, Any]:
    validate_installer_version(installer_version)
    return _installer_versions_impl(company_slug, request)


@router.get("/generations")
def get_installer_generations() -> dict[str, Any]:
    """Public. Returns the current default installer generation that Build
    Studio/CI should stamp into newly built installers, plus the full
    supported/deprecated sets. `{installer_version}` is frozen into each
    installer at build time — this endpoint only ever affects *new* builds,
    never already-installed runtimes."""
    row = db_get(_PLATFORM_SETTINGS_NS, _INSTALLER_GENERATIONS_KEY)
    if isinstance(row, dict) and row.get("current") in SUPPORTED_INSTALLER_GENERATIONS:
        return {
            "current": row["current"],
            "supported": list(SUPPORTED_INSTALLER_GENERATIONS),
            "deprecated": list(row.get("deprecated") or []),
        }
    return {
        "current": SUPPORTED_INSTALLER_GENERATIONS[-1],
        "supported": list(SUPPORTED_INSTALLER_GENERATIONS),
        "deprecated": [],
    }


@admin_router.post("/workflows/generations")
def post_installer_generations(body: dict[str, Any], authorization: str = Header(default="")) -> dict[str, Any]:
    """Admin-only (Bearer CONXA_ADMIN_TOKEN). Flips the default generation
    stamped into new installer builds. Never affects already-installed
    runtimes — see ``get_installer_generations`` docstring above."""
    _require_admin(authorization)
    current = str(body.get("current") or "").strip()
    if current not in SUPPORTED_INSTALLER_GENERATIONS:
        raise HTTPException(status_code=400, detail="unsupported_installer_version")
    deprecated = [v for v in (body.get("deprecated") or []) if v in SUPPORTED_INSTALLER_GENERATIONS]
    row = {"current": current, "deprecated": deprecated, "updated_at": time.time()}
    db_set(_PLATFORM_SETTINGS_NS, _INSTALLER_GENERATIONS_KEY, row)
    return row


def _stream_installer(
    exe_path: Path, meta_path: Path, *, slug: str, version: str | None
) -> StreamingResponse:
    if not exe_path.is_file() or not meta_path.is_file():
        fallback = load_installer_from_db(slug, version)
        if fallback is None:
            raise HTTPException(status_code=404, detail="installer_not_published")
        meta, content = fallback
        try:
            exe_path.parent.mkdir(parents=True, exist_ok=True)
            exe_path.write_bytes(content)
            meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        except OSError:
            pass
        headers = {
            "Content-Disposition": f'attachment; filename="{meta.get("filename", "setup.exe")}"',
            "X-Conxa-SHA256": str(meta.get("sha256", "")),
        }
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/octet-stream",
            headers=headers,
        )
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    headers = {
        "Content-Disposition": f'attachment; filename="{meta.get("filename", "setup.exe")}"',
        "X-Conxa-SHA256": str(meta.get("sha256", "")),
    }
    return StreamingResponse(
        open(exe_path, "rb"),  # noqa: SIM115
        media_type="application/octet-stream",
        headers=headers,
    )


@installers_router.get("/{slug}/versions/{version}")
def get_installer_version(slug: str, version: str, request: Request) -> StreamingResponse:
    """Installer download for an exact version. Requires a valid ts+sig when
    SKILL_INSTALLER_SIGNING_KEY is configured (SG-07); public otherwise (dev)."""
    slug = _validate_slug(slug)
    version = _validate_version(version)
    verify_installer_signature(slug, version, request)
    version_dir = installer_version_dir(slug, version)
    return _stream_installer(version_dir / "installer.exe", version_dir / "meta.json", slug=slug, version=version)


@installers_router.get("/{slug}")
def get_installer(slug: str, request: Request) -> StreamingResponse:
    """Latest installer download. SHA-256 returned in X-Conxa-SHA256. Requires a
    valid ts+sig when SKILL_INSTALLER_SIGNING_KEY is configured (SG-07); public
    otherwise (dev)."""
    slug = _validate_slug(slug)
    verify_installer_signature(slug, None, request)
    out_dir = installer_dir(slug)
    return _stream_installer(out_dir / "installer.exe", out_dir / "meta.json", slug=slug, version=None)
