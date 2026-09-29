'use client'

import type { TrackingKpi } from '@/api/workflowsApi'
import { Sparkline } from '@/components/viz/Sparkline'
import { INK, STATUS_COLORS } from '@/components/viz/chartTheme'
import { cn } from '@/lib/utils'
import { fmtDuration, fmtNumber, fmtPercent } from '../dashboardData'
import { kpiMeaning } from '../narrative'

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

const TONE_CLASS = { good: 'text-teal-300', bad: 'text-red-300', flat: 'text-zinc-400' } as const

/**
 * The headline numbers, as one strip between two hairlines rather than a row of boxed tiles.
 * Each delta is followed by what it means in words ("fewer failures"), so the reader never
 * has to work out whether up is good for that metric.
 */
export function KpiStrip({ kpis, rangeLabel }: { kpis: TrackingKpi[]; rangeLabel: string }) {
  if (!kpis.length) return null
  return (
    <div className="grid grid-cols-2 border-y border-white/8 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-white/8">
      {kpis.map((kpi) => {
        const tone = deltaTone(kpi)
        const arrow = tone === 'flat' ? '' : kpi.delta > 0 ? '↑ ' : '↓ '
        return (
          <div key={kpi.key} className="flex min-w-0 flex-col gap-2.5 py-5 pr-6 lg:px-6 lg:first:pl-0">
            <p className="truncate text-sm text-zinc-400">{kpi.label}</p>
            <div className="flex items-end justify-between gap-3">
              <span className="truncate text-3xl font-semibold leading-none tracking-[-0.02em] tabular-nums text-zinc-100">
                {formatValue(kpi)}
              </span>
              <Sparkline
                values={kpi.series}
                width={76}
                height={28}
                color={tone === 'bad' ? STATUS_COLORS.error : INK.mid}
                className="shrink-0"
              />
            </div>
            <p className="truncate text-xs tabular-nums text-zinc-400" title={`vs prior ${rangeLabel.toLowerCase()}`}>
              {kpi.delta_pct === null ? (
                kpiMeaning(kpi)
              ) : (
                <>
                  <span className={cn('font-medium', TONE_CLASS[tone])}>
                    {arrow}
                    {Math.abs(kpi.delta_pct)}%
                  </span>{' '}
                  · {kpiMeaning(kpi)}
                </>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}
