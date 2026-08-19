"""company_slug() must always satisfy validate_bundle_slug, and a legacy
record persisted with an invalid (hyphenated) slug must self-heal on read
rather than keep failing bundle-name validation forever."""

from __future__ import annotations

import pytest

from conxa_core.storage.skill_packages import validate_bundle_slug
from conxa_core.workspace import company_slug


@pytest.mark.parametrize(
    "workspace_id,name",
    [
        ("wrk_local", "Create a Lead"),
        ("wrk_local", "Acme Co."),
        ("wrk_local", "1Password"),  # digit-leading name
        (
            "wrk_local",
            "Deploy a service on Render then visit frontend on Vercel",
        ),
    ],
)
def test_company_slug_always_valid(workspace_id, name):
    slug = company_slug(workspace_id, name)
    assert validate_bundle_slug(slug)
    assert len(slug) <= 64


def test_get_skill_pack_heals_overlong_slug(monkeypatch, tmp_path):
    from conxa_core import db
    from conxa_core.config import settings
    from conxa_core.storage import skill_pack_store

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    from conxa_core.models.workflow import SkillPack

    long_name = "Deploy a service on Render then visit frontend on Vercel"
    bad_slug = f"deploy_a_service_on_render_then_visit_frontend_on_vercel_wrklocal"
    packs_dir = tmp_path / "skill-packs" / bad_slug
    packs_dir.mkdir(parents=True)
    (packs_dir / "pack.json").write_text("{}", encoding="utf-8")

    skill_pack_store.save_skill_pack(
        SkillPack(
            workspace_id="wrk_local",
            company_slug=bad_slug,
            company_name=long_name,
            created_at=0.0,
        )
    )

    pack = skill_pack_store.get_skill_pack("wrk_local")

    assert pack is not None
    assert len(pack.company_slug) <= 64
    assert validate_bundle_slug(pack.company_slug)
    assert (tmp_path / "skill-packs" / pack.company_slug / "pack.json").is_file()
    assert not (tmp_path / "skill-packs" / bad_slug).exists()


def test_get_skill_pack_heals_legacy_hyphenated_slug(monkeypatch, tmp_path):
    from conxa_core import db
    from conxa_core.config import settings
    from conxa_core.storage import skill_pack_store

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    from conxa_core.models.workflow import SkillPack

    bad_slug = "create-a-lead-wrklocal"
    skill_pack_store.save_skill_pack(
        SkillPack(
            workspace_id="wrk_local",
            company_slug=bad_slug,
            company_name="Create a Lead",
            created_at=0.0,
        )
    )
    assert skill_pack_store._read_raw(bad_slug) is not None

    pack = skill_pack_store.get_skill_pack("wrk_local")

    assert pack is not None
    assert validate_bundle_slug(pack.company_slug)
    assert pack.company_slug == "create_a_lead_wrklocal"
    assert skill_pack_store._read_raw(bad_slug) is None
    assert skill_pack_store._read_raw(pack.company_slug) is not None
