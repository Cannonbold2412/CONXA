"""Filesystem JSON persistence for Workflow entities.

Layout:
  data/workflows/{workflow_id}.json  — one file per workflow
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_set, db_delete, db_list
from conxa_core.models.workflow import Workflow
from conxa_core.workspace import LOCAL_WORKSPACE_ID


def _workflows_dir() -> Path:
    p = settings.data_dir / "workflows"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _workflow_path(workflow_id: str) -> Path:
    return _workflows_dir() / f"{workflow_id}.json"


def _read_raw(workflow_id: str) -> dict[str, Any] | None:
    data = db_get("workflows", workflow_id)
    if data is not None:
        return data
    path = _workflow_path(workflow_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_raw(workflow: Workflow) -> None:
    d = workflow.model_dump(mode="json")
    db_set("workflows", workflow.id, d)
    try:
        path = _workflow_path(workflow.id)
        path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _migrate_workspace(raw: dict) -> dict:
    if not raw.get("workspace_id"):
        raw["workspace_id"] = LOCAL_WORKSPACE_ID
    if not raw.get("group_id"):
        from conxa_core.storage.group_store import ensure_default_group

        raw["group_id"] = ensure_default_group(raw["workspace_id"]).id
    return raw


def _heal_workflow_slug(workflow: Workflow) -> Workflow:
    """Truncate overlong slugs (cloud publish caps at MAX_SLUG_LEN) and rename built output."""
    from conxa_core.slugs import MAX_SLUG_LEN, fit_slug

    if len(workflow.slug) <= MAX_SLUG_LEN:
        return workflow
    import re

    slug_base = re.sub(r"[^a-z0-9]+", "-", workflow.name.lower()).strip("-") or "workflow"
    new_slug = fit_slug(slug_base, workflow.id[:8], "-")
    if new_slug == workflow.slug:
        return workflow
    old_slug = workflow.slug
    workflow = workflow.model_copy(update={"slug": new_slug, "updated_at": time.time()})
    _write_raw(workflow)
    _rename_workflow_skill_dirs(workflow.workspace_id, old_slug, new_slug)
    return workflow


def _rename_workflow_skill_dirs(workspace_id: str, old_slug: str, new_slug: str) -> None:
    """Move built skill folders when a workflow slug is shortened."""
    if old_slug == new_slug:
        return
    from conxa_core.storage.skill_pack_store import get_skill_pack
    from conxa_core.storage.skill_packages import bundle_root_dir
    from conxa_core.workspace import workspace_dir_slug

    pack = get_skill_pack(workspace_id)
    if pack is None:
        return
    pack_slug = workspace_dir_slug(pack.workspace_id)
    packs_root = settings.data_dir / "skill-packs" / pack_slug
    if packs_root.is_dir():
        for group_dir in packs_root.iterdir():
            if not group_dir.is_dir():
                continue
            old_path = group_dir / old_slug
            new_path = group_dir / new_slug
            if old_path.is_dir() and not new_path.exists():
                old_path.rename(new_path)
        pack_json = packs_root / "pack.json"
        if pack_json.is_file():
            try:
                data = json.loads(pack_json.read_text(encoding="utf-8"))
                groups = data.get("skill_groups") or {}
                if old_slug in groups:
                    groups[new_slug] = groups.pop(old_slug)
                    data["skill_groups"] = groups
                    pack_json.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            except (OSError, json.JSONDecodeError, TypeError):
                pass
    bundle = bundle_root_dir(pack_slug)
    if bundle is not None:
        old_skill = bundle / "skills" / old_slug
        new_skill = bundle / "skills" / new_slug
        if old_skill.is_dir() and not new_skill.exists():
            old_skill.rename(new_skill)


def create_workflow(
    name: str,
    target_url: str,
    protected_url: str = "",
    protected_url_marker_text: str = "",
    workspace_id: str = "",
    owner_user_id: str = "local",
    group_id: str = "",
) -> Workflow:
    import re
    from conxa_core.storage.group_store import ensure_default_group

    from conxa_core.slugs import fit_slug

    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workflow"
    workflow_id = str(uuid.uuid4())
    now = time.time()
    workspace_id = workspace_id or LOCAL_WORKSPACE_ID
    workflow = Workflow(
        id=workflow_id,
        slug=fit_slug(slug_base, workflow_id[:8], "-"),
        name=name,
        owner_user_id=owner_user_id,
        workspace_id=workspace_id,
        group_id=group_id or ensure_default_group(workspace_id).id,
        target_url=target_url,
        protected_url=protected_url,
        protected_url_marker_text=protected_url_marker_text,
        status="needs_auth",
        created_at=now,
        updated_at=now,
    )
    _write_raw(workflow)
    return workflow


def get_workflow(workflow_id: str, workspace_id: str = "") -> Workflow | None:
    raw = _read_raw(workflow_id)
    if raw is None:
        return None
    try:
        raw = _migrate_workspace(raw)
        workflow = Workflow.model_validate(raw)
        if workspace_id and workflow.workspace_id != workspace_id:
            return None
        return _heal_workflow_slug(workflow)
    except Exception:
        return None


def list_workflows(workspace_id: str = "") -> list[Workflow]:
    db_items = db_list("workflows")
    if db_items:
        out: list[Workflow] = []
        for raw in db_items:
            try:
                raw = _migrate_workspace(raw)
                workflow = Workflow.model_validate(raw)
                if workspace_id and workflow.workspace_id != workspace_id:
                    continue
                out.append(_heal_workflow_slug(workflow))
            except Exception:
                continue
        return sorted(out, key=lambda w: w.updated_at, reverse=True)
    # File fallback for local dev
    out = []
    base = _workflows_dir()
    paths = sorted(base.glob("*.json"), key=lambda p: p.stat().st_mtime_ns, reverse=True)
    for path in paths:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw = _migrate_workspace(raw)
            workflow = Workflow.model_validate(raw)
            if workspace_id and workflow.workspace_id != workspace_id:
                continue
            out.append(_heal_workflow_slug(workflow))
        except Exception:
            continue
    return out


def save_workflow(workflow: Workflow) -> Workflow:
    workflow = workflow.model_copy(update={"updated_at": time.time()})
    _write_raw(workflow)
    return workflow


def delete_workflow(workflow_id: str) -> bool:
    workflow = get_workflow(workflow_id)
    workflow_dir = _workflows_dir() / workflow_id
    db_delete("workflows", workflow_id)
    path = _workflow_path(workflow_id)
    existed = workflow is not None or path.is_file() or workflow_dir.exists()
    if path.is_file():
        path.unlink()
    if workflow_dir.is_dir():
        shutil.rmtree(workflow_dir)
    return existed


def set_workflow_status_from_group_auth(workflow_id: str, group_ready: bool) -> Workflow | None:
    """Recompute status from the owning group's auth readiness — auth is now
    captured once per group (see group_store.py), not per workflow."""
    workflow = get_workflow(workflow_id)
    if workflow is None:
        return None
    workflow.status = "ready" if group_ready else "needs_auth"
    return save_workflow(workflow)


def set_recording(workflow_id: str, session_id: str) -> Workflow | None:
    """Attach the workflow's single recording (was add_workflow onto Plugin.workflows[])."""
    workflow = get_workflow(workflow_id)
    if workflow is None:
        return None
    workflow.session_id = session_id
    workflow.recorded_at = time.time()
    workflow.recording_status = "recorded"
    return save_workflow(workflow)


