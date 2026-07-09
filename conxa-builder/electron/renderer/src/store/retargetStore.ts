import { create } from 'zustand'
import type { Bbox, RetargetPreviewResponse } from '@/api/workflowApi'

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
  reset: () => void
}

const EMPTY = {
  bbox: null,
  preview: null,
  selectedIndex: 0,
  manualSelector: '',
  keepValidation: true,
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
  reset: () => set({ skillId: null, stepIndex: null, ...EMPTY }),
}))
