"""Filesystem JSON persistence for SkillPack — the shared package a
workspace's workflows compile into (see conxa_core.models.workflow).

Keyed by workspace_id: one workspace has exactly one skill pack and one
installer, forever (see CLAUDE.md Key Invariants). Both the cloud (multi-
tenant) and Build Studio (single-tenant per install, LOCAL_WORKSPACE_ID) use
the same workspace_id-keyed storage below.

Layout:
  data/skill_pack_meta/{workspace_dir_slug}.json  — one file per workspace
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_list
from conxa_core.models.workflow import SkillPack, SkillPackBuild, SkillPackInstaller
from conxa_core.workspace import workspace_dir_slug


def _dir() -> Path:
    p = settings.data_dir / "skill_pack_meta"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path(workspace_id: str) -> Path:
    return _dir() / f"{workspace_dir_slug(workspace_id)}.json"


def _read_raw(workspace_id: str) -> dict[str, Any] | None:
    data = db_get("skill_pack_meta", workspace_id)
    if data is not None:
        return data
    path = _path(workspace_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_raw(pack: SkillPack) -> None:
    d = pack.model_dump(mode="json")
    db_set("skill_pack_meta", pack.workspace_id, d)
    try:
        _path(pack.workspace_id).write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def list_skill_packs(workspace_id: str = "") -> list[SkillPack]:
    db_items = db_list("skill_pack_meta")
    out: list[SkillPack] = []
    if db_items:
        for raw in db_items:
            try:
                out.append(SkillPack.model_validate(raw))
            except Exception:
                continue
    else:
        for path in _dir().glob("*.json"):
            try:
                out.append(SkillPack.model_validate(json.loads(path.read_text(encoding="utf-8"))))
            except Exception:
                continue
    if workspace_id:
        out = [p for p in out if p.workspace_id == workspace_id]
    return out


def save_skill_pack(pack: SkillPack) -> SkillPack:
    pack = pack.model_copy(update={"updated_at": time.time()})
    _write_raw(pack)
    return pack


def get_skill_pack(workspace_id: str) -> SkillPack | None:
    raw = _read_raw(workspace_id)
    if raw is None:
        return None
    try:
        return SkillPack.model_validate(raw)
    except Exception:
        return None


def get_or_create_skill_pack(workspace_id: str, display_name: str | None = None) -> SkillPack:
    """Return the workspace's SkillPack, creating it on first use."""
    existing = get_skill_pack(workspace_id)
    if existing is not None:
        return existing
    return save_skill_pack(SkillPack(
        workspace_id=workspace_id,
        display_name=(display_name or "").strip(),
        created_at=time.time(),
    ))


def set_build(workspace_id: str, output_path: str, version: str = "0.1.0") -> SkillPack | None:
    pack = get_skill_pack(workspace_id)
    if pack is None:
        return None
    pack.build = SkillPackBuild(last_built_at=time.time(), output_path=output_path, version=version)
    return save_skill_pack(pack)


def set_installer(
    workspace_id: str,
    *,
    installer_path: str,
    filename: str,
    version: str,
    runtime_version: str,
    release_notes: str = "",
) -> SkillPack | None:
    pack = get_skill_pack(workspace_id)
    if pack is None:
        return None
    pack.installer = SkillPackInstaller(
        built_at=time.time(),
        installer_path=installer_path,
        filename=filename,
        version=version,
        runtime_version=runtime_version,
        release_notes=release_notes,
    )
    return save_skill_pack(pack)
