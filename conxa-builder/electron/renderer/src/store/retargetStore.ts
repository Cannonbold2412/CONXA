import { create } from 'zustand'
import type { Bbox, RetargetPreviewResponse } from '@/api/workflowApi'
import type { AssertionDraft } from '@/components/retarget/RetargetPhaseValidation'

// The re-target wizard is split across three routes (pick → selectors → confirm). React Router
// unmounts each page on navigation, so the cross-phase state that used to live inside the
// single-page RetargetWizard component lives here instead, surviving the page changes.
type RetargetState = {
  skillId: string | null
  stepIndex: number | null
  bbox: Bbox | null
  preview: RetargetPreviewResponse | null
  selectedIndex: number
  manualSelector: string
  keepValidation: boolean
  /** Human edits made in the Validation phase; null means "use the current/proposed default". */
  editedAssertions: AssertionDraft[] | null
  /**
   * Clear the wizard state when a re-target starts on a different skill/step; no-op for the
   * same one so navigating back and forth between the three pages keeps what was picked.
   */
  ensureFor: (skillId: string, stepIndex: number) => void
  setBbox: (bbox: Bbox | null) => void
  setPreview: (preview: RetargetPreviewResponse | null) => void
  setSelectedIndex: (index: number) => void
  setManualSelector: (value: string) => void
  setKeepValidation: (value: boolean) => void
  setEditedAssertions: (value: AssertionDraft[] | null) => void
  reset: () => void
}

const EMPTY = {
  bbox: null,
  preview: null,
  selectedIndex: 0,
  manualSelector: '',
  keepValidation: true,
  editedAssertions: null,
} as const

export const useRetargetStore = create<RetargetState>((set, get) => ({
  skillId: null,
  stepIndex: null,
  ...EMPTY,
  ensureFor: (skillId, stepIndex) => {
    const s = get()
    if (s.skillId === skillId && s.stepIndex === stepIndex) return
    set({ skillId, stepIndex, ...EMPTY })
  },
  setBbox: (bbox) => set({ bbox }),
  setPreview: (preview) => set({ preview }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setManualSelector: (manualSelector) => set({ manualSelector }),
  setKeepValidation: (keepValidation) => set({ keepValidation }),
  setEditedAssertions: (editedAssertions) => set({ editedAssertions }),
  reset: () => set({ skillId: null, stepIndex: null, ...EMPTY }),
}))
