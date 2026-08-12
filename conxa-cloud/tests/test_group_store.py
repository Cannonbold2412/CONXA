"""CRUD, per-app auth stamping, and default-group behavior for WorkflowGroup."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from conxa_core.config import settings
from conxa_core.storage import group_store


@pytest.fixture()
def tmp_groups_dir(tmp_path: Path):
    with (
        patch.object(settings, "data_dir", tmp_path),
        patch.object(settings, "database_url", ""),
        patch.object(group_store, "_groups_dir", return_value=tmp_path),
    ):
        yield tmp_path


def test_create_and_get_group(tmp_groups_dir):
    group = group_store.create_group("Sales")
    fetched = group_store.get_group(group.id)
    assert fetched is not None
    assert fetched.name == "Sales"
    assert fetched.apps == []


def test_ensure_default_group_idempotent(tmp_groups_dir):
    first = group_store.ensure_default_group()
    second = group_store.ensure_default_group()
    assert first.id == second.id
    assert len([g for g in group_store.list_groups() if g.name == "Default"]) == 1


def test_add_app_assigns_stable_unique_id(tmp_groups_dir):
    group = group_store.create_group("Sales")
    group = group_store.add_app(group.id, "Salesforce", "https://sf.com/login", "https://sf.com")
    group = group_store.add_app(group.id, "Salesforce", "https://sf2.com/login", "https://sf2.com")
    ids = [a.id for a in group.apps]
    assert ids[0] == "salesforce"
    assert ids[1] == "salesforce-2"
    assert ids[0] != ids[1]


def test_set_and_clear_group_app_auth(tmp_groups_dir):
    group = group_store.create_group("Sales")
    group = group_store.add_app(group.id, "GitHub", "https://github.com/login", "https://github.com")
    app_id = group.apps[0].id

    updated = group_store.set_group_app_auth(group.id, app_id, str(tmp_groups_dir / "state.json"))
    assert updated.apps[0].captured_at is not None
    assert updated.apps[0].storage_state_path

    cleared = group_store.clear_group_app_auth(group.id, app_id)
    assert cleared.apps[0].captured_at is None
    assert cleared.apps[0].storage_state_path == ""


def test_remove_app_drops_it_from_the_list(tmp_groups_dir):
    group = group_store.create_group("Sales")
    group = group_store.add_app(group.id, "GitHub", "https://github.com/login", "https://github.com")
    app_id = group.apps[0].id
    updated = group_store.remove_app(group.id, app_id)
    assert updated.apps == []


def test_delete_group(tmp_groups_dir):
    group = group_store.create_group("Sales")
    assert group_store.delete_group(group.id) is True
    assert group_store.get_group(group.id) is None
    assert group_store.delete_group(group.id) is False
