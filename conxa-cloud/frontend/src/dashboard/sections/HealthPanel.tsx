'use client'

import type { TrackingHealth } from '@/api/pluginApi'
import { HealthArc } from '@/components/viz/HealthArc'
import { cn } from '@/lib/utils'

function barTone(value: number): string {
  if (value >= 90) return 'bg-emerald-400/70'
  if (value >= 75) return 'bg-cyan-400/70'
  if (value >= 60) return 'bg-amber-400/70'
  return 'bg-red-400/70'
}

/**
 * Health score plus the factors that produced it.
 *
 * The breakdown is not optional detail — it is what turns a number into an action. Each row
 * shows its own value and the weight it carries, so "we dropped four points" resolves to
 * "assertions started failing" without leaving the panel.
 */
export function HealthPanel({ health }: { health: TrackingHealth }) {
  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-col items-center gap-2">
        <HealthArc score={health.score} grade={health.grade} />
        <p className="max-w-[15rem] text-center text-[11px] leading-relaxed text-zinc-500">
          {health.summary}
        </p>
      </div>

      {health.factors.length > 0 ? (
        <ul className="w-full min-w-0 flex-1 space-y-3">
          {health.factors.map((factor) => (
            <li key={factor.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-zinc-300">{factor.label}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                  {factor.value}
                  <span className="text-zinc-600">/100 · weight {factor.weight}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={cn(
                    'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out',
                    barTone(factor.value),
                  )}
                  style={{ width: `${Math.max(1, factor.value)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">{factor.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 text-[11px] leading-relaxed text-zinc-600">
          Factors appear once the first customer execution reports in. Until then there is nothing
          to score — this is a new workspace, not an unhealthy one.
        </p>
      )}
    </div>
  )
}
