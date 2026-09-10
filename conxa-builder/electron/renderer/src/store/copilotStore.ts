import { create } from 'zustand'
import type { CopilotProposal, CopilotTurnMessage } from '@/api/workflowApi'

/** Verified retest state (BUILD-26 stage e), seeded once a proposal is accepted. 'confirming'
 *  shows the non-reversible-action count before anything runs; 'running' streams rebuild/retest
 *  log lines; 'done' shows the fixed/still_failing/progressed verdict. Nothing here auto-runs —
 *  every transition out of 'idle' is a deliberate reviewer click. */
export type CopilotVerifyStatus = 'idle' | 'confirming' | 'running' | 'done'

export type CopilotVerifyState = {
  status: CopilotVerifyStatus
  proposalId: string | null
  stepKey: string | null
  /** False until the confirmed=false pre-flight call has actually returned — distinguishes "not
   *  checked yet" from "checked, zero non-reversible steps" so the panel never shows a 0-count
   *  confirm line before the count is real. */
  preflighted: boolean
  irreversibleCount: number
  irreversibleSteps: { step_key: string; description: string }[]
  logs: string[]
  verdict: 'fixed' | 'still_failing' | 'progressed' | null
  message: string
}

const IDLE_VERIFY: CopilotVerifyState = {
  status: 'idle',
  proposalId: null,
  stepKey: null,
  preflighted: false,
  irreversibleCount: 0,
  irreversibleSteps: [],
  logs: [],
  verdict: null,
  message: '',
}

const POSITION_KEY = 'conxa-copilot-position'
// Matches the launcher button's size-12 (48px) footprint.
const LAUNCHER_SIZE = 48

export type CopilotPosition = { x: number; y: number }

/** Keeps a position (button top-left) fully on-screen — a corner remembered on a bigger
 *  monitor, or a viewport that shrank since, would otherwise restore off-screen forever. */
export function clampPosition(pos: CopilotPosition, size = LAUNCHER_SIZE): CopilotPosition {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(0, window.innerWidth - size)),
    y: Math.min(Math.max(pos.y, 0), Math.max(0, window.innerHeight - size)),
  }
}

function defaultPosition(): CopilotPosition {
  return { x: window.innerWidth - LAUNCHER_SIZE - 20, y: window.innerHeight - LAUNCHER_SIZE - 20 }
}

function loadPosition(): CopilotPosition {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return clampPosition(parsed)
    }
  } catch {
    /* private-browsing / storage disabled / malformed JSON — fall through to default */
  }
  return defaultPosition()
}

// The Human Review Copilot's conversation state (BUILD-26). Lives outside the launcher/panel
// components (mirroring store/retargetStore.ts) so the conversation survives the panel closing
// and reopening, and so WorkflowViewer's step-select handler can guard on `dirty` the same way
// it already does for a pending re-target edit — a pending proposal is exactly the same kind of
// "you're about to lose this" state.
type CopilotState = {
  skillId: string | null
  open: boolean
  position: CopilotPosition
  messages: CopilotTurnMessage[]
  pendingProposal: CopilotProposal | null
  verify: CopilotVerifyState
  sending: boolean
  /** The in-progress assistant reply's text as it streams in — cleared once the turn resolves
   *  and the complete reply lands in `messages` via addMessage. Empty while `sending` is true
   *  and no delta has arrived yet (the panel shows a "thinking" indicator for that gap). */
  streamingText: string
  /** True only while a proposal is pending accept/reject — not while merely chatting. */
  dirty: boolean
  ensureFor: (skillId: string) => void
  setOpen: (open: boolean) => void
  /** In-memory-only move, called on every pointermove while dragging — no localStorage write
   *  per frame. */
  setPosition: (position: CopilotPosition) => void
  /** Clamps, applies, and persists the final position — called once on pointerup. */
  commitPosition: (position: CopilotPosition) => void
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
  /** Seeds the verify card right after a proposal is accepted — status starts at 'confirming'
   *  once the pre-flight count is known, not 'running': nothing acts against the real system
   *  until the reviewer clicks through the confirm step. */
  startVerify: (args: { proposalId: string | null; stepKey: string }) => void
  setVerifyConfirming: (irreversibleCount: number, irreversibleSteps: { step_key: string; description: string }[]) => void
  setVerifyRunning: () => void
  appendVerifyLog: (message: string) => void
  setVerifyDone: (verdict: 'fixed' | 'still_failing' | 'progressed' | null, message: string) => void
  clearVerify: () => void
  reset: () => void
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  skillId: null,
  open: false,
  position: loadPosition(),
  messages: [],
  pendingProposal: null,
  verify: IDLE_VERIFY,
  sending: false,
  streamingText: '',
  dirty: false,
  ensureFor: (skillId) => {
    if (get().skillId === skillId) return
    set({ skillId, messages: [], pendingProposal: null, verify: IDLE_VERIFY, sending: false, streamingText: '', dirty: false })
  },
  setOpen: (open) => set({ open }),
  setPosition: (position) => set({ position }),
  commitPosition: (position) => {
    const clamped = clampPosition(position)
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(clamped))
    } catch {
      /* private-browsing / storage disabled — position just won't persist */
    }
    set({ position: clamped })
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
  startVerify: ({ proposalId, stepKey }) =>
    set({ verify: { ...IDLE_VERIFY, status: 'confirming', proposalId, stepKey } }),
  setVerifyConfirming: (irreversibleCount, irreversibleSteps) =>
    set((s) => ({ verify: { ...s.verify, status: 'confirming', preflighted: true, irreversibleCount, irreversibleSteps } })),
  setVerifyRunning: () => set((s) => ({ verify: { ...s.verify, status: 'running', logs: [] } })),
  appendVerifyLog: (message) => set((s) => ({ verify: { ...s.verify, logs: [...s.verify.logs, message] } })),
  setVerifyDone: (verdict, message) =>
    set((s) => ({ verify: { ...s.verify, status: 'done', verdict, message } })),
  clearVerify: () => set({ verify: IDLE_VERIFY }),
  reset: () => set({ messages: [], pendingProposal: null, verify: IDLE_VERIFY, sending: false, streamingText: '', dirty: false }),
}))
