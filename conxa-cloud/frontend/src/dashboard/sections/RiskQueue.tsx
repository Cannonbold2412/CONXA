'use client'

import Link from 'next/link'
import type { TrackingDashboardResponse } from '@/api/workflowsApi'
import { STATUS_COLORS, INK } from '@/components/viz/chartTheme'
import { buildRiskRows } from '../dashboardData'

/**
 * What is failing most — workflows and steps merged into one ranked list.
 *
 * Stacked (name and count, bar, reason) so it fits a narrow column beside the runs chart.
 * The failure aggregates carry a workflow name but no company, so the owning company is
 * recovered from the workflow rollups — without it the row cannot link anywhere, and a risk
 * you can't click into is a risk you don't act on.
 */
export function RiskQueue({ data, range }: { data: TrackingDashboardResponse; range: string }) {
  const rows = buildRiskRows(data).slice(0, 5)
  const companyFor = new Map(data.workflows.map((w) => [w.workflow, w.company]))

  if (!rows.length) {
    return (
      <p className="border-t border-white/8 pt-5 text-sm leading-relaxed text-zinc-400">
        No failures in this period. Failed workflows and the exact step that broke will be ranked here.
      </p>
    )
  }

  const max = Math.max(1, ...rows.map((r) => r.failedExecutions))
  return (
    <ol className="space-y-5">
      {rows.map((row) => {
        const workflow = row.workflow
        const company = companyFor.get(workflow)
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-zinc-100">{row.name}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-100">{row.failedExecutions}</span>
            </span>
            <span className="block h-2 rounded-full" style={{ background: INK.track }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(row.failedExecutions / max) * 100}%`, background: STATUS_COLORS.error, opacity: 0.75 }}
              />
            </span>
            <span className="block truncate text-xs text-zinc-400">{row.reason}</span>
          </>
        )
        return (
          <li key={row.id}>
            {company ? (
              <Link
                href={`/dashboard/workflows/${encodeURIComponent(company)}/${encodeURIComponent(workflow)}?range=${range}`}
                className="flex flex-col gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400/70"
              >
                {body}
              </Link>
            ) : (
              <div className="flex flex-col gap-2">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
