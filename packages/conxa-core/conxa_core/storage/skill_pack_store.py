"""Filesystem JSON persistence for SkillPack — the shared package a company's
workflows compile into (see conxa_core.models.workflow).

Keyed by company_slug (globally unique — see publish_routes.py's
_assert_not_owned_by_other), not by workspace_id: the cloud is multi-tenant
and a single workspace may publish under any number of slugs (e.g. an agency
running several client companies from one account). Build Studio is
single-tenant per install (LOCAL_WORKSPACE_ID), so its call sites use the
workspace-scoped helpers below, which are a thin convenience over the same
slug-keyed storage.

Layout:
  data/skill_pack_meta/{company_slug}.json  — one file per company
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_list
from conxa_core.models.workflow import SkillPack, SkillPackBuild, SkillPackInstaller
from conxa_core.workspace import company_slug as _derive_company_slug


def _dir() -> Path:
    p = settings.data_dir / "skill_pack_meta"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path(slug: str) -> Path:
    return _dir() / f"{slug}.json"


def _read_raw(slug: str) -> dict[str, Any] | None:
    data = db_get("skill_pack_meta", slug)
    if data is not None:
        return data
    path = _path(slug)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_raw(pack: SkillPack) -> None:
    d = pack.model_dump(mode="json")
    db_set("skill_pack_meta", pack.company_slug, d)
    try:
        _path(pack.company_slug).write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def get_skill_pack_by_slug(company_slug: str) -> SkillPack | None:
    raw = _read_raw(company_slug)
    if raw is None:
        return None
    try:
        return SkillPack.model_validate(raw)
    except Exception:
        return None


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


def upsert_skill_pack_by_slug(
    company_slug: str,
    *,
    workspace_id: str,
    company_name: str,
) -> SkillPack:
    """Cloud entry point: create or update the published record for a slug.

    A slug is claimed by exactly one workspace (see publish_routes.py's
    ownership check, enforced before this is called) but a workspace may own
    several slugs, so this is looked up by slug — never by workspace_id.
    """
    existing = get_skill_pack_by_slug(company_slug)
    now = time.time()
    if existing is None:
        pack = SkillPack(
            workspace_id=workspace_id,
            company_slug=company_slug,
            company_name=company_name,
            created_at=now,
        )
    else:
        pack = existing.model_copy(update={
            "workspace_id": workspace_id,
            "company_name": company_name,
        })
    return save_skill_pack(pack)


def save_skill_pack(pack: SkillPack) -> SkillPack:
    pack = pack.model_copy(update={"updated_at": time.time()})
    _write_raw(pack)
    return pack


# ─── Build Studio convenience: workspace-scoped (single-tenant local install) ──

def get_skill_pack(workspace_id: str) -> SkillPack | None:
    """Build Studio is single-tenant (LOCAL_WORKSPACE_ID) — at most one
    SkillPack ever exists per local install, so a scan is fine."""
    for pack in list_skill_packs(workspace_id):
        return pack
    return None


def get_or_create_skill_pack(workspace_id: str, company_name: str | None = None) -> SkillPack:
    """Return the workspace's SkillPack, creating it on first use.

    company_name is required the first time a workspace builds or publishes
    (nothing to derive it from otherwise); every subsequent call reuses the
    stored name and ignores a mismatched one.
    """
    existing = get_skill_pack(workspace_id)
    if existing is not None:
        return existing
    name = (company_name or "").strip()
    if not name:
        raise ValueError("company_name is required to create the workspace's skill pack.")
    return upsert_skill_pack_by_slug(
        _derive_company_slug(workspace_id, name),
        workspace_id=workspace_id,
        company_name=name,
    )


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
