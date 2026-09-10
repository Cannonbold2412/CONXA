import { create } from 'zustand'
import type { CopilotProposal, CopilotTurnMessage } from '@/api/workflowApi'

const CORNER_KEY = 'conxa-copilot-corner'

function loadCorner(): 'right' | 'left' {
  try {
    return window.localStorage.getItem(CORNER_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

// The Human Review Copilot's conversation state (BUILD-26). Lives outside the launcher/panel
// components (mirroring store/retargetStore.ts) so the conversation survives the panel closing
// and reopening, and so WorkflowViewer's step-select handler can guard on `dirty` the same way
// it already does for a pending re-target edit — a pending proposal is exactly the same kind of
// "you're about to lose this" state.
type CopilotState = {
  skillId: string | null
  open: boolean
  corner: 'right' | 'left'
  messages: CopilotTurnMessage[]
  pendingProposal: CopilotProposal | null
  sending: boolean
  /** The in-progress assistant reply's text as it streams in — cleared once the turn resolves
   *  and the complete reply lands in `messages` via addMessage. Empty while `sending` is true
   *  and no delta has arrived yet (the panel shows a "thinking" indicator for that gap). */
  streamingText: string
  /** True only while a proposal is pending accept/reject — not while merely chatting. */
  dirty: boolean
  ensureFor: (skillId: string) => void
  setOpen: (open: boolean) => void
  toggleCorner: () => void
  addMessage: (message: CopilotTurnMessage) => void
  /** Drops the user message at `index` and everything after it (so a re-send doesn't pile a
   *  correction on top of the turn it's correcting), and clears any pending proposal since it
   *  would otherwise reference a turn no longer in the transcript. Returns the removed message's
   *  original text so the composer can be re-seeded with it, or null if there was nothing to edit. */
  editFromIndex: (index: number) => string | null
  setPendingProposal: (proposal: CopilotProposal | null) => void
  setSending: (sending: boolean) => void
  appendStreamingDelta: (text: string) => void
  clearStreamingText: () => void
  reset: () => void
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  skillId: null,
  open: false,
  corner: loadCorner(),
  messages: [],
  pendingProposal: null,
  sending: false,
  streamingText: '',
  dirty: false,
  ensureFor: (skillId) => {
    if (get().skillId === skillId) return
    set({ skillId, messages: [], pendingProposal: null, sending: false, streamingText: '', dirty: false })
  },
  setOpen: (open) => set({ open }),
  toggleCorner: () => {
    const next = get().corner === 'right' ? 'left' : 'right'
    try {
      window.localStorage.setItem(CORNER_KEY, next)
    } catch {
      /* private-browsing / storage disabled — corner just won't persist */
    }
    set({ corner: next })
  },
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  editFromIndex: (index) => {
    const message = get().messages[index]
    if (!message || message.role !== 'user') return null
    set((s) => ({ messages: s.messages.slice(0, index), pendingProposal: null, dirty: false }))
    return message.text
  },
  setPendingProposal: (proposal) => set({ pendingProposal: proposal, dirty: proposal !== null }),
  setSending: (sending) => set({ sending }),
  appendStreamingDelta: (text) => set((s) => ({ streamingText: s.streamingText + text })),
  clearStreamingText: () => set({ streamingText: '' }),
  reset: () => set({ messages: [], pendingProposal: null, sending: false, streamingText: '', dirty: false }),
}))
