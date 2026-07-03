import type { StepEditorDTO } from '@/types/workflow'
import { RECORDING_DRAG_MODE_CLEAR_VISUAL } from '@/api/workflowApi'

export const ADD_ACTION_OPTIONS = [
  { value: 'navigate', label: 'Navigate', category: 'Flow' },
  { value: 'scroll', label: 'Scroll', category: 'Flow' },
  { value: 'wait', label: 'Wait', category: 'Flow' },
  { value: 'check', label: 'Check', category: 'Validation' },
  { value: 'assert', label: 'Assert', category: 'Validation' },
  { value: 'screenshot', label: 'Screenshot', category: 'Validation' },
  { value: 'click', label: 'Click', category: 'Pointer' },
  { value: 'dblclick', label: 'Double click', category: 'Pointer' },
  { value: 'right_click', label: 'Right click', category: 'Pointer' },
  { value: 'hover', label: 'Hover', category: 'Pointer' },
  { value: 'focus', label: 'Focus', category: 'Pointer' },
  { value: 'type', label: 'Type', category: 'Input' },
  { value: 'fill', label: 'Fill', category: 'Input' },
  { value: 'set_checkbox', label: 'Set checkbox', category: 'Input' },
  { value: 'set_radio', label: 'Set radio', category: 'Input' },
  { value: 'select', label: 'Select', category: 'Input' },
  { value: 'select_option', label: 'Select option', category: 'Input' },
  { value: 'date_pick', label: 'Date pick', category: 'Input' },
  { value: 'drag_drop', label: 'Drag and drop', category: 'Advanced' },
  { value: 'keyboard_shortcut', label: 'Keyboard shortcut', category: 'Advanced' },
  { value: 'upload', label: 'Upload', category: 'Advanced' },
] as const

export type AddActionKind = (typeof ADD_ACTION_OPTIONS)[number]['value']

export function compactStepLabel(label: string): string {
  return label.replace(/^Step\s+\d+:\s*/i, '').trim()
}

export function visualBboxState(step: StepEditorDTO): {
  usable: boolean
  label: string
  title: string
} | null {
  if (step.flags.is_scroll) return null
  const bbox = step.screenshot.bbox || {}
  const x = Number(bbox.x ?? 0)
  const y = Number(bbox.y ?? 0)
  const w = Number(bbox.w ?? 0)
  const h = Number(bbox.h ?? 0)
  if (w >= 2 && h >= 2) {
    return {
      usable: true,
      label: `${Math.round(w)}x${Math.round(h)}`,
      title: `Visual bbox saved: x ${Math.round(x)}, y ${Math.round(y)}, w ${Math.round(w)}, h ${Math.round(h)}`,
    }
  }
  return {
    usable: false,
    label: 'missing',
    title: 'No usable visual bbox saved for this action.',
  }
}

export type BboxState = NonNullable<ReturnType<typeof visualBboxState>>

export function handleRecordingScreenshotDrop(
  raw: string,
  stepIndex: number,
  onDroppedRecordingScreenshot?: (stepIndex: number, eventIndex: number) => void,
  onClearStepVisual?: (stepIndex: number) => void,
) {
  try {
    const parsed = JSON.parse(raw) as { event_index?: unknown; mode?: unknown }
    if (parsed.mode === RECORDING_DRAG_MODE_CLEAR_VISUAL && onClearStepVisual) {
      void onClearStepVisual(stepIndex)
      return
    }
    const eventIndex = parsed.event_index
    if (typeof eventIndex === 'number' && Number.isFinite(eventIndex) && eventIndex >= 0) {
      void onDroppedRecordingScreenshot?.(stepIndex, Math.floor(eventIndex))
    }
  } catch {
    // Ignore malformed drag payloads from unrelated sources.
  }
}
