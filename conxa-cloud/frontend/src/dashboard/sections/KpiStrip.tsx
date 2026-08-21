'use client'

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import type { TrackingKpi } from '@/api/workflowsApi'
import { Sparkline } from '@/components/viz/Sparkline'
import { cn } from '@/lib/utils'
import { fmtDuration, fmtNumber, fmtPercent } from '../dashboardData'

function formatValue(kpi: TrackingKpi): string {
  if (kpi.unit === 'percent') return fmtPercent(kpi.value)
  if (kpi.unit === 'duration') return fmtDuration(kpi.value)
  return fmtNumber(kpi.value)
}

/**
 * Whether a change is good depends on the metric, not its sign: fewer failures is an
 * improvement, fewer executions is not. `direction` carries that per KPI so nothing is
 * painted green just for going up.
 */
function deltaTone(kpi: TrackingKpi): 'good' | 'bad' | 'flat' {
  if (kpi.delta === 0 || kpi.delta_pct === null) return 'flat'
  const rising = kpi.delta > 0
  const goodWhenRising = kpi.direction === 'up_good'
  return rising === goodWhenRising ? 'good' : 'bad'
}

const TONE_CLASS = {
  good: 'text-emerald-300',
  bad: 'text-red-300',
  flat: 'text-zinc-500',
} as const

/**
 * The headline numbers, as one divided strip rather than a row of bordered tiles.
 *
 * Six boxed hero-metric cards is the SaaS-marketing reflex; it wastes vertical space and
 * makes five equally-weighted numbers all shout. A strip with hairline dividers reads as a
 * single instrument panel, which is what it is.
 */
export function KpiStrip({ kpis, rangeLabel }: { kpis: TrackingKpi[]; rangeLabel: string }) {
  if (!kpis.length) return null

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
      {kpis.map((kpi) => {
        const tone = deltaTone(kpi)
        const Arrow = tone === 'flat' ? ArrowRight : kpi.delta > 0 ? ArrowUpRight : ArrowDownRight
        return (
          <div key={kpi.key} className="min-w-0 px-4 py-3.5">
            <p className="truncate text-[11px] font-medium text-zinc-500">{kpi.label}</p>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <span className="truncate text-2xl font-semibold tabular-nums text-zinc-100">
                {formatValue(kpi)}
              </span>
              <Sparkline
                values={kpi.series}
                width={64}
                height={22}
                color={tone === 'bad' ? 'var(--status-error)' : 'var(--tier-4)'}
                className="mb-1 shrink-0"
              />
            </div>
            <p className={cn('mt-1 flex items-center gap-1 text-[11px] tabular-nums', TONE_CLASS[tone])}>
              <Arrow className="size-3 shrink-0" aria-hidden />
              {kpi.delta_pct === null ? (
                <span className="text-zinc-600">No prior data</span>
              ) : (
                <>
                  {Math.abs(kpi.delta_pct)}%
                  <span className="truncate text-zinc-600">vs prior {rangeLabel.toLowerCase()}</span>
                </>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}
