'use client'

import type { TrackingDashboardResponse } from '@/api/workflowsApi'
import { fmtNumber } from '../dashboardData'

/**
 * Deployment reach — how far the automation is actually rolled out.
 *
 * One quiet line under the KPI strip, not a second instrument panel: these are standing
 * facts about reach, not the numbers a reader scans for change. Runtimes that have gone
 * quiet sit alongside them because a shrinking install base and a healthy success rate look
 * identical if you only watch the success rate.
 */
export function FootprintStrip({ data }: { data: TrackingDashboardResponse }) {
  const quiet = data.stale_runtimes
  return (
    <p className="text-sm leading-relaxed text-zinc-400">
      Reach — <span className="text-zinc-100 tabular-nums">{fmtNumber(data.metrics.total_installs)}</span> installs ·{' '}
      <span className="text-zinc-100 tabular-nums">{fmtNumber(data.metrics.active_users)}</span> active users ·{' '}
      <span className="text-zinc-100 tabular-nums">{fmtNumber(data.metrics.active_companies)}</span> companies ·{' '}
      <span className={quiet > 0 ? 'tabular-nums text-amber-300' : 'tabular-nums text-zinc-100'}>{fmtNumber(quiet)}</span>{' '}
      runtimes gone quiet (no report in 30+ days)
    </p>
  )
}
