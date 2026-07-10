/** Mirrors backend `app/editor/dto.py` JSON shape. */

export type StepFlags = {
  is_destructive: boolean
  is_scroll: boolean
  generic_intent: boolean
}

export type FrameDTO = {
  label: string
  offset_ms: number
  url: string | null
}

export type StepScreenshotDTO = {
  full_url: string | null
  element_url: string | null
  scroll_url: string | null
  bbox: Record<string, number>
  viewport: string
  scroll_position: string
  frames: FrameDTO[]
  default_frame_label: string | null
}

/** A single identity_bundle signal, projected for display — the durability/orthogonality/
 * uniqueness/source metadata the runtime resolver actually keys off (see
 * conxa_compile.compiler.selector_grammar.signals_to_display_list). */
export type IdentityEngineEntry = {
  selector: string
  engine: string
  durability: number
  orthogonality_class: string
  unique_at_compile: boolean
  source: string
}

/** Plain-language recovery ladder — read-only projection of the persisted RecoveryBlock.
 * Tunables are policy-owned (predictable recovery, not per-step drift); patch_gate.py never
 * accepts a `recovery_view` patch key. */
export type RecoveryView = {
  strategies: string[]
  max_attempts: number
  confidence_threshold: number
  require_diverse_attempts: boolean
  anchors: Record<string, unknown>[]
}

/** "What was recorded" — read-only subset of identity_bundle.fingerprint + frame/shadow depth,
 * the resolver's scoring oracle. Empty object when the step has no identity_bundle. */
export type FingerprintView = {
  role: string
  tag: string
  inner_text: string
  aria_label: string
  name: string
  placeholder: string
  label_text: string
  data_testid: string
  input_type: string
  position_hint: Record<string, unknown>
  frame_depth: number
  shadow_depth: number
  destructive: boolean
  /** Diagnostics-tier only — integrity hashes, never editable, not shown at Review tier. */
  stable_hash: string
  compat_fingerprint: string
}

export type HandlerHintsView = {
  has_hover_chain: boolean
  hover_chain_len: number
  virtualized_container: string
  allow_forced_action: boolean
}

/** Drives step-row safety badges. */
export type SafetyView = {
  destructive: boolean
  allow_forced_action: boolean
  has_hover_chain: boolean
}

/** {kind, probe, step_count} for a branch action (if_present/try_dismiss/wait_for_one_of —
 * EXEC-1), plus kind-specific extras: try_dismiss's `candidates` (selector strings) and
 * wait_for_one_of's `options` ({selector, step_count}[] — per-option nested bodies are
 * read-only this pass, see BranchBodyEditor.tsx). */
export type BranchSummary = {
  kind: 'if_present' | 'try_dismiss' | 'wait_for_one_of'
  probe: string
  step_count: number
  candidates?: string[]
  options?: { selector: string; step_count: number }[]
}

