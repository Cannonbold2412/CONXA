"""Installer artifact storage layout, signed download links, and Postgres fallback.

The built ``{Company}-Setup.exe`` is cached on local disk and mirrored to
the KV store (Postgres in prod) so downloads survive Render's ephemeral disk.
Download links are HMAC-signed and time-limited when a signing key is configured.
Shared by ``publish_routes`` (upload/list/stream).
"""

from __future__ import annotations

import base64
import hmac
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

from conxa_core.config import settings
from conxa_core.db import db_get, db_list_kv, using_database


def sign_installer(slug: str, version: str | None, ts: int) -> str:
    """HMAC-SHA256 over ts:slug:version, mirroring saas.py's proxy-identity HMAC (SG-02)."""
    key = settings.installer_signing_key.encode()
    msg = f"{ts}:{slug}:{version or ''}".encode()
    return hmac.new(key, msg, "sha256").hexdigest()


def verify_installer_signature(slug: str, version: str | None, request: Request) -> None:
    """Reject expired/tampered installer download links (SG-07).

    A blank SKILL_INSTALLER_SIGNING_KEY preserves the legacy public-download
    behavior for local dev — matches the SKILL_API_BASE_URL fallback pattern.
    """
    if not settings.installer_signing_key:
        return
    ts_param = request.query_params.get("ts", "")
    sig_param = request.query_params.get("sig", "")
    try:
        ts = int(ts_param)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="invalid_or_expired_download_link")
    if abs(time.time() - ts) > settings.installer_signing_window:
        raise HTTPException(status_code=401, detail="invalid_or_expired_download_link")
    expected = sign_installer(slug, version, ts)
    if not sig_param or not secrets.compare_digest(sig_param, expected):
        raise HTTPException(status_code=401, detail="invalid_or_expired_download_link")


def installer_dir(slug: str) -> Path:
    return settings.data_dir / "installers" / slug


def installer_version_dir(slug: str, version: str) -> Path:
    return installer_dir(slug) / "versions" / version


def installer_versions_ns(slug: str) -> str:
    # No ':' — the fs-fallback KV store (local dev / Windows) uses the namespace
    # as a literal directory name, and ':' is illegal in Windows paths.
    return f"installer_versions__{slug}"


def load_installer_from_db(slug: str, version: str | None) -> tuple[dict[str, Any], bytes] | None:
    """Durable fallback for when the Render local disk has been wiped (free plan has no
    persistent disk and idles out, taking on-disk installer files with it). Postgres is the
    source of truth; local disk is just a fast-path cache rehydrated from here on miss."""
    if not using_database():
        return None
    if version:
        meta = db_get(installer_versions_ns(slug), version)
        rows = [(version, meta)] if isinstance(meta, dict) else []
    else:
        rows = [(k, v) for k, v in db_list_kv(installer_versions_ns(slug)) if isinstance(v, dict)]
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
