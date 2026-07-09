"""Resolve screenshot paths under data_dir with traversal protection."""

from __future__ import annotations

import urllib.parse
from pathlib import Path

from conxa_core.config import settings


def resolve_skill_asset(relative_path: str) -> Path:
    """Return absolute path if ``relative_path`` resolves under ``settings.data_dir``."""
    raw = (relative_path or "").strip().replace("\\", "/")
    if not raw or ".." in raw or raw.startswith("/"):
        raise ValueError("invalid_asset_path")
    base = settings.data_dir.resolve()
    candidate = (base / raw).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise ValueError("asset_path_outside_data_dir") from exc
    return candidate


def asset_url(relative_path: str, *, asset_base_url: str, skill_id: str) -> str:
    """Return a renderer-loadable URL for a persisted visual asset.

    Local (Studio) assets resolve through the ``conxa-asset://`` protocol the
    Electron main process registers, which streams the file from disk on
    demand. This is validation-only (no disk read) so it stays cheap even
    when a workflow response fans out over hundreds of assets.
    """
    if asset_base_url.strip().lower().startswith("file://"):
        relative_path = resolve_skill_asset(relative_path).relative_to(settings.data_dir.resolve()).as_posix()
        return f"conxa-asset://local/{urllib.parse.quote(relative_path)}"
    q = urllib.parse.urlencode({"path": relative_path})
    base = asset_base_url.rstrip("/")
    sid_q = urllib.parse.quote(skill_id, safe="")
    return f"{base}/skills/{sid_q}/assets?{q}"
