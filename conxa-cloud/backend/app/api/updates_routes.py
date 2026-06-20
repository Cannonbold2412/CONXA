"""
Phase 4.5 — dependency manifest endpoints for Build Studio bootstrap and runtime self-updater.

Public GET endpoints (no auth):
  GET /updates/deps-manifest          — fetched by Build Studio bootstrap before Clerk login
  GET /updates/conxa-runtime-manifest  — fetched by runtime self-updater (host layer, ~85 MB, quarterly)
  GET /updates/conxa-app-manifest   — fetched by runtime self-updater (app layer, ~60 KB zip, every release)
  GET /updates/studio-manifest        — fetched by web frontend for download link
  GET /updates/studio/latest.yml      — served to electron-updater

Admin POST endpoints (Bearer CONXA_ADMIN_TOKEN required — called by CI after each build):
  POST /updates/conxa-runtime-manifest — update host manifest vars in memory
  POST /updates/conxa-app-manifest  — update app manifest vars in memory
"""

import os
import re
from datetime import datetime, timezone
from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response

router = APIRouter(tags=["updates"])

_ADMIN_TOKEN = os.environ.get("CONXA_ADMIN_TOKEN", "")

# ── Defaults baked in (CI overrides via env) ──────────────────────────────────

_NSIS_VERSION = os.environ.get("CONXA_NSIS_VERSION", "3.10")
_NSIS_URL = os.environ.get(
    "CONXA_NSIS_URL",
    f"https://downloads.sourceforge.net/project/nsis/NSIS%203/{_NSIS_VERSION}/nsis-{_NSIS_VERSION}.zip",
)
_NSIS_SHA256 = os.environ.get("CONXA_NSIS_SHA256", "")

# The actual repo hosting release artifacts. Override via env on Render once a
# dedicated org/repo is established. Default points at the monorepo where CI
# publishes runtime and studio releases.
_GITHUB_REPO = os.environ.get("CONXA_GITHUB_REPO", "Cannonbold2412/CONXA")

# Host layer (large binary, quarterly)
_HOST_VERSION = os.environ.get("CONXA_HOST_VERSION", "host-v1.0.0")
_HOST_WIN_URL = os.environ.get(
    "CONXA_HOST_WIN_URL",
    f"https://github.com/{_GITHUB_REPO}/releases/download/{_HOST_VERSION}/conxa-runtime.exe",
)
_HOST_WIN_SHA256 = os.environ.get("CONXA_HOST_WIN_SHA256", "")
_RUNTIME_KEYTAR_URL = os.environ.get(
    "CONXA_KEYTAR_WIN_URL",
    f"https://github.com/{_GITHUB_REPO}/releases/download/{_HOST_VERSION}/keytar.node",
)
_RUNTIME_KEYTAR_SHA256 = os.environ.get("CONXA_KEYTAR_WIN_SHA256", "")

# App layer (small zip, every release)
_APP_VERSION = os.environ.get("CONXA_APP_VERSION", "app-v1.0.0")
_APP_MIN_HOST = os.environ.get("CONXA_APP_MIN_HOST", "host-v1.0.0")
_APP_BUNDLE_URL = os.environ.get("CONXA_APP_BUNDLE_URL", "")
_APP_BUNDLE_SHA = os.environ.get("CONXA_APP_BUNDLE_SHA256", "")

_PLAYWRIGHT_VERSION = os.environ.get("CONXA_PLAYWRIGHT_VERSION", "1.61.0")
_CHROMIUM_REVISION = os.environ.get("CONXA_CHROMIUM_REVISION", "1228")

_STUDIO_VERSION = os.environ.get("CONXA_STUDIO_VERSION", "studio-v1.0.0")
_STUDIO_WIN_URL = os.environ.get(
    "CONXA_STUDIO_WIN_URL",
    f"https://github.com/{_GITHUB_REPO}/releases/download/{_STUDIO_VERSION}/Conxa%20Build%20Studio%20Setup%201.0.0.exe",
)
_STUDIO_WIN_SHA256 = os.environ.get("CONXA_STUDIO_WIN_SHA256", "")
_STUDIO_WIN_SHA512 = os.environ.get("CONXA_STUDIO_WIN_SHA512", "")


@router.get("/updates/deps-manifest", include_in_schema=False)
def deps_manifest() -> dict:
    """
    Build Studio bootstrap.py fetches this on every startup to check for
    dependency updates. Public — called before the user logs in.

    Returns both legacy top-level keys (for pre-v2 Build Studio installs) and
    a generic ``deps`` dict that the v2 update loop iterates over. Adding a new
    dep only requires updating cloud env vars and the ``deps`` dict below —
    no Build Studio release needed as long as the dep's action is a known type
    ("copy" or "extract_zip").
    """
    return {
        # ── v2 envelope ──────────────────────────────────────────────────────
        "manifest_version": 2,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # ── legacy keys (v1 clients) ─────────────────────────────────────────
        "nsis": {
            "version": _NSIS_VERSION,
            "url": _NSIS_URL,
            "sha256": _NSIS_SHA256,
        },
        "runtime": {
            "version": _HOST_VERSION,
            "win_url": _HOST_WIN_URL,
            "win_sha256": _HOST_WIN_SHA256,
            "keytar_url": _RUNTIME_KEYTAR_URL,
            "keytar_sha256": _RUNTIME_KEYTAR_SHA256,
        },
        "runtime_app": {
            "app_version": _APP_VERSION,
            "min_host": _APP_MIN_HOST,
            "bundle_url": _APP_BUNDLE_URL,
            "bundle_sha256": _APP_BUNDLE_SHA,
        },
        # ── v2 generic deps dict ─────────────────────────────────────────────
        "deps": {
            "nsis": {
                "version": _NSIS_VERSION,
                "files": [
                    {
                        "filename": "nsis.zip",
                        "url": _NSIS_URL,
                        "sha256": _NSIS_SHA256,
                        "action": "extract_zip",
                    }
                ],
            },
            "runtime": {
                "version": _HOST_VERSION,
                "files": [
                    {
                        "filename": "conxa-runtime.exe",
                        "url": _HOST_WIN_URL,
                        "sha256": _HOST_WIN_SHA256,
                        "action": "copy",
                    },
                    {
                        "filename": "keytar.node",
                        "url": _RUNTIME_KEYTAR_URL,
                        "sha256": _RUNTIME_KEYTAR_SHA256,
                        "action": "copy",
                    },
                ],
            },
        },
    }


