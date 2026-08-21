"""A workflow JSON written before Workflow Groups shipped (no group_id, still
carrying the old `auth` block) must still load, and land in the workspace's
Default group."""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from conxa_core.config import settings
from conxa_core.storage import group_store, workflow_store
from conxa_core.workspace import LOCAL_WORKSPACE_ID


@pytest.fixture()
def tmp_data_dir(tmp_path: Path):
    workflows_dir = tmp_path / "workflows"
    workflows_dir.mkdir()
    groups_dir = tmp_path / "groups"
    groups_dir.mkdir()
    with (
        patch.object(settings, "data_dir", tmp_path),
        patch.object(settings, "database_url", ""),
        patch.object(workflow_store, "_workflows_dir", return_value=workflows_dir),
        patch.object(group_store, "_groups_dir", return_value=groups_dir),
    ):
        yield tmp_path


def test_legacy_workflow_migrates_into_default_group(tmp_data_dir):
    legacy = {
        "id": "legacy-1",
        "slug": "legacy-workflow-1",
        "name": "Legacy Workflow",
        "workspace_id": LOCAL_WORKSPACE_ID,
        "target_url": "https://example.com",
        "status": "ready",
        # The field this model no longer defines — Pydantic v2 ignores it by default.
        "auth": {"session_id": "s1", "captured_at": time.time(), "storage_state_path": "auth.json"},
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    (tmp_data_dir / "workflows" / "legacy-1.json").write_text(json.dumps(legacy), encoding="utf-8")

    workflow = workflow_store.get_workflow("legacy-1")
    assert workflow is not None
    assert not hasattr(workflow, "auth")
    assert workflow.group_id, "migration must assign a group_id"

    default_group = group_store.ensure_default_group(LOCAL_WORKSPACE_ID)
    assert workflow.group_id == default_group.id


def test_legacy_workflow_via_list_workflows_also_migrates(tmp_data_dir):
    legacy = {
        "id": "legacy-2",
        "slug": "legacy-workflow-2",
        "name": "Legacy Workflow 2",
        "workspace_id": LOCAL_WORKSPACE_ID,
        "target_url": "https://example.com",
        "status": "needs_auth",
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    (tmp_data_dir / "workflows" / "legacy-2.json").write_text(json.dumps(legacy), encoding="utf-8")

    workflows = workflow_store.list_workflows()
    assert len(workflows) == 1
    assert workflows[0].group_id == group_store.ensure_default_group(LOCAL_WORKSPACE_ID).id


def test_empty_default_group_is_hidden_from_the_group_list(tmp_data_dir):
    """The Default group is a landing spot for group-less workflows, not a folder
    every workspace should start with — cmd_list_groups hides it while empty and
    shows it the moment it actually holds a workflow."""
    from handlers.groups import GroupsMixin

    backend = GroupsMixin()
    group_store.ensure_default_group(LOCAL_WORKSPACE_ID)
    group_store.create_group("Sales", workspace_id=LOCAL_WORKSPACE_ID)

    with patch.object(GroupsMixin, "_sync_group_to_cloud", return_value=True):
        names = [g["name"] for g in backend.cmd_list_groups({}, "r1")["groups"]]
    assert names == ["Sales"]

    workflow_store.create_workflow(
        name="Orphan",
        target_url="https://example.com",
        workspace_id=LOCAL_WORKSPACE_ID,
    )
    with patch.object(GroupsMixin, "_sync_group_to_cloud", return_value=True):
        names = [g["name"] for g in backend.cmd_list_groups({}, "r1")["groups"]]
    assert sorted(names) == ["Default", "Sales"]
