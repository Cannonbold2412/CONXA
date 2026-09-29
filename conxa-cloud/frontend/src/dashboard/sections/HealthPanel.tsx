'use client'

import type { TrackingHealth } from '@/api/workflowsApi'
import { INK, STATUS_COLORS } from '@/components/viz/chartTheme'

/** Only a factor that needs attention gets colour; a healthy one stays neutral. */
function barColor(value: number): string {
  if (value < 60) return STATUS_COLORS.error
  if (value < 75) return STATUS_COLORS.warn
  return INK.mid
}

/**
 * The factors behind the health score.
 *
 * The breakdown is what turns a number into an action. Each row shows its own value and how
 * much it counts toward the total, so "we dropped four points" resolves to "checks started
 * failing" without leaving the panel. The score itself sits in the summary at the top.
 */
export function HealthPanel({ health }: { health: TrackingHealth }) {
  if (!health.factors.length) {
    return (
      <p className="border-t border-white/8 pt-5 text-sm leading-relaxed text-zinc-400">
        Factors appear once the first customer run reports in. Until then there is nothing to
        score — this is a new workspace, not an unhealthy one.
      </p>
    )
  }
  return (
    <ul className="space-y-5 border-t border-white/8 pt-5">
      {health.factors.map((factor) => (
        <li key={factor.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate text-sm text-zinc-100">{factor.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              <span className="font-medium text-zinc-100">{factor.value}</span> / 100 · counts for {factor.weight}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: INK.track }}>
            <div
              className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
              style={{ width: `${Math.max(1, factor.value)}%`, background: barColor(factor.value) }}
            />
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">{factor.detail}</p>
        </li>
      ))}
    </ul>
  )
}
