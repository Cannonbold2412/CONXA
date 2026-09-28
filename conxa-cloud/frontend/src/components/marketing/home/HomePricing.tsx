'use client'

import Link from 'next/link'
import { formatPrice, normalizePlan } from '@/billing/billingData'
import { STATIC_PLANS, TIER_CTA } from '../sections/PricingTable'
import { H2, LEAD, WRAP } from './ui'

/** Dots shown per tier; the counts mirror the seat/machine limits in STATIC_PLANS. */
const PIPS: Record<string, number> = { free: 1, starter: 3, pro: 10 }
const NOTE: Record<string, string> = {
  free: 'Prove it works',
  starter: 'Run across your team',
  pro: 'Ship to customers',
  enterprise: 'White-label distribution',
}

function Pips({ n, label }: { n: number | null; label: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-[#9ba3af]">
      {n !== null && (
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`size-2.5 rounded-full ${i < n ? 'bg-cyan-400' : 'bg-white/14'}`} />
          ))}
        </div>
      )}
      <div>{label}</div>
    </div>
  )
}

export function HomePricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-[#06080b] pt-32">
      <div className={`${WRAP} flex flex-col gap-14`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
          <h2 className={`${H2} max-w-xl`}>Pay for reach, not for runs.</h2>
          <p className={`${LEAD} max-w-md`}>
            Price follows seats and machines. A skill run a thousand times costs the same as one run once.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {STATIC_PLANS.map((plan) => {
            const tier = normalizePlan(plan.tier)
            const cta = TIER_CTA[tier] ?? TIER_CTA.free
            const n = PIPS[tier] ?? null
            const pro = tier === 'pro'
            return (
              <div
                key={tier}
                className={`grid items-center gap-5 rounded-2xl border px-6 py-6 lg:grid-cols-[150px_210px_160px_160px_minmax(0,1fr)_auto] lg:px-8 ${
                  pro ? 'border-cyan-400/55 bg-[#0b0f14]' : 'border-white/8'
                }`}
              >
                <div>
                  <div className="text-2xl font-semibold">{plan.name}</div>
                  <div className="mt-1 text-sm text-[#9ba3af]">{NOTE[tier]}</div>
                </div>
                <div className="text-[clamp(1.875rem,3vw,2.5rem)] font-semibold tracking-[-0.03em]">
                  {tier === 'free' ? '₹0' : formatPrice(plan)}
                  {plan.period && tier !== 'enterprise' && <span className="text-sm font-normal text-[#9ba3af]"> /mo</span>}
                </div>
                <Pips n={n} label={plan.features[0]} />
                <Pips n={n} label={plan.features[1]} />
                <div className="text-base">{plan.features[3]}</div>
                <Link
                  href={cta.href}
                  className="justify-self-start whitespace-nowrap rounded-lg border border-white/18 px-5 py-3 text-sm font-medium text-[#f4f5f7] transition-colors hover:border-white/30 lg:justify-self-end"
                >
                  {cta.label}
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
