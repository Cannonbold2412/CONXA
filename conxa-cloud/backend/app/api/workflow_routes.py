"""Workflow metadata routes (dashboard), plus the SkillPack dashboard list/
detail views (GET "/skill-packs" and GET "/skill-packs/{slug}" below).

The cloud exposes read/list/delete plus workspace-scoped create for the
dashboard. Recording, compiling, building skill packages/installers, and
executing skills all happen locally in the Build Studio — those endpoints are
no longer served here.

SkillPack — the shared package every workflow in a workspace compiles into,
mirrored here from publish_routes.py on every publish/installer-upload — is
the dashboard's "your published products" view (the old GET /api/v1/plugins).
It's routed here rather than alongside skillpack_update_routes.py's
"/skill-packs/..." endpoints because that whole prefix is on the public,
package-token (not Clerk) allowlist — see app.api.security. The two
"/skill-packs" routes below are registered before "/{workflow_id}" so they
match as literal paths, not as a workflow_id value.
"""

from __future__ import annotations

import logging
import shutil
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from conxa_core.config import settings
from conxa_core.models.workflow import Workflow
from app.api.deps import current_principal
from app.services.rbac import require_admin
from app.services.saas import add_audit_event, principal_from_request, visible_workspace_ids_for
from conxa_core.storage.workflow_store import (
    create_workflow,
    delete_workflow,
    get_workflow,
    list_workflows,
)
from conxa_core.storage.skill_pack_store import get_skill_pack_by_slug, list_skill_packs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("/skill-packs")
def get_list_skill_packs(request: Request) -> dict[str, Any]:
    """Dashboard list of this workspace's published skill packages — the
    SkillPack equivalent of the old GET /api/v1/plugins."""
    principal = principal_from_request(request)
    visible_ids = set(visible_workspace_ids_for(principal))
    packs = [
        p for p in list_skill_packs()
        if p.workspace_id == principal.workspace_id or p.workspace_id in visible_ids
    ]
    packs.sort(key=lambda p: p.updated_at, reverse=True)
    return {"skill_packs": [p.model_dump(mode="json") for p in packs]}


@router.get("/skill-packs/{slug}")
def get_skill_pack_detail(slug: str, request: Request) -> dict[str, Any]:
    principal = principal_from_request(request)
    pack = get_skill_pack_by_slug(slug)
    if pack is None:
        raise HTTPException(status_code=404, detail="Skill pack not found.")
    visible_ids = set(visible_workspace_ids_for(principal))
    if pack.workspace_id != principal.workspace_id and pack.workspace_id not in visible_ids:
        raise HTTPException(status_code=404, detail="Skill pack not found.")
    return {"skill_pack": pack.model_dump(mode="json")}


class CreateWorkflowBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    target_url: str = Field(..., min_length=1)
    protected_url: str = Field(default="")
    protected_url_marker_text: str = Field(default="")


def _visible_workflows(principal) -> list[Workflow]:
    visible_ids = set(visible_workspace_ids_for(principal))
    workflows: list[Workflow] = []
    for workflow in list_workflows():
        if workflow.workspace_id == principal.workspace_id:
            workflows.append(workflow)
            continue
        if workflow.workspace_id in visible_ids and workflow.owner_user_id == principal.user_id:
            workflows.append(workflow)
    return sorted(workflows, key=lambda w: w.updated_at, reverse=True)


def _workflow_or_404(workflow_id: str, principal) -> Workflow:
    workflow = get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    visible_ids = set(visible_workspace_ids_for(principal))
    if workflow.workspace_id != principal.workspace_id and not (
        workflow.workspace_id in visible_ids and workflow.owner_user_id == principal.user_id
    ):
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return workflow


@router.post("")
def post_create_workflow(body: CreateWorkflowBody, request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    workflow = create_workflow(
        name=body.name,
        target_url=body.target_url,
        protected_url=body.protected_url,
        protected_url_marker_text=body.protected_url_marker_text,
        workspace_id=principal.workspace_id,
        owner_user_id=principal.user_id,
    )
    add_audit_event(
        principal,
        "workflow_create",
        resource_type="workflow",
        resource_id=workflow.id,
        metadata={"name": body.name},
    )
    return {"workflow": workflow.model_dump(mode="json")}


@router.get("")
def get_list_workflows(request: Request) -> dict[str, Any]:
    principal = principal_from_request(request)
    workflows = _visible_workflows(principal)
    return {"workflows": [w.model_dump(mode="json") for w in workflows]}


@router.get("/{workflow_id}")
def get_workflow_detail(workflow_id: str, request: Request) -> dict[str, Any]:
    principal = principal_from_request(request)
    workflow = _workflow_or_404(workflow_id, principal)
    return {"workflow": workflow.model_dump(mode="json")}


@router.delete("/{workflow_id}")
def delete_workflow_endpoint(workflow_id: str, request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    workflow = _workflow_or_404(workflow_id, principal)
    # Remove stored auth state.
    auth_dir = settings.data_dir / "workflows" / workflow_id
    if auth_dir.is_dir():
        shutil.rmtree(auth_dir, ignore_errors=True)
    if not delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found.")
    add_audit_event(
        principal,
        "workflow_delete",
        resource_type="workflow",
        resource_id=workflow_id,
        metadata={"name": workflow.name},
    )
    return {"deleted": True, "workflow_id": workflow_id}
