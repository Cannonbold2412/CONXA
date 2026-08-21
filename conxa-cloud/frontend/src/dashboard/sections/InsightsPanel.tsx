'use client'

import Link from 'next/link'
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react'
import type { TrackingInsight } from '@/api/workflowsApi'
import { cn } from '@/lib/utils'

const SEVERITY = {
  critical: { icon: AlertOctagon, chip: 'bg-red-500/10 text-red-300', label: 'Critical' },
  warning: { icon: AlertTriangle, chip: 'bg-amber-500/10 text-amber-300', label: 'Warning' },
  info: { icon: Info, chip: 'bg-white/[0.06] text-zinc-400', label: 'Info' },
} as const

/**
 * What needs attention, and why.
 *
 * Every item is computed from a number already on this page by a fixed rule — no model is
 * consulted. That is what lets each one carry a link straight to the evidence behind it: an
 * insight an operator cannot verify is one they learn to scroll past.
 */
export function InsightsPanel({ insights }: { insights: TrackingInsight[] }) {
  if (!insights.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="size-5 text-zinc-600" aria-hidden />
        <p className="text-sm text-zinc-400">Nothing to flag yet</p>
        <p className="max-w-xs text-[11px] leading-relaxed text-zinc-600">
          Insights appear once workflows have enough runs to compare against the previous period.
        </p>
      </div>
    )
  }

  const allClear = insights.length === 1 && insights[0].id === 'all_clear'

  return (
    <ul className="space-y-2">
      {insights.map((insight) => {
        const severity = SEVERITY[insight.severity]
        const Icon = allClear ? CheckCircle2 : severity.icon
        return (
          <li key={insight.id}>
            <Link
              href={insight.evidence}
              className={cn(
                'group flex gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 transition-colors',
                'hover:border-white/12 hover:bg-white/[0.045]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
                  allClear ? 'bg-emerald-500/10 text-emerald-300' : severity.chip,
                )}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-zinc-100">{insight.title}</span>
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-400">
                    {insight.metric}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{insight.body}</p>
              </div>

              <ArrowRight
                className="mt-1 size-3.5 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400"
                aria-hidden
              />
              <span className="sr-only">{severity.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
