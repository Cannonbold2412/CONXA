'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { ExecutionFlow, type FlowStep } from '@/components/viz/ExecutionFlow'
import { TierLadder } from '@/components/viz/TierLadder'

/**
 * Illustrative figures throughout this section.
 *
 * They describe how the cascade is built, not what any customer measured — install volume is
 * still thin, and captioning a drawing as evidence is the kind of claim a security reviewer
 * checks. The section says so in plain text underneath.
 */
const RUN: FlowStep[] = [
  { index: 1, label: 'Open the supplier portal', status: 'ok', tiers: [], assertionsPassed: 1, assertionsFailed: 0 },
  { index: 2, label: 'Create the vendor record', status: 'ok', tiers: [], assertionsPassed: 2, assertionsFailed: 0 },
  { index: 3, label: 'Set the payment terms', status: 'ok', tiers: [], assertionsPassed: 1, assertionsFailed: 0 },
  {
    index: 4,
    label: 'Attach the compliance certificate',
    status: 'recovered',
    tiers: ['Tier 2'],
    assertionsPassed: 2,
    assertionsFailed: 0,
  },
  { index: 5, label: 'Post the record to the ERP', status: 'ok', tiers: [], assertionsPassed: 3, assertionsFailed: 0 },
  { index: 6, label: 'Check the ERP record matches', status: 'ok', tiers: [], assertionsPassed: 4, assertionsFailed: 0 },
  { index: 7, label: 'Queue the first payment', status: 'ok', tiers: [], assertionsPassed: 2, assertionsFailed: 0 },
  { index: 8, label: 'Notify the requester', status: 'ok', tiers: [], assertionsPassed: 1, assertionsFailed: 0 },
]

/** Of 100 steps that needed recovery, where each one finished. */
const RESOLVED_BY_TIER = [
  { tier: 'Tier 1', steps: 62 },
  { tier: 'Tier 2', steps: 26 },
  { tier: 'Tier 3', steps: 8 },
  { tier: 'Tier 4', steps: 3 },
]

function VizPanel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0b0f14] p-6">
      <h3 className="text-sm font-semibold text-[#f4f5f7]">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[#9ba3af]">{caption}</p>
      {/* Centred: the Sankey panel is stretched to the height of the two stacked panels
          beside it, and a top-aligned chart leaves a dead half-panel underneath. */}
      <div className="mt-6 flex flex-1 flex-col justify-center">{children}</div>
    </div>
  )
}

/**
 * Cost as volume grows: a compiled skill is paid for once, an agent that re-reasons the UI
 * is paid for on every run. Hand-drawn rather than data-driven — it is a claim about the
 * pricing model, not a measurement.
 */
function CostCurve() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reducedMotion = useReducedMotion()
  const drawn = reducedMotion || inView

  return (
    <svg ref={ref} viewBox="0 0 220 120" className="w-full" role="img" aria-label="Per-run agent cost climbing with usage while Conxa's stays flat">
      <line x1="26" y1="98" x2="212" y2="98" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="26" y1="12" x2="26" y2="98" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />

      <motion.path
        d="M26 94 C 90 88, 140 58, 208 16"
        fill="none"
        stroke="#6b7280"
        strokeWidth="1.6"
        strokeDasharray="4 4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={drawn ? { pathLength: 1 } : {}}
        transition={reducedMotion ? { duration: 0 } : { duration: 1.1, ease: 'easeOut' }}
      />
      <motion.path
        d="M26 84 L 208 84"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={drawn ? { pathLength: 1 } : {}}
        transition={reducedMotion ? { duration: 0 } : { duration: 1.1, delay: 0.15, ease: 'easeOut' }}
      />

      <text x="120" y="34" fill="#9ba3af" fontSize="9">agents billed per run</text>
      <text x="150" y="78" fill="#22d3ee" fontSize="9">Conxa</text>
      <text x="26" y="114" fill="#6b7280" fontSize="9">runs per month →</text>
      <text x="20" y="16" fill="#6b7280" fontSize="9" textAnchor="end" transform="rotate(-90 20 16)">
        cost
      </text>
    </svg>
  )
}

export function Reliability() {
  return (
    <section id="reliability" className="relative bg-[#0b0f14] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Automation you don't have to babysit."
          sub="Every other way of connecting AI to software fails the same test: what happens six months in, after the interface has been redesigned twice?"
        />

        <div className="mt-16 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Reveal>
            <VizPanel
              title="One run, step by step"
              caption="Vendor onboarding across four systems. The certificate upload had moved since it was recorded — the step found it again on its own and the run never stopped."
            >
              <ExecutionFlow steps={RUN} />
            </VizPanel>
          </Reveal>

          <div className="grid gap-4">
            <Reveal delay={0.08}>
              <VizPanel
                title="What the healing costs you"
                caption="Tiers 1 and 2 are deterministic and run locally — no model, no tokens, no bill. Only the last two reach for one."
              >
                {/* The panel caption above already says this, at a readable size. */}
                <TierLadder counts={RESOLVED_BY_TIER} showFootnote={false} />
              </VizPanel>
            </Reveal>
            <Reveal delay={0.16}>
              <VizPanel
                title="What it costs as volume grows"
                caption="You pay to compile a process once. Running it is local, and unmetered on every tier — including the free one."
              >
                <CostCurve />
              </VizPanel>
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.2} className="mt-4">
          <p className="text-xs leading-relaxed text-[#6b7280]">
            The run and the figures above are illustrative — they show how the recovery ladder behaves, not measured
            customer results. Your own numbers appear in the dashboard once your skills start running.
          </p>
        </Reveal>

        <Reveal delay={0.24} className="mt-16">
          <p className="mx-auto max-w-2xl text-center text-base leading-relaxed text-[#9ba3af] sm:text-lg">
            One demonstration replaces the script that breaks, the integration that never ships, and the agent that
            guesses. <span className="text-[#f4f5f7]">Here is what each of those actually costs you.</span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
