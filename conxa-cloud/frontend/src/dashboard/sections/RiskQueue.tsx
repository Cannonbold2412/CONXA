'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import type { TrackingDashboardResponse } from '@/api/pluginApi'
import { cn } from '@/lib/utils'
import { buildRiskRows, fmtRelative } from '../dashboardData'

/**
 * What is failing most, workflows and steps merged into one ranked list.
 *
 * The failure aggregates carry a workflow name but no company, so the owning company is
 * recovered by matching against the workflow rollups — without it the row cannot link
 * anywhere, and a risk you can't click into is a risk you don't act on.
 */
export function RiskQueue({ data }: { data: TrackingDashboardResponse }) {
  const rows = buildRiskRows(data)
  const companyFor = new Map(data.workflows.map((w) => [w.workflow, w.company]))

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ShieldCheck className="size-5 text-zinc-600" aria-hidden />
        <p className="text-sm text-zinc-400">No failures in this period</p>
        <p className="max-w-xs text-[11px] leading-relaxed text-zinc-600">
          Failed workflows and the exact step that broke will be ranked here.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-0.5">
      {rows.map((row) => {
        const company = companyFor.get(row.name) ?? companyFor.get(row.context.split(' / ')[0])
        const href = company
          ? `/dashboard/workflows/${encodeURIComponent(company)}/${encodeURIComponent(
              row.type === 'Workflow' ? row.name : row.context.split(' / ')[0],
            )}`
          : undefined
        const Row = (
          <>
            <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
              {row.type}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-zinc-200">{row.name}</p>
              <p className="truncate text-[11px] text-zinc-600">
                {row.context} · {row.failureCode}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-red-300">
              {row.failedExecutions}
            </span>
            <time
              className="w-14 shrink-0 text-right text-[11px] tabular-nums text-zinc-600"
              dateTime={new Date(row.lastSeen).toISOString()}
            >
              {fmtRelative(row.lastSeen)}
            </time>
          </>
        )

        const shared = 'flex items-center gap-3 rounded-lg px-2 py-2'
        return (
          <li key={row.id}>
            {href ? (
              <Link
                href={href}
                className={cn(
                  shared,
                  'transition-colors hover:bg-white/[0.045]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70',
                )}
              >
                {Row}
              </Link>
            ) : (
              <div className={shared}>{Row}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
