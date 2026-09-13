import { create } from 'zustand'
import type { Bbox, EditableCandidate, RetargetPreviewResponse } from '@/api/workflowApi'
import type { AssertionDraft } from '@/components/retarget/RetargetPhaseValidation'

let candidateIdSeq = 0
/** Stable, client-only id for a Review Selectors row — lets the phase track selection/edits
 *  by identity across reorders instead of by array index. */
export function makeCandidateId(): string {
  candidateIdSeq += 1
  return `cand_${candidateIdSeq}`
}

// The re-target wizard is split across three routes (pick → selectors → confirm). React Router
// unmounts each page on navigation, so the cross-phase state that used to live inside the
// single-page RetargetWizard component lives here instead, surviving the page changes.
type RetargetState = {
  skillId: string | null
  /** Scopes the wizard to whichever step is actually open — a top-level step's own index as a
   *  string ("3"), or a nested for_each step's index PLUS its path ("3:for_each.steps[0]") so two
   *  different loop-body steps under the same parent don't share wizard state. */
  scopeKey: string | null
  bbox: Bbox | null
  preview: RetargetPreviewResponse | null
  /** Human-editable working copy of `preview.candidates` — reorderable, editable, and
   *  add/removable in the Review Selectors phase without mutating the original preview.
   *  Order is meaningful: `candidates[0]` is always the primary selector, the rest are the
   *  fallback chain in priority order. */
  candidates: EditableCandidate[]
  keepValidation: boolean
  /** Human edits made in the Validation phase; null means "use the current/proposed default". */
  editedAssertions: AssertionDraft[] | null
  /** True once the human has actually touched candidates/validation past phase 1's programmatic
   *  seed — i.e. there's something Apply hasn't persisted yet. Drives the discard-confirm guard
   *  when navigating away mid-wizard (see WorkflowViewer's step-select handler). */
  dirty: boolean
  /**
   * Clear the wizard state when a re-target starts on a different skill/step; no-op for the
   * same one so navigating back and forth between the three pages keeps what was picked.
   */
  ensureFor: (skillId: string, scopeKey: string) => void
  setBbox: (bbox: Bbox | null) => void
  setPreview: (preview: RetargetPreviewResponse | null) => void
  setCandidates: (candidates: EditableCandidate[]) => void
  setKeepValidation: (value: boolean) => void
  setEditedAssertions: (value: AssertionDraft[] | null) => void
  markDirty: () => void
  reset: () => void
}

const EMPTY = {
  bbox: null,
  preview: null,
  candidates: [] as EditableCandidate[],
  keepValidation: true,
  editedAssertions: null,
  dirty: false,
}

export const useRetargetStore = create<RetargetState>((set, get) => ({
  skillId: null,
  scopeKey: null,
  ...EMPTY,
  ensureFor: (skillId, scopeKey) => {
    const s = get()
    if (s.skillId === skillId && s.scopeKey === scopeKey) return
    set({ skillId, scopeKey, ...EMPTY })
  },
  setBbox: (bbox) => set({ bbox }),
  setPreview: (preview) => set({ preview }),
  setCandidates: (candidates) => set({ candidates }),
  setKeepValidation: (keepValidation) => set({ keepValidation }),
  setEditedAssertions: (editedAssertions) => set({ editedAssertions }),
  markDirty: () => set({ dirty: true }),
  reset: () => set({ skillId: null, scopeKey: null, ...EMPTY }),
}))
