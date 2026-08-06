'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

const SKILLS = [
  { label: 'Update the pipeline', x: 130, y: 60 },
  { label: 'Enter the invoices', x: 610, y: 60 },
  { label: 'Onboard the new hire', x: 130, y: 260 },
  { label: 'Run the weekly report', x: 610, y: 260 },
]

const CENTER = { x: 370, y: 160 }

export function WhyAiNeedsIt() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reducedMotion = useReducedMotion()
  const drawn = reducedMotion || inView
  const t = (spec: Record<string, unknown>) => (reducedMotion ? { duration: 0 } : spec)

  return (
    <section id="why-ai-needs-it" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="AI can think. Conxa lets it do."
          sub="Claude can plan, reason, and decide. But websites weren't designed for AI to operate. Conxa hands it ready-made, tested skills — like giving a new employee the playbook instead of making them guess."
        />

        <Reveal className="mt-16">
          <div ref={ref} className="overflow-x-auto rounded-2xl border border-white/6 bg-[#0b0f14] p-6 sm:p-10">
            <svg viewBox="0 0 740 320" className="mx-auto w-full max-w-3xl" role="img" aria-label="An AI agent in the center delegating work to four Conxa skills">
              {SKILLS.map((s) => (
                <motion.line
                  key={s.label}
                  x1={CENTER.x}
                  y1={CENTER.y}
                  x2={s.x}
                  y2={s.y}
                  stroke="#22d3ee"
                  strokeOpacity="0.35"
                  strokeWidth="1.2"
                  initial={{ pathLength: 0 }}
                  animate={drawn ? { pathLength: 1 } : {}}
                  transition={t({ duration: 0.8, delay: 0.3, ease: 'easeOut' })}
                />
              ))}

              <motion.g
                initial={{ opacity: 0, scale: 0.9 }}
                animate={drawn ? { opacity: 1, scale: 1 } : {}}
                transition={t({ duration: 0.5 })}
              >
                <rect x={CENTER.x - 80} y={CENTER.y - 32} width="160" height="64" rx="14" fill="#0f1620" stroke="#22d3ee" strokeOpacity="0.5" />
                <text x={CENTER.x} y={CENTER.y - 4} textAnchor="middle" fill="#f4f5f7" fontSize="15" fontWeight="600">
                  Your AI
                </text>
                <text x={CENTER.x} y={CENTER.y + 16} textAnchor="middle" fill="#9ba3af" fontSize="11">
                  plans and decides
                </text>
              </motion.g>

              {SKILLS.map((s, i) => (
                <motion.g
                  key={s.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={drawn ? { opacity: 1, y: 0 } : {}}
                  transition={t({ duration: 0.5, delay: 0.5 + i * 0.12 })}
                >
                  <rect x={s.x - 92} y={s.y - 24} width="184" height="48" rx="12" fill="#0f1620" stroke="#ffffff" strokeOpacity="0.08" />
                  <circle cx={s.x - 72} cy={s.y} r="3" fill="#5eead4" />
                  <text x={s.x + 8} y={s.y + 4} textAnchor="middle" fill="#9ba3af" fontSize="12.5">
                    {s.label}
                  </text>
                </motion.g>
              ))}
            </svg>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 text-center">
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#9ba3af]">
            Each skill already knows what to do, where to look, and how to check its work. Your AI just decides{' '}
            <span className="text-[#f4f5f7]">when</span> to use it.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
