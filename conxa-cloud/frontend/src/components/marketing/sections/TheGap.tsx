'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { PathVsGuesswork } from '../diagrams/PathVsGuesswork'

const HUMAN_POINTS = [
  'Reads the screen and knows what every button means',
  'Knows the next step without thinking about it',
  'Recovers instantly when something looks different',
]

const AI_POINTS = [
  'Sees the screen for the first time, every time',
  'Guesses its way through menus and forms',
  'One layout change and the whole task falls apart',
]

const SKILLS = [
  { label: 'Onboard the customer', x: 130, y: 60 },
  { label: 'Enter the invoices', x: 610, y: 60 },
  { label: 'Set up the new hire', x: 130, y: 260 },
  { label: 'Run the weekly report', x: 610, y: 260 },
]

const CENTER = { x: 370, y: 160 }

/** The delegation model: the agent chooses when, the compiled skill knows how. */
function Delegation() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reducedMotion = useReducedMotion()
  const drawn = reducedMotion || inView
  const t = (spec: Record<string, unknown>) => (reducedMotion ? { duration: 0 } : spec)

  return (
    <div ref={ref} className="overflow-x-auto rounded-2xl border border-white/6 bg-[#0b0f14] p-6 sm:p-10">
      <svg
        viewBox="0 0 740 320"
        className="mx-auto w-full max-w-3xl"
        role="img"
        aria-label="An AI agent in the centre delegating work to four compiled Conxa skills"
      >
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
            decides what and when
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
  )
}

export function TheGap() {
  return (
    <section id="the-gap" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="The work that crosses five systems is the work nobody automated."
          sub="Too small to fund an integration. Too important to get wrong. Too manual to scale. Your team knows the way through it by heart — an AI agent opening those same screens cold, on every single run, gets lost and costs more than the work is worth."
        />

        <Reveal className="mt-16">
          <PathVsGuesswork />
        </Reveal>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Reveal direction="left">
            <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0b0f14] p-8">
              <h3 className="mb-6 text-lg font-semibold text-white">Your team, on your software</h3>
              <ul className="flex flex-col gap-4">
                {HUMAN_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-[#9ba3af]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#5eead4]" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal direction="right" delay={0.1}>
            <div className="flex h-full flex-col rounded-2xl border border-white/6 bg-[#0b0f14] p-8">
              <h3 className="mb-6 text-lg font-semibold text-white">An AI agent, starting cold</h3>
              <ul className="flex flex-col gap-4">
                {AI_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-[#9ba3af]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#6b7280]" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="mt-20">
          <h3 className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight text-[#f4f5f7] sm:text-3xl">
            The fix isn&apos;t smarter guessing. It&apos;s handing AI the route your team already knows.
          </h3>
        </Reveal>

        <Reveal delay={0.1} className="mt-10">
          <Delegation />
        </Reveal>

        <Reveal delay={0.1} className="mt-10 text-center">
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#9ba3af]">
            Each skill already knows what to do, where to look, and how to check its own work. Your AI only has to
            decide <span className="text-[#f4f5f7]">when</span> to use it.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
