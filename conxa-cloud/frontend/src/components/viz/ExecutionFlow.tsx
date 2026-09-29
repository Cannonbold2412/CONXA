import { cn } from '@/lib/utils'
import { ZERO_TOKEN_TIERS } from './chartTheme'

export type FlowStep = {
  index: number
  label: string
  status: 'ok' | 'recovered' | 'failed' | 'not_reached'
  tiers: string[]
  assertionsPassed: number
  assertionsFailed: number
}

const STATUS: Record<FlowStep['status'], { node: string; label: string; outcome: string; word: string }> = {
  ok: { node: 'bg-white/10 text-zinc-100', label: 'text-zinc-100', outcome: 'text-zinc-400', word: 'Worked first time' },
  recovered: { node: 'bg-cyan-400/12 text-cyan-300', label: 'text-zinc-100', outcome: 'text-cyan-300', word: 'Repaired automatically' },
  failed: { node: 'bg-red-400/15 text-red-300', label: 'text-zinc-100', outcome: 'text-red-300', word: 'Could not be recovered' },
  not_reached: { node: 'border border-dashed border-white/20 text-zinc-400', label: 'text-zinc-400', outcome: 'text-zinc-400', word: 'Skipped — the run stopped earlier' },
}

/**
 * One execution, step by step, as a vertical timeline.
 *
 * A list rather than an SVG diagram so each step stays selectable, screen-reader navigable,
 * and readable on a phone. Repaired and failed steps show the path recovery took — which
 * tiers ran, and whether the last one fixed it — so "why did this stop" is answered in place.
 */
export function ExecutionFlow({ steps }: { steps: FlowStep[] }) {
  if (!steps.length) {
    return <p className="py-8 text-center text-xs text-zinc-400">This run reported no step-level events.</p>
  }

  return (
    <ol>
      {steps.map((step, position) => {
        const style = STATUS[step.status]
        const isLast = position === steps.length - 1
        const checks = step.assertionsPassed + step.assertionsFailed
        return (
          <li key={step.index} className="relative flex gap-5 pb-6 last:pb-0">
            {!isLast ? <span className="absolute left-[13px] top-8 bottom-1 w-0.5 bg-white/[0.08]" aria-hidden /> : null}
            <span
              className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums', style.node)}
              aria-hidden
            >
              {step.index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <p className={cn('text-sm font-medium', style.label)}>
                <span className="sr-only">Step {step.index + 1}: </span>
                {step.label}
              </p>
              <p className={cn('text-sm', style.outcome)}>
                {style.word}
                {checks > 0 ? (
                  <span className="text-zinc-400">
                    {' '}· {step.assertionsPassed} of {checks} checks passed
                  </span>
                ) : null}
              </p>
              {step.tiers.length && (step.status === 'recovered' || step.status === 'failed') ? (
                <ul className="flex flex-wrap items-center gap-2 pt-1.5" aria-label="Recovery path">
                  {step.tiers.map((tier, i) => {
                    const lastTry = i === step.tiers.length - 1
                    const fixed = step.status === 'recovered' && lastTry
                    const free = ZERO_TOKEN_TIERS.has(tier)
                    return (
                      <li key={`${tier}-${i}`} className="flex items-center gap-2">
                        {i > 0 ? <span className="text-xs text-zinc-500" aria-hidden>→</span> : null}
                        <span
                          className={cn(
                            'rounded-lg px-2.5 py-1.5 text-xs',
                            fixed
                              ? 'bg-cyan-400/10 text-cyan-300'
                              : step.status === 'failed' && lastTry
                                ? 'bg-red-400/10 text-red-300'
                                : 'bg-white/[0.04] text-zinc-400',
                          )}
                        >
                          {tier} · {free ? 'free repair' : 'AI agent'} · {fixed ? 'fixed it' : 'no match'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
