'use client'

import { rollbackRelease, type RollbackResult } from '@/api/workflowsApi'
import { History } from 'lucide-react'
import { ConfirmVersionActionDialog } from './ConfirmVersionActionDialog'

/** Confirm-then-rollback for a single release history row. Cloud-only — see
 * docs/App-Flow.md. Only ever rendered for rows releaseState.canRollbackTo()
 * already says are valid targets. Rollback is scoped to exactly one skill;
 * there is no group-level or bulk rollback action anywhere in Cloud. */
export function RollbackDialog({
  skillSlug,
  version,
  currentStableVersion,
  onRolledBack,
}: {
  skillSlug: string
  version: string
  currentStableVersion: string | null
  onRolledBack: (result: RollbackResult) => void
}) {
  return (
    <ConfirmVersionActionDialog
      mutationFn={() => rollbackRelease(skillSlug, version)}
      onSuccess={onRolledBack}
      errorFallback="Rollback failed"
      triggerIcon={<History className="size-3.5" />}
      triggerLabel="Rollback"
      triggerClassName="border border-white/10 bg-white/[0.04] text-zinc-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-300"
      title={`Rollback to v${version}?`}
      description={
        <>
          Current stable: <span className="font-mono text-zinc-200">v{currentStableVersion ?? '—'}</span>
          <br />
          Target: <span className="font-mono text-zinc-200">v{version}</span>
          <br />
          <br />
          Runtimes will receive v{version} at their next sync. No artifact is rebuilt or copied — the
          stable channel simply points back to this already-published release.
        </>
      }
      actionClassName="bg-amber-600 text-white hover:bg-amber-700"
      actionLabel={`Rollback to v${version}`}
      actionPendingLabel="Rolling back..."
    />
  )
}
