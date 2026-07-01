"""Publish + installer-hosting endpoints used by Build Studio and end users.

Build Studio compiles locally, then publishes the data-only skill pack here so
conxa-runtime.exe instances can pull deltas (served by skillpack_update_routes), and
uploads the built ``{Company}-Plugin-Setup.exe`` for end-user download.

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

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import uuid

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_list_kv, using_database
from conxa_core.models.plugin import PluginBuild, PluginInstaller, PluginWorkflow
from conxa_core.storage.plugin_store import create_plugin, list_plugins, save_plugin
from app.services.entitlements import EntitlementError, ensure_installer_slot_available
from app.services.rbac import require_admin
from app.services.saas import add_audit_event, ensure_principal, principal_from_request
from app.api.updates_routes import (
    _COMPONENT_VERSIONS_NS,
    _MANIFEST_NS,
    _compose_manifest,
)

router = APIRouter(prefix="/plugins", tags=["publish"])
installers_router = APIRouter(prefix="/installers", tags=["installers"])

_OWNERS_NS = "publish_owners"
_SAFE_SLUG = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


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


def _validate_release_notes(notes: str | None) -> str:
    value = str(notes or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="release_notes_required")
    if len(value) > 2000:
        raise HTTPException(status_code=400, detail="release_notes_too_long")
    return value


def _skill_packs_dir(slug: str) -> Path:
    return settings.data_dir / "skill-packs" / slug


def _installer_dir(slug: str) -> Path:
    return settings.data_dir / "installers" / slug


def _installer_version_dir(slug: str, version: str) -> Path:
    return _installer_dir(slug) / "versions" / version


def _installer_versions_ns(slug: str) -> str:
    # No ':' — the fs-fallback KV store (local dev / Windows) uses the namespace
    # as a literal directory name, and ':' is illegal in Windows paths.
    return f"installer_versions__{slug}"


def _skillpack_files_ns(slug: str) -> str:
    return f"skillpack_files__{slug}"


def _load_installer_from_db(slug: str, version: str | None) -> tuple[dict[str, Any], bytes] | None:
    """Durable fallback for when the Render local disk has been wiped (free plan has no
    persistent disk and idles out, taking on-disk installer files with it). Postgres is the
    source of truth; local disk is just a fast-path cache rehydrated from here on miss."""
    if not using_database():
        return None
    if version:
        meta = db_get(_installer_versions_ns(slug), version)
        rows = [(version, meta)] if isinstance(meta, dict) else []
    else:
        rows = [(k, v) for k, v in db_list_kv(_installer_versions_ns(slug)) if isinstance(v, dict)]
    if not rows:
        return None
    if version:
        _key, meta = rows[0]
    else:
        latest = next((r for r in rows if r[1].get("is_latest")), None)
        if latest is None:
            latest = max(rows, key=lambda r: float(r[1].get("uploaded_at") or 0))
        _key, meta = latest
    content_b64 = meta.get("content_base64")
    if not content_b64:
        return None
    content = base64.b64decode(content_b64)
    meta_out = {k: v for k, v in meta.items() if k != "content_base64"}
    return meta_out, content


def _owner_of(slug: str) -> str | None:
    row = db_get(_OWNERS_NS, slug)
    if isinstance(row, dict):
        return str(row.get("workspace_id") or "") or None
    return None


def _assert_owner(slug: str, workspace_id: str) -> None:
    owner = _owner_of(slug)
    if owner and owner != workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")
    if not owner:
        db_set(_OWNERS_NS, slug, {"workspace_id": workspace_id, "claimed_at": time.time()})


def _tracking_token(slug: str, workspace_id: str, version: str, owner_user_id: str) -> str:
    existing = db_get("tracking_tokens", slug)
    if isinstance(existing, dict) and existing.get("token"):
        token = str(existing["token"])
    else:
        token = secrets.token_urlsafe(32)
    db_set(
        "tracking_tokens",
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


def _sync_token(slug: str, workspace_id: str, version: str, owner_user_id: str) -> str:
    """Return the per-company long-lived sync token, minting one on first publish.

    The token is embedded in pack.json and shipped inside the installer so the
    runtime can pull skill-pack deltas without any user-facing Conxa login.
    It is stable across republishes (reused if present) and can be rotated by
    deleting the 'sync_tokens' KV entry, which forces a new token on next publish.
    """
    existing = db_get("sync_tokens", slug)
    if isinstance(existing, dict) and existing.get("token"):
        token = str(existing["token"])
    else:
        token = secrets.token_urlsafe(32)
    db_set(
        "sync_tokens",
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


def _api_base(request: Request) -> str:
    if settings.api_base_url:
        return settings.api_base_url.rstrip("/")
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    return str(request.base_url).rstrip("/")


def _upsert_published_plugin(body: PublishBody, workspace_id: str, owner_user_id: str) -> None:
    name = body.display_name.strip() or body.slug
    target_url = body.target_url.strip() or "https://example.com"
    protected_url = body.protected_url.strip()
    existing = next(
        (
            plugin
            for plugin in list_plugins(workspace_id=workspace_id)
            if plugin.slug == body.slug or plugin.name.lower() == name.lower()
        ),
        None,
    )
    now = time.time()
    build = PluginBuild(last_built_at=now, output_path="", version=body.skill_pack_version)
    workflows = [
        PluginWorkflow(
            id=str(uuid.uuid4()),
            slug=skill_slug,
            name=skill_slug.replace("-", " ").title(),
            session_id="",
            recorded_at=now,
            status="compiled",
            skill_id=skill_slug,
        )
        for skill_slug in body.skills
    ]
    if existing is None:
        plugin = create_plugin(
            name=name,
            target_url=target_url,
            protected_url=protected_url,
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
        )
        plugin = plugin.model_copy(update={
            "slug": body.slug,
            "status": "ready",
            "build": build,
            "workflows": workflows,
        })
    else:
        plugin = existing.model_copy(
            update={
                "slug": body.slug,
                "name": name,
                "workspace_id": workspace_id,
                "owner_user_id": owner_user_id,
                "target_url": target_url or existing.target_url,
                "protected_url": protected_url or existing.protected_url,
                "status": "ready",
                "build": build,
                "workflows": workflows,
            }
        )
    save_plugin(plugin)


# ---------------------------------------------------------------------------
# Publish skill pack data
# ---------------------------------------------------------------------------

@router.post("/publish")
def post_publish(body: PublishBody, request: Request) -> dict[str, Any]:
    principal = principal_from_request(request)
    ensure_principal(principal)
    require_admin(principal)
    slug = _validate_slug(body.slug)
    _assert_owner(slug, principal.workspace_id)

    packs_dir = _skill_packs_dir(slug)
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
        db_set(_skillpack_files_ns(slug), rel, {"path": rel, "content_base64": f.content_base64})
        written += 1

    published_at = time.time()
    tracking = {
        "enabled": True,
        "tracking_url": f"{_api_base(request)}/api/tracking/{slug}/events",
        "tracking_token": _tracking_token(slug, principal.workspace_id, body.skill_pack_version, principal.user_id),
        "company_id": slug,
        "schema_version": 1,
        "protocol_version": 1,
    }
    sync_token = _sync_token(slug, principal.workspace_id, body.skill_pack_version, principal.user_id)
    if pack_path.is_file():
        try:
            pack = json.loads(pack_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pack = {}
    else:
        # Local disk may have been wiped (Render free plan has no persistent disk) since
        # the last publish; recover the prior pack.json from Postgres so republishing
        # doesn't lose fields like company_display.
        stored_pack = db_get(_skillpack_files_ns(slug), "pack.json")
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
            "skill_pack_version": body.skill_pack_version,
            "release_notes": body.release_notes.strip(),
            "skills": list(body.skills),
            "workspace_id": principal.workspace_id,
            "published_at": published_at,
            "sync_endpoint": f"{_api_base(request)}/api/v1/skill-packs/{slug}/delta",
            "sync_token": sync_token,
            "tracking": tracking,
        }
    )
    pack_bytes = json.dumps(pack, ensure_ascii=False, indent=2).encode("utf-8")
    tmp = pack_path.with_suffix(".json.tmp")
    tmp.write_bytes(pack_bytes)
    tmp.replace(pack_path)
    db_set(
        _skillpack_files_ns(slug),
        "pack.json",
        {"path": "pack.json", "content_base64": base64.b64encode(pack_bytes).decode("ascii")},
    )
    _upsert_published_plugin(body, principal.workspace_id, principal.user_id)

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
            {"version": body.skill_pack_version, "released_at": published_at_iso, "files": []},
        )
        if identifier not in index:
            index.append(identifier)
            index_changed = True
    if index_changed:
        db_set(_MANIFEST_NS, "skill_pack_index", index)
    if body.skills:
        _compose_manifest()

    add_audit_event(
        principal,
        "publish",
        resource_type="skill_pack",
        resource_id=slug,
        metadata={"version": body.skill_pack_version, "files_written": written},
    )

    return {
        "slug": slug,
        "version": body.skill_pack_version,
        "files_written": written,
        "sync_url": f"/api/v1/skill-packs/{slug}/delta",
        "sync_token": sync_token,
        "tracking": tracking,
        "workspace_id": principal.workspace_id,
        "published_at": published_at,
    }


# ---------------------------------------------------------------------------
# Installer upload (authed) + download (public)
# ---------------------------------------------------------------------------

@router.post("/{slug}/installer/upload")
async def post_installer_upload(slug: str, request: Request) -> dict[str, Any]:
    """Upload the built installer .exe as a raw octet-stream body.

    Query params: ``filename`` (display name), ``version``, ``release_notes``.
    """
    principal = principal_from_request(request)
    ensure_principal(principal)
    require_admin(principal)
    slug = _validate_slug(slug)
    _assert_owner(slug, principal.workspace_id)
    try:
        ensure_installer_slot_available(principal, slug)
    except EntitlementError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="entitlements_unavailable") from exc

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
    filename = request.query_params.get("filename") or f"{slug}-Plugin-Setup.exe"
    filename = Path(filename).name  # strip any path components
    plugin_record = next(
        (p for p in list_plugins(workspace_id=principal.workspace_id) if p.slug == slug),
        None,
    )
    workflow_count = len(plugin_record.workflows) if plugin_record is not None else 0

    out_dir = _installer_dir(slug)
    out_dir.mkdir(parents=True, exist_ok=True)
    version_dir = _installer_version_dir(slug, version)
    if version_dir.exists() or db_get(_installer_versions_ns(slug), version) is not None:
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
        _installer_versions_ns(slug),
        version,
        meta,
    )
    for _other_key, other_meta in db_list_kv(_installer_versions_ns(slug)):
        if not isinstance(other_meta, dict):
            continue
        other_version = other_meta.get("version")
        if other_version == version:
            continue
        if other_meta.get("is_latest"):
            other_meta["is_latest"] = False
            db_set(_installer_versions_ns(slug), other_version, other_meta)

    latest_exe_path = out_dir / "installer.exe"
    tmp_latest = latest_exe_path.with_suffix(".exe.tmp")
    tmp_latest.write_bytes(body)
    tmp_latest.replace(latest_exe_path)
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Persist installer metadata onto the plugin record so the dashboard can
    # surface version and a download button without reading the filesystem.
    if plugin_record is not None:
        plugin_record = plugin_record.model_copy(update={
            "installer": PluginInstaller(
                built_at=uploaded_at,
                installer_path=str(latest_exe_path),
                filename=filename,
                version=version,
                runtime_version="",
                release_notes=release_notes,
            )
        })
        save_plugin(plugin_record)

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


@router.get("/{slug}/installer/versions")
def get_installer_versions(slug: str, request: Request) -> dict[str, Any]:
    """Authenticated installer release history for the dashboard."""
    principal = principal_from_request(request)
    ensure_principal(principal)
    require_admin(principal)
    slug = _validate_slug(slug)
    owner = _owner_of(slug)
    if owner and owner != principal.workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")

    def _row_from_meta(meta: dict[str, Any], fallback_version: str) -> dict[str, Any]:
        version = str(meta.get("version") or fallback_version)
        row = {
            "slug": slug,
            "version": version,
            "release_notes": str(meta.get("release_notes") or ""),
            "filename": str(meta.get("filename") or f"{slug}-Plugin-Setup.exe"),
            "sha256": str(meta.get("sha256") or ""),
            "size": int(meta.get("size") or 0),
            "uploaded_at": float(meta.get("uploaded_at") or 0),
            "workspace_id": str(meta.get("workspace_id") or ""),
            "is_latest": bool(meta.get("is_latest")),
            "download_url": f"/api/v1/installers/{slug}/versions/{version}",
        }
        if "workflow_count" in meta:
            row["workflow_count"] = int(meta.get("workflow_count") or 0)
        return row

    # Merge disk (fast path, may be missing after a wipe) with Postgres (durable source
    # of truth). Postgres wins on conflict since disk can only ever be stale or absent.
    versions_by_key: dict[str, dict[str, Any]] = {}
    versions_dir = _installer_dir(slug) / "versions"
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
        for key, meta in db_list_kv(_installer_versions_ns(slug)):
            if not isinstance(meta, dict) or meta.get("workspace_id") != principal.workspace_id:
                continue
            dedup_key = str(meta.get("version") or key)
            versions_by_key[dedup_key] = _row_from_meta(meta, dedup_key)

    versions = list(versions_by_key.values())
    versions.sort(key=lambda item: float(item.get("uploaded_at") or 0), reverse=True)
    return {"slug": slug, "versions": versions}


def _stream_installer(
    exe_path: Path, meta_path: Path, *, slug: str, version: str | None
) -> StreamingResponse:
    if not exe_path.is_file() or not meta_path.is_file():
        fallback = _load_installer_from_db(slug, version)
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
def get_installer_version(slug: str, version: str) -> StreamingResponse:
    """Public exact-version installer download."""
    slug = _validate_slug(slug)
    version = _validate_version(version)
    version_dir = _installer_version_dir(slug, version)
    return _stream_installer(version_dir / "installer.exe", version_dir / "meta.json", slug=slug, version=version)


@installers_router.get("/{slug}")
def get_installer(slug: str) -> StreamingResponse:
    """Public end-user installer download. SHA-256 returned in X-Conxa-SHA256."""
    slug = _validate_slug(slug)
    out_dir = _installer_dir(slug)
    return _stream_installer(out_dir / "installer.exe", out_dir / "meta.json", slug=slug, version=None)
