import { create } from 'zustand'

type EditorState = {
  selectedStepIndex: number | null
  /** Nested index within the selected step's branch_steps (if_present body) — set when a user
   * clicks a nested row in BranchSubList, so BranchBodyEditor can auto-focus/scroll to it.
   * Cleared whenever the top-level selection changes. */
  focusedBranchIndex: number | null
  dirtySteps: Set<number>
  validationReport: Record<string, unknown> | null
  canUndo: boolean
  canRedo: boolean
  setSelectedStepIndex: (i: number | null) => void
  setFocusedBranchIndex: (i: number | null) => void
  selectBranchStep: (stepIndex: number, nestedIndex: number) => void
  markStepDirty: (i: number) => void
  clearStepDirty: (i: number) => void
  clearAllDirty: () => void
  reindexDirtyAfterDelete: (deletedIndex: number) => void
  setValidationReport: (r: Record<string, unknown> | null) => void
  setHistoryState: (canUndo: boolean, canRedo: boolean) => void
  resetHistory: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedStepIndex: 0,
  focusedBranchIndex: null,
  dirtySteps: new Set(),
  validationReport: null,
  canUndo: false,
  canRedo: false,
  setSelectedStepIndex: (i) => set({ selectedStepIndex: i, focusedBranchIndex: null }),
  setFocusedBranchIndex: (i) => set({ focusedBranchIndex: i }),
  selectBranchStep: (stepIndex, nestedIndex) => set({ selectedStepIndex: stepIndex, focusedBranchIndex: nestedIndex }),
  markStepDirty: (i) =>
    set((s) => {
      const n = new Set(s.dirtySteps)
      n.add(i)
      return { dirtySteps: n }
    }),
  clearStepDirty: (i) =>
    set((s) => {
      const n = new Set(s.dirtySteps)
      n.delete(i)
      return { dirtySteps: n }
    }),
  clearAllDirty: () => set({ dirtySteps: new Set() }),
  reindexDirtyAfterDelete: (deletedIndex) =>
    set((s) => {
      const n = new Set<number>()
      for (const i of s.dirtySteps) {
        if (i === deletedIndex) continue
        n.add(i > deletedIndex ? i - 1 : i)
      }
      return { dirtySteps: n }
    }),
  setValidationReport: (r) => set({ validationReport: r }),
  setHistoryState: (canUndo, canRedo) => set({ canUndo, canRedo }),
  resetHistory: () => set({ canUndo: false, canRedo: false }),
}))
