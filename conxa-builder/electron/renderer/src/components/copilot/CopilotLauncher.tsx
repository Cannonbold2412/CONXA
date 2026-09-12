import { Sparkles } from 'lucide-react'
import { useDraggable } from '@/hooks/useDraggable'
import { useCopilotStore } from '@/store/copilotStore'
import type { WorkflowRevalidationResponse } from '@/types/workflow'
import { CopilotPanel } from './CopilotPanel'

type Props = {
  skillId: string
  onProposalAccepted: (result: WorkflowRevalidationResponse) => void
}

/** A free-draggable launcher + floating chat card, not a Tools-rail tab — the Tools rail opens
 *  as a shared modal dialog (see HumanEditPage.tsx), which would hide the step list exactly when
 *  a conversation about a specific step needs it visible. Position and open state persist per
 *  browser storage the same way the workflow pane's width does (BUILD-26).
 *
 *  Per DESIGN.md's One Accent Rule, this stays a flat charcoal surface — clay is already spent
 *  on this page's Approve CTA. The one place clay appears here is the pending-decision dot and
 *  the proposal's own Accept button, because at that moment it genuinely is the current primary
 *  action. */
export function CopilotLauncher({ skillId, onProposalAccepted }: Props) {
  const open = useCopilotStore((s) => s.open)
  const position = useCopilotStore((s) => s.position)
  const pendingProposal = useCopilotStore((s) => s.pendingProposal)
  const setOpen = useCopilotStore((s) => s.setOpen)
  const setPosition = useCopilotStore((s) => s.setPosition)
  const commitPosition = useCopilotStore((s) => s.commitPosition)
  const ensureFor = useCopilotStore((s) => s.ensureFor)

  ensureFor(skillId)

  const { onPointerDown, onPointerMove, onPointerUp, wasDragged } = useDraggable(position, {
    onDrag: setPosition,
    onDragEnd: commitPosition,
  })

  // Opens away from whichever screen edge the button is nearer, so the panel never gets
  // clipped: button on the right half of the viewport → panel grows leftward, and vice versa.
  const openLeft = position.x > window.innerWidth / 2

  return (
    <div
      className="pointer-events-none fixed z-40"
      style={{ left: position.x, top: position.y }}
    >
      {/* Anchored to the button's own top-left via `relative`, so the panel keeps growing
       *  upward from wherever the button gets dragged, matching the old bottom-corner layout
       *  without any viewport-flip logic. */}
      <div className="pointer-events-auto relative">
        {open ? (
          <div className={`absolute bottom-full mb-3 ${openLeft ? 'right-0' : 'left-0'}`}>
            <CopilotPanel
              skillId={skillId}
              onClose={() => setOpen(false)}
              onProposalAccepted={onProposalAccepted}
            />
          </div>
        ) : null}
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            if (!wasDragged.current) setOpen(!open)
          }}
          className="relative flex size-12 touch-none items-center justify-center rounded-full border border-white/10 bg-[#181b22] text-zinc-300 shadow-lg transition select-none hover:border-white/20 hover:text-white"
          aria-label={open ? 'Close Conxa Copilot' : 'Open Conxa Copilot'}
        >
          <Sparkles className="size-5" aria-hidden />
          {pendingProposal && !open ? (
            <span
              className="bg-brand ring-background absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2"
              aria-label="A proposal is waiting for your decision"
            />
          ) : null}
        </button>
      </div>
    </div>
  )
}
