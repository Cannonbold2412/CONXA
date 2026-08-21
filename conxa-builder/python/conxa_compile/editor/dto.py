"""Pydantic DTOs for GET /skills/{id}/workflow and editor clients."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .placeholder_grammar import PLACEHOLDER_ID_PATTERN


class StepFlags(BaseModel):
    is_destructive: bool = False
    is_scroll: bool = False
    generic_intent: bool = False


class FrameDTO(BaseModel):
    label: str
    offset_ms: int
    url: str | None = None


_FRAME_OFFSETS: dict[str, int] = {
    "before_far": -500,
    "before_near": -250,
    "at": 0,
    "after_near": 250,
    "after_far": 500,
}


class StepScreenshotDTO(BaseModel):
    """Resolved asset URLs + geometry for bbox overlay in the client."""

    full_url: str | None = None
    element_url: str | None = None
    scroll_url: str | None = None
    bbox: dict[str, Any] = Field(default_factory=dict)
    viewport: str = ""
    scroll_position: str = ""
    # Video frames for this step (5 entries, ordered by offset_ms).
    frames: list[FrameDTO] = Field(default_factory=list)
    # Label of the currently-applied representative frame.
    default_frame_label: str | None = None


class StepEditorDTO(BaseModel):
    id: str
    step_index: int
    human_readable_description: str
    action_type: str = ""
    action_payload: dict[str, Any] = Field(default_factory=dict)
    action_spec: dict[str, Any] = Field(default_factory=dict)
    semantic_description: str = ""
    intent: str = ""
    final_intent: str = ""
    url: str = ""
    frame: dict[str, Any] = Field(default_factory=dict)
    # Which browser tab this step runs on ({id, index, opened_by, opener_tab}) — empty means
    # the initial tab. Drives the tab-boundary dividers in WorkflowViewer.tsx.
    tab: dict[str, Any] = Field(default_factory=dict)
    target: dict[str, Any] = Field(default_factory=dict)
    selectors: dict[str, Any] = Field(default_factory=dict)
    compiled_selectors: list[str] = Field(default_factory=list)
    anchors_signals: list[dict[str, Any]] = Field(default_factory=list)
    anchors_recovery: list[dict[str, Any]] = Field(default_factory=list)
    validation: dict[str, Any] = Field(default_factory=dict)
    recovery: dict[str, Any] = Field(default_factory=dict)
    value: Any = None
    scroll_mode: str | None = None
    scroll_selector: str | None = None
    scroll_amount: int | None = None
    input_binding: str | None = None
    screenshot: StepScreenshotDTO = Field(default_factory=StepScreenshotDTO)
    editable_fields: dict[str, bool] = Field(default_factory=dict)
    flags: StepFlags = Field(default_factory=StepFlags)
    parameter_bindings: list[dict[str, Any]] = Field(default_factory=list)
    check_kind: str | None = None
    check_pattern: str | None = None
    check_threshold: float | None = None
    check_selector: str | None = None
    check_text: str | None = None
    # Going-forward selector signals from identity_bundle — drives the runtime hot path.
    # Each entry: {selector (public display string), engine, durability, orthogonality_class,
    # unique_at_compile, source}. The editor's selector list is authoritative; this field
    # provides identity metadata for display badges — the same signal quality the runtime
    # resolver relies on. Absent on steps with no identity_bundle (e.g. frame markers).
    identity_engines: list[dict[str, Any]] = Field(default_factory=list)
    # Step-level rollup of identity_bundle signal quality (see
    # compiler.selector_score.confidence_from_signal_rows) — None on steps with no bundle.
    compile_confidence: float | None = None

    # --- Read-only "Human Edit vs. Skill Package" visibility additions (2026-07-10 redesign) ---
    # All of the below are display-only projections of data already persisted on the step; none
    # of them accept edits — see conxa_compile/editor/patch_gate.py for the sole write path.

    # {strategies, max_attempts, confidence_threshold, require_diverse_attempts, anchors} —
    # plain-language recovery ladder from the persisted RecoveryBlock. Tunables are policy-owned
    # (predictable recovery, not per-step drift) so this is display-only, never patchable.
    recovery_view: dict[str, Any] = Field(default_factory=dict)
    # Subset of identity_bundle.fingerprint (ElementFingerprint) plus frame_chain/shadow_path
    # summaries and the destructive flag — "what was recorded" for debugging a misfire.
    fingerprint: dict[str, Any] = Field(default_factory=dict)
    # {has_hover_chain, hover_chain_len, virtualized_container, allow_forced_action} from
    # handler_hints — precompiled runtime hints previously invisible to the editor.
    handler_hints_view: dict[str, Any] = Field(default_factory=dict)
    # {destructive, allow_forced_action, has_hover_chain} — drives step-row safety badges.
    safety: dict[str, bool] = Field(default_factory=dict)
    # {kind, probe, step_count} when this step is a branch action (if_present/try_dismiss/
    # wait_for_one_of); None for ordinary steps.
    branch_summary: dict[str, Any] | None = None
    # {kind: "try_dismiss", container_signal} when the recorder flagged this step's target as
    # sitting inside an optional interstitial (recording-next-steps.md Priority 2) and a human
    # hasn't confirmed it yet — drives the "treat as optional?" suggestion in Human Edit. None
    # once confirmed (confirm_optional_interstitial clears it) or for ordinary steps.
    optional_hint: dict[str, Any] | None = None
    # Nested body steps projected the same way as top-level steps, addressed by a path-based id
    # (e.g. "{skill_id}:{step_index}.branch.steps[1]") for patch_gate path-addressed edits.
    branch_steps: list["StepEditorDTO"] = Field(default_factory=list)


class SuggestionItem(BaseModel):
    step_index: int
    severity: Literal["info", "warn", "error"]
    code: str
    message: str


class SkillInputVariable(BaseModel):
    """Registry entry stored under SkillPackage.inputs, and the validation contract for every
    input the editor saves — `workflow_mutations._validate_skill_inputs` parses each incoming
    row through this model, so the declared shape and the enforced shape cannot drift apart.

    `extra="allow"` on purpose: `merge_skill_inputs` persists the caller's original dicts, so a
    key this model doesn't know about must not be rejected here (it would block saving a
    document written by a newer Studio).
    """

    model_config = ConfigDict(extra="allow")

    id: str = Field(pattern=rf"^{PLACEHOLDER_ID_PATTERN}$")
    label: str = ""
    type: Literal["text", "select"] = "text"
    default: str | None = None
    options: list[str] = Field(default_factory=list)
    pattern: str | None = None
    # Masks the value out of persisted test history and drives the shipped bundle's auth hint.
    sensitive: bool = False
    # Declared-but-not-required: dropped from the manifest's `inputs_required`, so the runtime's
    # pre-execution gate and the agent-facing tool schema both stop demanding it.
    optional: bool = False

    @field_validator("default", "options", mode="before")
    @classmethod
    def _scalars_to_str(cls, v: Any) -> Any:
        """Legacy/JSON-editor documents can carry numeric defaults and options. Coerce rather
        than reject — a number is a perfectly good value, it just has to round-trip as text."""
        if isinstance(v, (int, float, bool)):
            return str(v)
        if isinstance(v, list):
            return [str(x) if isinstance(x, (int, float, bool)) else x for x in v]
        return v

    @model_validator(mode="after")
    def _select_default_must_be_an_option(self) -> SkillInputVariable:
        if self.type == "select" and self.default not in (None, ""):
            if self.default not in self.options:
                raise ValueError(f"select_default_not_in_options:{self.id}")
        return self


class WorkflowResponse(BaseModel):
    skill_id: str
    package_meta: dict[str, Any] = Field(default_factory=dict)
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    steps: list[StepEditorDTO] = Field(default_factory=list)
    suggestions: list[SuggestionItem] = Field(default_factory=list)
    asset_base_url: str = ""
    # Verbatim WorkflowIntentGraph (goal, per-step intent + verification_anchor, decision_points,
    # expected_end_state) — the compiled workflow "plan", computed at compile time but never
    # surfaced to Human Edit before this redesign. Empty dict when the document has none.
    intent_graph: dict[str, Any] = Field(default_factory=dict)
    # {status, steps_total, min_confidence, steps_with_warnings, steps_below_threshold,
    # required_runtime, compiler_policy_version, structural_fingerprint_present} — a
    # workflow-level compile-health summary derived from document["compile_report"] + meta.
    compile_health: dict[str, Any] = Field(default_factory=dict)


# StepEditorDTO.branch_steps is a self-reference; resolve the forward ref now that the class
# body (and its own name) are fully defined.
StepEditorDTO.model_rebuild()
