import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCopilotStore } from '@/store/copilotStore'
import type { WorkflowRevalidationResponse } from '@/types/workflow'
import { CopilotPanel } from './CopilotPanel'

type Props = {
  skillId: string
  onProposalAccepted: (result: WorkflowRevalidationResponse) => void
}

/** A fixed-corner launcher + floating chat card, not a Tools-rail tab — the Tools rail opens as
 *  a shared modal dialog (see HumanEditPage.tsx), which would hide the step list exactly when a
 *  conversation about a specific step needs it visible. Corner and open state persist per
 *  browser storage the same way the workflow pane's width does (BUILD-26).
 *
 *  Per DESIGN.md's One Accent Rule, this stays a flat charcoal surface — clay is already spent
 *  on this page's Approve CTA. The one place clay appears here is the pending-decision dot and
 *  the proposal's own Accept button, because at that moment it genuinely is the current primary
 *  action. */
export function CopilotLauncher({ skillId, onProposalAccepted }: Props) {
  const open = useCopilotStore((s) => s.open)
  const corner = useCopilotStore((s) => s.corner)
  const pendingProposal = useCopilotStore((s) => s.pendingProposal)
  const setOpen = useCopilotStore((s) => s.setOpen)
  const ensureFor = useCopilotStore((s) => s.ensureFor)

  ensureFor(skillId)

  const sideClass = corner === 'right' ? 'right-5' : 'left-5'

  return (
    <div className={cn('pointer-events-none fixed bottom-5 z-40 flex flex-col items-end', sideClass)}>
      {open ? (
        <div className="pointer-events-auto">
          <CopilotPanel
            skillId={skillId}
            corner={corner}
            onClose={() => setOpen(false)}
            onProposalAccepted={onProposalAccepted}
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="pointer-events-auto relative flex size-12 items-center justify-center rounded-full border border-white/10 bg-[#181b22] text-zinc-300 shadow-lg transition hover:border-white/20 hover:text-white"
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
  )
}