def clear_recording(workflow_id: str) -> Workflow | None:
    """Undo set_recording — used when a recording is cancelled or comes back empty.

    Unlike the old add_workflow/remove_workflow pair, this never deletes the
    Workflow entity itself (it existed before recording started); it only resets
    the recording fields so the user can retry "Record Workflow" on the same entity.
    """
    workflow = get_workflow(workflow_id)
    if workflow is None:
        return None
    workflow.session_id = None
    workflow.recorded_at = None
    workflow.recording_status = None
    return save_workflow(workflow)


def invalidate_workflow_test_by_skill(skill_id: str) -> None:
    """Reset last_test_* and bump edited_at on any workflow that references this skill_id."""
    now = time.time()
    for workflow in list_workflows():
        if workflow.skill_id == skill_id:
            workflow.last_test_status = "never"
            workflow.last_test_error = None
            workflow.last_test_at = None
            workflow.edited_at = now
            save_workflow(workflow)


def set_workflow_test_result(
    workflow_id: str,
    *,
    status: str,
    inputs: dict,
) -> Workflow | None:
    """Persist test outcome onto the workflow (called after test/stream completes)."""
    workflow = get_workflow(workflow_id)
    if workflow is None:
        return None
    workflow.last_test_status = status  # type: ignore[assignment]
    workflow.last_test_at = time.time()
    workflow.last_test_inputs = dict(inputs)
    workflow.last_test_error = None
    return save_workflow(workflow)


def set_workflow_test_error(workflow_id: str, error: str) -> Workflow | None:
    """Persist a test failure error message."""
    workflow = get_workflow(workflow_id)
    if workflow is None:
        return None
    workflow.last_test_status = "failed"
    workflow.last_test_at = time.time()
    workflow.last_test_error = error[:2000]
    return save_workflow(workflow)
