import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SelectionState = {
  selectedPluginId: string | null
  setSelectedPluginId: (id: string | null) => void
}

/** The one shared "current automation" selection, read by every stage page
 * (Record/Compile/Human Edit/Test Skill/Publish/Build Installer) so the user
 * picks a plugin once instead of re-selecting it on each page. */
export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      selectedPluginId: null,
      setSelectedPluginId: (id) => set({ selectedPluginId: id }),
    }),
    { name: 'conxa-selected-plugin' },
  ),
)
