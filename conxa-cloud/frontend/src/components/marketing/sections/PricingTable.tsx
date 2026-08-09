'use client'

import { useQuery } from '@tanstack/react-query'
import { listPlans, type Plan } from '@/api/cashfreeApi'
import { formatPeriod, formatPrice, normalizePlan } from '@/billing/billingData'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { GlowButton } from '../primitives/GlowButton'

const TIER_SUB: Record<string, string> = {
  free: '30-day trial',
  starter: 'One product team',
  pro: 'Scaling as a channel',
  enterprise: 'Bank / insurer, cross-app',
}

const TIER_CTA: Record<string, { label: string; href: string }> = {
  free: { label: 'Start for free', href: '/sign-up' },
  starter: { label: 'Start on Starter', href: '/sign-up' },
  pro: { label: 'Start on Pro', href: '/sign-up' },
  enterprise: { label: 'Talk to us', href: '/docs/support' },
}

function TierCard({ plan, highlighted }: { plan: Plan; highlighted: boolean }) {
  const tier = normalizePlan(plan.tier)
  const cta = TIER_CTA[tier] ?? TIER_CTA.free

  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-7 ${
        highlighted ? 'border-[rgba(34,211,238,0.35)] bg-[#0d1420]' : 'border-white/6 bg-[#0f1620]'
      }`}
    >
      {highlighted && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #22d3ee, #5eead4)' }}
            aria-hidden
          />
          <span className="mb-4 inline-flex w-fit items-center rounded-full border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.08)] px-2.5 py-1 text-xs font-medium uppercase tracking-widest text-cyan-300">
            Distribution channel
          </span>
        </>
      )}
      <p className="text-lg font-semibold text-[#f4f5f7]">{plan.name}</p>
      <p className="mt-1 text-xs text-[#6b7280]">{TIER_SUB[tier] ?? ''}</p>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums text-[#f4f5f7]">{formatPrice(plan)}</span>
        <span className="text-sm text-[#6b7280]">/ {formatPeriod(plan)}</span>
      </p>

      <ul className="mt-7 flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-[#9ba3af]">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <GlowButton href={cta.href} variant={highlighted ? 'primary' : 'ghost'} className="w-full justify-center">
          {cta.label}
        </GlowButton>
      </div>
    </div>
  )
}

export function PricingTable() {
  const q = useQuery({ queryKey: ['public-plans'], queryFn: listPlans, staleTime: 60_000, retry: 1 })

  return (
    <section id="pricing" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Pricing"
          headline="Pay for reach, not for runs."
          sub="Unlimited installs and unlimited executions on every tier. You pay for how much of your product you compile and publish — not how often it's used."
        />

        {q.isLoading && (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl border border-white/6 bg-[#0f1620]" />
            ))}
          </div>
        )}

        {q.isError && (
          <p className="mt-14 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            Pricing is temporarily unavailable. Please refresh, or reach us at{' '}
            <a href="/docs/support" className="underline">
              support
            </a>
            .
          </p>
        )}

        {q.data && (
          <Reveal className="mt-14">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {q.data.plans.map((plan) => (
                <TierCard key={plan.tier} plan={plan} highlighted={normalizePlan(plan.tier) === 'pro'} />
              ))}
            </div>
          </Reveal>
        )}

        <div className="mt-14 grid gap-8 border-t border-white/6 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-medium text-[#f4f5f7]">Compile credit</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9ba3af]">
              One fresh compile through Conxa Cloud consumes one credit. Recording, editing, and testing workflows
              locally stay unlimited on every tier — only turning a workflow into a runnable skill draws from the pool.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-[#f4f5f7]">Unlimited runs per install</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9ba3af]">
              Execution is local. Once a skill is on a machine, running it costs nothing extra — on any tier, at any
              volume.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-[#f4f5f7]">Model access by tier</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9ba3af]">
              Free runs on a Conxa-hosted open model at no cost. Starter and Pro compile on managed premium models we
              pay for and include in the price. BYOK is an Enterprise option, for teams that need their own key for
              compliance or cost control.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-[#f4f5f7]">Human Edit credit</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9ba3af]">
              Token pool for selector repair, semantic repair, and re-anchoring after a compile — separate from the
              compile credit that creates the workflow in the first place.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
