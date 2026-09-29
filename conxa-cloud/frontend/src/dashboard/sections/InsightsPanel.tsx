'use client'

import Link from 'next/link'
import type { TrackingInsight } from '@/api/workflowsApi'
import { STATUS_COLORS } from '@/components/viz/chartTheme'
import { cn } from '@/lib/utils'

const SEVERITY = {
  critical: { dot: STATUS_COLORS.error, text: 'text-red-300', label: 'Critical' },
  warning: { dot: STATUS_COLORS.warn, text: 'text-amber-300', label: 'Warning' },
  info: { dot: 'rgba(244,245,247,0.45)', text: 'text-zinc-400', label: 'Info' },
} as const

/**
 * What needs attention, and why.
 *
 * Every item is computed from a number already on this page by a fixed rule — no model is
 * consulted. That is what lets each one link straight to the evidence behind it: an insight
 * an operator cannot verify is one they learn to scroll past.
 */
export function InsightsPanel({ insights }: { insights: TrackingInsight[] }) {
  if (!insights.length) {
    return (
      <p className="border-t border-white/8 pt-5 text-sm leading-relaxed text-zinc-400">
        Nothing to flag yet. Insights appear once workflows have enough runs to compare against
        the previous period.
      </p>
    )
  }

  const allClear = insights.length === 1 && insights[0].id === 'all_clear'
  return (
    <ul className="border-t border-white/8">
      {insights.map((insight) => {
        const severity = allClear
          ? { dot: STATUS_COLORS.ok, text: 'text-teal-300', label: 'All clear' }
          : SEVERITY[insight.severity]
        return (
          <li key={insight.id} className="border-b border-white/8">
            <Link
              href={insight.evidence}
              className="group flex flex-col gap-2 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
            >
              <span className="flex items-center justify-between gap-3">
                <span className={cn('inline-flex items-center gap-2 text-xs font-medium', severity.text)}>
                  <span className="size-1.5 rounded-full" style={{ background: severity.dot }} aria-hidden />
                  {severity.label}
                </span>
                <span className="text-xs tabular-nums text-zinc-400">{insight.metric}</span>
              </span>
              <span className="text-sm font-medium text-zinc-100">{insight.title}</span>
              <span className="text-sm leading-relaxed text-zinc-400">{insight.body}</span>
              <span className="text-sm text-zinc-400 transition-colors group-hover:text-zinc-100">See evidence →</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
