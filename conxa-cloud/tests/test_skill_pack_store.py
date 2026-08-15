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
    ],
)
def test_company_slug_always_valid(workspace_id, name):
    assert validate_bundle_slug(company_slug(workspace_id, name))


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
