import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  acceptCopilotProposal,
  errorMessage,
  rejectCopilotProposal,
  type CopilotProposal,
} from '@/api/workflowApi'
import type { WorkflowRevalidationResponse } from '@/types/workflow'
import { useCopilotStore } from '@/store/copilotStore'

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '(empty)'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

type Props = {
  skillId: string
  proposal: CopilotProposal
  onAccepted: (result: WorkflowRevalidationResponse) => void
}

/** The copilot proposes, the reviewer disposes — accept/reject is the ONLY way a proposal ever
 *  reaches the compiled skill (BUILD-26). Accept delegates server-side to cmd_patch_step (the
 *  same validated, undo-tracked path a manual edit takes); reject changes nothing and only logs. */
export function ProposalCard({ skillId, proposal, onAccepted }: Props) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const setPendingProposal = useCopilotStore((s) => s.setPendingProposal)
  const addMessage = useCopilotStore((s) => s.addMessage)

  const accept = async () => {
    setBusy('accept')
    try {
      const result = await acceptCopilotProposal(skillId, proposal)
      onAccepted(result)
      setPendingProposal(null)
      addMessage({ role: 'assistant', text: `Applied — ${proposal.field} updated.` })
      toast.success('Proposal applied')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not apply this proposal'))
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy('reject')
    try {
      await rejectCopilotProposal(skillId, proposal)
      setPendingProposal(null)
      addMessage({ role: 'assistant', text: 'Rejected — no changes made.' })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not log the rejection'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Proposed change</span>
        <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[0.65rem] text-zinc-400">
          {proposal.field}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-start gap-2">
          <span className="w-10 shrink-0 text-xs text-zinc-500">Before</span>
          <span className="min-w-0 flex-1 truncate text-zinc-400 line-through decoration-zinc-600">
            {formatValue(proposal.preview.before)}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-10 shrink-0 text-xs text-zinc-500">After</span>
          <span className="min-w-0 flex-1 break-words text-zinc-100">{formatValue(proposal.preview.after)}</span>
        </div>
      </div>
      {proposal.why ? <p className="text-xs leading-relaxed text-zinc-500">{proposal.why}</p> : null}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="brand"
          size="sm"
          className="h-7 flex-1"
          disabled={busy !== null}
          onClick={accept}
        >
          {busy === 'accept' ? 'Applying…' : 'Accept'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1"
          disabled={busy !== null}
          onClick={reject}
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
    </div>
  )
}