@router.get("/updates/studio/latest.yml", include_in_schema=False)
def studio_latest_yml() -> Response:
    """
    Served to electron-updater's generic provider so the path: field is always
    derived from CONXA_STUDIO_WIN_URL. Using absolute files[].url means the
    actual .exe downloads directly from GitHub without proxying through the cloud.
    """
    bare_version = re.sub(r"^studio-v", "", _STUDIO_VERSION).lstrip("v")
    filename = unquote(_STUDIO_WIN_URL.split("/")[-1])
    lines = [
        f"version: {bare_version}",
        "files:",
        f"  - url: {_STUDIO_WIN_URL}",
    ]
    if _STUDIO_WIN_SHA512:
        lines.append(f"    sha512: {_STUDIO_WIN_SHA512}")
    lines += [
        f"path: {filename}",
        f"releaseDate: '{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')}'",
    ]
    return Response("\n".join(lines) + "\n", media_type="text/yaml")


@router.get("/updates/studio-manifest", include_in_schema=False)
def studio_manifest() -> dict:
    """
    Fetched by the web frontend to surface the Build Studio download link.
    Public — called without authentication.
    Set CONXA_STUDIO_WIN_URL on Render once the installer is published.
    """
    return {
        "version": _STUDIO_VERSION,
        "win_url": _STUDIO_WIN_URL,
        "win_sha256": _STUDIO_WIN_SHA256,
    }


@router.get("/updates/conxa-runtime-manifest", include_in_schema=False)
def runtime_host_manifest() -> dict:
    """
    runtime/server.js fetches this on each cold start (cached 1h) to check whether
    conxa-runtime.exe needs updating.
    """
    return {
        "host_version": _HOST_VERSION,
        "url": _HOST_WIN_URL,
        "sha256": _HOST_WIN_SHA256,
        "keytar_url": _RUNTIME_KEYTAR_URL,
        "keytar_sha256": _RUNTIME_KEYTAR_SHA256,
        "playwright_version": _PLAYWRIGHT_VERSION,
        "chromium_revision": _CHROMIUM_REVISION,
    }


@router.get("/updates/conxa-app-manifest", include_in_schema=False)
def runtime_app_manifest() -> dict:
    """
    runtime/server.js fetches this on each cold start (cached 1h) to check whether
    the app layer zip needs updating. A new 60 KB zip ships on every code release.
    """
    return {
        "app_version": _APP_VERSION,
        "min_host": _APP_MIN_HOST,
        "bundle_url": _APP_BUNDLE_URL,
        "bundle_sha256": _APP_BUNDLE_SHA,
    }


def _require_admin(authorization: str = Header(default="")) -> None:
    if not _ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin token not configured")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != _ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/updates/conxa-runtime-manifest", include_in_schema=False)
def update_runtime_host_manifest(body: dict, authorization: str = Header(default="")) -> dict:
    """CI calls this after each host build to update in-memory manifest vars."""
    _require_admin(authorization)
    global _HOST_VERSION, _HOST_WIN_URL, _HOST_WIN_SHA256, _RUNTIME_KEYTAR_URL, _RUNTIME_KEYTAR_SHA256
    if "host_version" in body: _HOST_VERSION       = body["host_version"]
    if "url"          in body: _HOST_WIN_URL         = body["url"]
    if "sha256"       in body: _HOST_WIN_SHA256      = body["sha256"]
    if "keytar_url"   in body: _RUNTIME_KEYTAR_URL   = body["keytar_url"]
    if "keytar_sha256" in body: _RUNTIME_KEYTAR_SHA256 = body["keytar_sha256"]
    return {"ok": True}


@router.post("/updates/conxa-app-manifest", include_in_schema=False)
def update_runtime_app_manifest(body: dict, authorization: str = Header(default="")) -> dict:
    """CI calls this after each app-layer build to update in-memory manifest vars."""
    _require_admin(authorization)
    global _APP_VERSION, _APP_MIN_HOST, _APP_BUNDLE_URL, _APP_BUNDLE_SHA
    if "app_version"   in body: _APP_VERSION    = body["app_version"]
    if "min_host"      in body: _APP_MIN_HOST   = body["min_host"]
    if "bundle_url"    in body: _APP_BUNDLE_URL = body["bundle_url"]
    if "bundle_sha256" in body: _APP_BUNDLE_SHA = body["bundle_sha256"]
    return {"ok": True}
