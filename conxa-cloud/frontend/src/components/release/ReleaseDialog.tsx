'use client'

import { releaseVersion, type ReleaseResult } from '@/api/workflowsApi'
import { Rocket } from 'lucide-react'
import { ConfirmVersionActionDialog } from './ConfirmVersionActionDialog'

/** Confirm-then-release for a "ready" (published, undeployed) version — the
 * one action in this entire product that turns "published" into "deployed".
 * Cloud-only, admin-gated server-side (require_admin, same as rollback).
 * Only ever rendered for rows releaseState.canReleaseTo() says are eligible. */
export function ReleaseDialog({
  skillSlug,
  version,
  currentStableVersion,
  onReleased,
}: {
  skillSlug: string
  version: string
  currentStableVersion: string | null
  onReleased: (result: ReleaseResult) => void
}) {
  return (
    <ConfirmVersionActionDialog
      mutationFn={() => releaseVersion(skillSlug, version)}
      onSuccess={onReleased}
      errorFallback="Release failed"
      triggerIcon={<Rocket className="size-3.5" />}
      triggerLabel="Release to Production"
      triggerClassName="bg-emerald-600 text-white hover:bg-emerald-700"
      title={`Release v${version}?`}
      description={
        <>
          Current stable: <span className="font-mono text-zinc-200">v{currentStableVersion ?? '— none yet'}</span>
          <br />
          Target: <span className="font-mono text-zinc-200">v{version}</span>
          <br />
          <br />
          Every entitled runtime will receive v{version} at its next sync. This is the only
          action that deploys a published version to customer machines.
        </>
      }
      actionClassName="bg-emerald-600 text-white hover:bg-emerald-700"
      actionLabel={`Release v${version}`}
      actionPendingLabel="Releasing..."
    />
  )
}
