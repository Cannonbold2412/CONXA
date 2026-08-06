'use client'

import { TIER_ORDER, ZERO_TOKEN_TIERS, tierColor } from './chartTheme'

export type TierCount = { tier: string; steps?: number; count?: number }

/**
 * The recovery ladder as ranked bars.
 *
 * Split at the Tier 2/3 boundary because that boundary is the product's economics: Tier 1
 * and 2 resolve locally at zero model cost, Tier 3 and 4 call a model. An operator reading
 * this needs to see how much of their healing is free, not just how much there is.
 */
export function TierLadder({ counts }: { counts: TierCount[] }) {
  const byTier = new Map(counts.map((c) => [c.tier, c.steps ?? c.count ?? 0]))
  const rows = TIER_ORDER.map((tier) => ({ tier, value: byTier.get(tier) ?? 0 }))
  const max = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((sum, r) => sum + r.value, 0)

  return (
    <div className="space-y-2.5">
      {rows.map(({ tier, value }) => {
        const free = ZERO_TOKEN_TIERS.has(tier)
        return (
          <div key={tier} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
              <span className="size-2 rounded-[2px]" style={{ background: tierColor(tier) }} aria-hidden />
              {tier}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.045]">
              <span
                className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
                style={{ width: `${(value / max) * 100}%`, background: tierColor(tier) }}
              />
            </span>
            <span className="text-right text-[11px] tabular-nums text-zinc-300">
              {value}
              <span className="ml-1 text-zinc-600">
                {total ? `${Math.round((value / total) * 100)}%` : ''}
              </span>
            </span>
            <span className="sr-only">{free ? 'Resolved without model tokens' : 'Required a model call'}</span>
          </div>
        )
      })}
      <p className="pt-1 text-[11px] leading-relaxed text-zinc-600">
        Tier 1–2 resolve locally and cost nothing. Tier 3–4 call a model.
      </p>
    </div>
  )
}
