import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copilotVerify, errorMessage } from '@/api/workflowApi'
import { useCopilotStore } from '@/store/copilotStore'

type Props = { skillId: string }

const VERDICT_COPY: Record<'fixed' | 'still_failing' | 'progressed', string> = {
  fixed: 'Fixed — retest passed',
  still_failing: 'Still failing at the same step',
  progressed: 'Progressed — a different step now fails',
}

/** Renders after a copilot proposal is accepted (BUILD-26 stage e). Nothing here runs against the
 *  real system without a deliberate click: the first click only counts non-reversible steps
 *  (no build, no browser); only "Run anyway" rebuilds and retests the workflow.
 *
 *  ponytail: unlike WorkflowTests.tsx's requestRun(), this does not pre-check the workflow's
 *  group auth before running — CopilotLauncher only carries skillId today, not group_id. A stale
 *  session still surfaces (as the runtime's own auth error, relayed into the log and captured as
 *  the retest's still_failing/progressed message) rather than being swallowed; it just isn't the
 *  friendlier RunGateDialog experience. Add group_id plumbing if reviewers hit this often. */
export function VerifyCard({ skillId }: Props) {
  const verify = useCopilotStore((s) => s.verify)
  const setVerifyConfirming = useCopilotStore((s) => s.setVerifyConfirming)
  const setVerifyRunning = useCopilotStore((s) => s.setVerifyRunning)
  const appendVerifyLog = useCopilotStore((s) => s.appendVerifyLog)
  const setVerifyDone = useCopilotStore((s) => s.setVerifyDone)
  const clearVerify = useCopilotStore((s) => s.clearVerify)
  const [busy, setBusy] = useState(false)

  if (verify.status === 'idle' || !verify.stepKey) return null
  const stepKey = verify.stepKey
  const proposalId = verify.proposalId ?? undefined

  const runPreflight = async () => {
    setBusy(true)
    try {
      const result = await copilotVerify(skillId, { stepKey, proposalId, confirmed: false })
      if (result.status === 'confirm_required') {
        setVerifyConfirming(result.irreversible_count, result.irreversible_steps)
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not check this workflow'))
    } finally {
      setBusy(false)
    }
  }

  const runVerify = async () => {
    setVerifyRunning()
    setBusy(true)
    try {
      const result = await copilotVerify(skillId, { stepKey, proposalId, confirmed: true }, appendVerifyLog)
      if (result.status === 'cancelled') {
        clearVerify()
        return
      }
      setVerifyDone(result.verdict ?? null, result.message ?? '')
    } catch (err) {
      setVerifyDone(null, errorMessage(err, 'Retest failed'))
    } finally {
      setBusy(false)
    }
  }

  if (verify.status === 'done') {
    const verdict = verify.verdict
    const ok = verdict === 'fixed'
    return (
      <div
        className={`space-y-1.5 rounded-lg border p-3 text-sm ${
          ok ? 'border-status-ok-ring bg-status-ok-subtle text-status-ok' : 'border-status-warn-ring bg-status-warn-subtle text-status-warn'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {verdict ? VERDICT_COPY[verdict] : 'Retest could not complete'}
        </div>
        {verify.message ? <p className="text-xs leading-relaxed opacity-80">{verify.message}</p> : null}
        <Button type="button" variant="ghost" size="sm" className="h-6 px-0 text-xs" onClick={clearVerify}>
          Dismiss
        </Button>
      </div>
    )
  }

  if (verify.status === 'running') {
    return (
      <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
        <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Verifying…</p>
        <div className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-[0.7rem] text-zinc-500">
          {verify.logs.slice(-8).map((line, i) => (
            <p key={i} className="truncate">
              {line}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // status === 'confirming'
  if (!verify.preflighted) {
    return (
      <div className="pt-1">
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={busy} onClick={() => void runPreflight()}>
          {busy ? 'Checking…' : 'Verify fix'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-status-warn-ring bg-status-warn-subtle p-3 text-sm text-status-warn">
      <p className="leading-relaxed">
        {verify.irreversibleCount > 0
          ? `This run performs ${verify.irreversibleCount} step${verify.irreversibleCount === 1 ? '' : 's'} that commit or destroy data.`
          : 'This run acts against the real system.'}{' '}
        Rebuilding and retesting will run it for real.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 flex-1" disabled={busy} onClick={clearVerify}>
          Cancel
        </Button>
        <Button type="button" variant="brand" size="sm" className="h-7 flex-1" disabled={busy} onClick={() => void runVerify()}>
          Run anyway
        </Button>
      </div>
    </div>
  )
}
