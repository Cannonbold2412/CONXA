"""SkillPack keyed by workspace_id only. Each workspace has exactly one pack."""

from __future__ import annotations

import pytest

from conxa_core.storage.skill_packages import validate_bundle_slug
from conxa_core.workspace import workspace_dir_slug


@pytest.mark.parametrize(
    "workspace_id",
    [
        "wrk_local",
        "wrk_acme_co",
        "wrk_1password",
        "wrk-company-with-hyphens",
    ],
)
def test_workspace_dir_slug_always_valid(workspace_id):
    slug = workspace_dir_slug(workspace_id)
    assert validate_bundle_slug(slug)
    assert slug[0].isalpha()  # must be letter-prefixed


def test_get_skill_pack_returns_by_workspace_id(monkeypatch, tmp_path):
    from conxa_core import db
    from conxa_core.config import settings
    from conxa_core.storage import skill_pack_store

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    from conxa_core.models.workflow import SkillPack

    workspace_id = "wrk_acme"
    slug = workspace_dir_slug(workspace_id)
    packs_dir = tmp_path / "skill-packs" / slug
    packs_dir.mkdir(parents=True)
    (packs_dir / "pack.json").write_text("{}", encoding="utf-8")

    skill_pack_store.save_skill_pack(
        SkillPack(
            workspace_id=workspace_id,
            display_name="Acme Automation",
            created_at=0.0,
        )
    )

    pack = skill_pack_store.get_skill_pack(workspace_id)

    assert pack is not None
    assert pack.workspace_id == workspace_id
    assert pack.display_name == "Acme Automation"
    assert (packs_dir / "pack.json").is_file()


def test_workspace_dir_slug_consistent(monkeypatch, tmp_path):
    from conxa_core import db
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    workspace_id = "wrk-customer-123"
    slug1 = workspace_dir_slug(workspace_id)
    slug2 = workspace_dir_slug(workspace_id)

    # Same workspace_id should always produce same slug
    assert slug1 == slug2
    # Slug should be character-safe
    assert all(c in "abcdefghijklmnopqrstuvwxyz0123456789_" for c in slug1)
