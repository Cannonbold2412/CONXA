'use client'

import type { TrackingRoi } from '@/api/pluginApi'
import { fmtNumber } from '../dashboardData'

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    // An admin can store any currency string; an unknown code must not crash the panel.
    return `${fmtNumber(amount)} ${currency}`
  }
}

/**
 * Business impact, with the estimate and the measurement kept visibly apart.
 *
 * Hours saved rests on an admin-supplied "minutes a human used to spend" figure — telemetry
 * has no such signal. Presenting it beside genuinely measured counts without saying which is
 * which is how a dashboard number ends up in a board deck it cannot support, so the
 * assumption is printed next to the figure that depends on it.
 */
export function RoiSummary({ roi }: { roi: TrackingRoi }) {
  const { estimated, measured, assumptions } = roi

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3">
          <p className="text-[11px] font-medium text-zinc-500">Hours saved</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">
            {fmtNumber(estimated.hours_saved)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Estimated at {assumptions.default_minutes} min per run
          </p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3">
          <p className="text-[11px] font-medium text-zinc-500">Value at {money(assumptions.hourly_rate, estimated.currency)}/hr</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">
            {money(estimated.value_amount, estimated.currency)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">Estimate — based on your assumptions</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Measured, no assumptions</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[
            ['Runs completed unattended', measured.unattended_completions],
            ['Runs that self-healed', measured.self_healed_runs],
            ['Steps healed at zero token cost', measured.zero_token_recoveries],
            ['Steps that needed a model', measured.agent_assisted_recoveries],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-[11px] text-zinc-500">{label}</dt>
              <dd className="shrink-0 text-sm font-medium tabular-nums text-zinc-200">
                {fmtNumber(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
