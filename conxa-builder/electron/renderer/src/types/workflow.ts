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
}

export type SuggestionItem = {
  step_index: number
  severity: 'info' | 'warn' | 'error'
  code: string
  message: string
}

export type WorkflowResponse = {
  skill_id: string
  package_meta: Record<string, unknown>
  inputs: Record<string, unknown>[]
  steps: StepEditorDTO[]
  suggestions: SuggestionItem[]
  asset_base_url: string
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