export type StepEditorDTO = {
  id: string
  step_index: number
  human_readable_description: string
  action_type: string
  action_payload: Record<string, unknown>
  action_spec: Record<string, unknown>
  semantic_description?: string
  intent: string
  final_intent: string
  url: string
  frame: Record<string, unknown>
  target: Record<string, unknown>
  selectors: Record<string, unknown>
  compiled_selectors?: string[]
  identity_engines?: IdentityEngineEntry[]
  /** Step-level rollup of identity signal quality (0-1); null when there's no identity_bundle. */
  compile_confidence?: number | null
  anchors_signals: Record<string, unknown>[]
  anchors_recovery: Record<string, unknown>[]
  validation: {
    wait_for: Record<string, unknown>
    success_conditions: Record<string, unknown>
    assertions: Record<string, unknown>[]
  }
  recovery: Record<string, unknown>
  value: unknown
  scroll_mode: string | null
  scroll_selector: string | null
  scroll_amount: number | null
  input_binding: string | null
  screenshot: StepScreenshotDTO
  editable_fields: Record<string, boolean>
  flags: StepFlags
  parameter_bindings: Record<string, unknown>[]
  check_kind?: string
  check_pattern?: string
  check_threshold?: number
  check_selector?: string
  check_text?: string
  /** Read-only visibility additions — the 2026-07-10 Human Edit vs. Skill Package redesign.
   * None of these accept edits; patch_gate.py (conxa_compile/editor) is the sole write path. */
  recovery_view: RecoveryView | Record<string, never>
  fingerprint: FingerprintView | Record<string, never>
  handler_hints_view: HandlerHintsView | Record<string, never>
  safety: SafetyView
  branch_summary: BranchSummary | null
  /** Nested body steps (if_present only), addressed by a path-based `id`
   * (`{skill_id}:{step_index}.branch.steps[{j}]`) for patch_gate path-addressed edits. */
  branch_steps: StepEditorDTO[]
  /** {kind: 'try_dismiss', container_signal} when the recorder flagged this step's target as
   * sitting inside an optional interstitial (recording-next-steps.md Priority 2) and a human
   * hasn't confirmed it yet — drives the "treat as optional?" suggestion. null once confirmed
   * (confirmOptionalInterstitial clears it) or for ordinary steps. */
  optional_hint: { kind: 'try_dismiss'; container_signal: string } | null
}

export type SuggestionItem = {
  step_index: number
  severity: 'info' | 'warn' | 'error'
  code: string
  message: string
}

/** Compile-time semantic understanding of the workflow (WorkflowIntentGraph, verbatim) — the
 * compiled "plan": goal, per-step intent + verification anchor, decision points, expected end
 * state. Computed at compile time but never surfaced to Human Edit before this redesign. */
export type IntentGraph = {
  goal?: string
  steps?: { index: number; intent: string; verification_anchor: string }[]
  decision_points?: Record<string, unknown>[]
  expected_end_state?: Record<string, unknown>
}

/** Workflow-level compile-health summary — derived from compile_report + meta. */
export type CompileHealth = {
  status?: string
  steps_total?: number
  min_confidence?: number
  steps_with_warnings?: number
  steps_below_threshold?: number[]
  required_runtime?: string
  compiler_policy_version?: string
  structural_fingerprint_present?: boolean
  /** Diagnostics-tier only — provider/router telemetry from compile time. */
  llm_router_stats?: Record<string, unknown>
}

export type WorkflowResponse = {
  skill_id: string
  package_meta: Record<string, unknown>
  inputs: Record<string, unknown>[]
  steps: StepEditorDTO[]
  suggestions: SuggestionItem[]
  asset_base_url: string
  intent_graph: IntentGraph | Record<string, never>
  compile_health: CompileHealth | Record<string, never>
}

/** Common shape returned by workflow-editor mutation endpoints (`patch_step`,
 * `apply_recording_visual`, `insert_step`, `undo_workflow`, etc.) — all return
 * the skill_id, the (possibly partial) package meta, and the refreshed workflow. */
type WorkflowMutationBase = {
  skill_id: string
  meta: Record<string, unknown>
  workflow: WorkflowResponse
}

/** Mutations that re-run validation and report undo/redo availability
 * (`apply_recording_visual`, `apply_step_frame`, `clear_step_visual`,
 * `update_visual_bbox`, `patch_step`). */
export type WorkflowRevalidationResponse = WorkflowMutationBase & {
  revalidation: Record<string, unknown>
  can_undo?: boolean
  can_redo?: boolean
}

/** Structural mutations that report undo/redo availability but don't
 * revalidate (`reorder_steps`, `insert_step`, `delete_step`). */
export type WorkflowStepMutationResponse = WorkflowMutationBase & {
  can_undo?: boolean
  can_redo?: boolean
}

/** undo_workflow / redo_workflow — like WorkflowRevalidationResponse but
 * can_undo/can_redo are always present (not optional). */
export type WorkflowUndoRedoResponse = WorkflowMutationBase & {
  revalidation: Record<string, unknown>
  can_undo: boolean
  can_redo: boolean
}
