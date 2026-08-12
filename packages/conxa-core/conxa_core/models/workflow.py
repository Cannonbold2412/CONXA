"""Pydantic models for the Workflow entity and the workspace-level SkillPack.

A Workflow is one recorded automation: one login session, one recording, one
compiled skill. Many workflows in a workspace compile together into a single
shared SkillPack (one skill package, one installer) — see SkillPack below.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class WorkflowAuth(BaseModel):
    session_id: str
    captured_at: float
    storage_state_path: str


class Workflow(BaseModel):
    id: str
    slug: str
    name: str
    owner_user_id: str = "local"
    workspace_id: str = ""
    target_url: str
    protected_url: str = ""
    protected_url_marker_text: str = ""
    status: Literal["needs_auth", "ready", "error"] = "needs_auth"
    auth: WorkflowAuth | None = None
    created_at: float = 0.0
    updated_at: float = 0.0
    # The single recording this workflow holds (inlined — no inner list).
    session_id: str | None = None
    recorded_at: float | None = None
    recording_status: Literal["recorded", "compiled", "error"] | None = None
    skill_id: str | None = None
    edited_at: float | None = None
    last_test_at: float | None = None
    last_test_status: Literal["passed", "failed", "never"] = "never"
    last_test_error: str | None = None
    last_test_inputs: dict[str, Any] = Field(default_factory=dict)
    signed_off: bool = False
    # Confidence summary from the most recent compile's compile_report (see
    # conxa_compile/compiler/build.py::_build_compile_report). None until compiled.
    compile_status: Literal["ok", "review_needed", "failed"] | None = None
    compile_min_confidence: float | None = None
    compile_steps_with_warnings: int | None = None


class SkillPackBuild(BaseModel):
    last_built_at: float
    output_path: str
    version: str = "0.1.0"


class SkillPackInstaller(BaseModel):
    built_at: float
    installer_path: str
    filename: str
    version: str
    runtime_version: str
    release_notes: str = ""


class SkillPack(BaseModel):
    """One per workspace/company — the shared package every workflow in that
    workspace compiles into. Keyed by workspace_id, not by any single workflow."""

    workspace_id: str
    company_slug: str
    company_name: str
    status: Literal["idle", "building", "error"] = "idle"
    build: SkillPackBuild | None = None
    installer: SkillPackInstaller | None = None
    created_at: float = 0.0
    updated_at: float = 0.0
