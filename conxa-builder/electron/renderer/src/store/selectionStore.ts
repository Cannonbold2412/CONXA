import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SelectionState = {
  selectedWorkflowId: string | null
  setSelectedWorkflowId: (id: string | null) => void
}

/** The one shared "current workflow" selection, read by every stage page
 * (Compile/Human Edit/Test Skill) so the user picks a workflow once instead
 * of re-selecting it on each page. */
export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      selectedWorkflowId: null,
      setSelectedWorkflowId: (id) => set({ selectedWorkflowId: id }),
    }),
    { name: 'conxa-selected-workflow' },
  ),
)
