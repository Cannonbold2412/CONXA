'use client'

import { cn } from '@/lib/utils'
import { TIER_ORDER, tierColor } from './chartTheme'

export type FlowStep = {
  index: number
  label: string
  status: 'ok' | 'recovered' | 'failed' | 'not_reached'
  tiers: string[]
  assertionsPassed: number
  assertionsFailed: number
}

const STATUS_STYLE: Record<FlowStep['status'], { dot: string; ring: string; text: string; word: string }> = {
  ok:          { dot: 'bg-emerald-400', ring: 'border-emerald-500/30', text: 'text-zinc-300', word: 'Succeeded' },
  recovered:   { dot: 'bg-cyan-400',    ring: 'border-cyan-500/35',    text: 'text-zinc-200', word: 'Self-healed' },
  failed:      { dot: 'bg-red-400',     ring: 'border-red-500/40',     text: 'text-red-200',  word: 'Failed' },
  not_reached: { dot: 'bg-zinc-700',    ring: 'border-white/8',        text: 'text-zinc-600', word: 'Not reached' },
}

/**
 * One execution, step by step.
 *
 * Rendered as a list rather than an SVG diagram so each step stays selectable, screen-reader
 * navigable, and readable on a phone — a horizontal node graph of 40 steps is neither. The
 * connector line is decoration; the semantics live in the text.
 */
export function ExecutionFlow({ steps }: { steps: FlowStep[] }) {
  if (!steps.length) {
    return (
      <p className="py-8 text-center text-[11px] text-zinc-600">
        This run reported no step-level events.
      </p>
    )
  }

  return (
    <ol className="relative space-y-0">
      {steps.map((step, position) => {
        const style = STATUS_STYLE[step.status]
        const isLast = position === steps.length - 1
        return (
          <li key={step.index} className="relative flex gap-3 pb-3 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border bg-[#0b0f14]',
                  style.ring,
                )}
              >
                <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />
              </span>
              {!isLast ? <span className="mt-1 w-px flex-1 bg-white/8" aria-hidden /> : null}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-sm font-medium', style.text)}>{step.label}</span>
                <span className="text-[11px] text-zinc-600">{style.word}</span>
                {step.tiers.map((tier) => (
                  <span
                    key={tier}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-400"
                    title={
                      TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]) < 2
                        ? `${tier} — resolved locally, no model tokens`
                        : `${tier} — required a model call`
                    }
                  >
                    <span className="size-1.5 rounded-full" style={{ background: tierColor(tier) }} aria-hidden />
                    {tier}
                  </span>
                ))}
              </div>
              {step.assertionsPassed + step.assertionsFailed > 0 ? (
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  {step.assertionsPassed} of {step.assertionsPassed + step.assertionsFailed} checks passed
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
