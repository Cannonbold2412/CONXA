"""Verify that workflow reads are scoped to workspace_id."""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from conxa_core.models.workflow import Workflow
from conxa_core.config import settings
from conxa_core.storage import workflow_store


@pytest.fixture()
def tmp_workflows_dir(tmp_path: Path):
    with (
        patch.object(settings, "data_dir", tmp_path),
        patch.object(settings, "database_url", ""),
        patch.object(workflow_store, "_workflows_dir", return_value=tmp_path),
    ):
        yield tmp_path


def _make_workflow(workflows_dir: Path, workflow_id: str, workspace_id: str) -> None:
    import json, time
    data = {
        "id": workflow_id,
        "slug": f"workflow-{workflow_id[:8]}",
        "name": "Test Workflow",
        "workspace_id": workspace_id,
        "target_url": "https://example.com",
        "protected_url": "https://example.com/app",
        "status": "needs_auth",
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    (workflows_dir / f"{workflow_id}.json").write_text(json.dumps(data), encoding="utf-8")


def test_list_workflows_scoped(tmp_workflows_dir):
    _make_workflow(tmp_workflows_dir, "aaa-aaa-aaa-aaa1", "org_A")
    _make_workflow(tmp_workflows_dir, "bbb-bbb-bbb-bbb2", "org_B")

    workflows_a = workflow_store.list_workflows(workspace_id="org_A")
    workflows_b = workflow_store.list_workflows(workspace_id="org_B")

    assert len(workflows_a) == 1
    assert workflows_a[0].workspace_id == "org_A"
    assert len(workflows_b) == 1
    assert workflows_b[0].workspace_id == "org_B"


def test_get_workflow_cross_tenant_returns_none(tmp_workflows_dir):
    _make_workflow(tmp_workflows_dir, "aaa-aaa-aaa-aaa1", "org_A")

    result = workflow_store.get_workflow("aaa-aaa-aaa-aaa1", workspace_id="org_B")
    assert result is None


def test_get_workflow_correct_tenant(tmp_workflows_dir):
    _make_workflow(tmp_workflows_dir, "aaa-aaa-aaa-aaa1", "org_A")

    result = workflow_store.get_workflow("aaa-aaa-aaa-aaa1", workspace_id="org_A")
    assert result is not None
    assert result.id == "aaa-aaa-aaa-aaa1"


def test_list_workflows_no_filter_returns_all(tmp_workflows_dir):
    _make_workflow(tmp_workflows_dir, "aaa-aaa-aaa-aaa1", "org_A")
    _make_workflow(tmp_workflows_dir, "bbb-bbb-bbb-bbb2", "org_B")

    all_workflows = workflow_store.list_workflows()
    assert len(all_workflows) == 2
