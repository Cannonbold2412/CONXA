'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from 'framer-motion'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'
import { ShotFrame } from '../primitives/ShotFrame'

/** Fill `shot.src` in as real product screenshots land in public/marketing/screenshots/. */
const STEPS = [
  {
    n: '01',
    title: 'Show it once',
    body: 'A person does the job in a real browser — clicking, typing, navigating like any workday. Conxa records the whole run.',
    shot: {
      src: '/marketing/screenshots/shot_recording.png',
      alt: 'A real browser session being recorded — the person works through the app as they normally would',
      label: 'Recording a real browser session',
    },
  },
  {
    n: '02',
    title: 'Conxa learns what matters',
    body: "Not just where you clicked — what each step means. The button's name, its role on the page, where it sits, how it looks. If one of those changes later, the others still find it.",
    shot: {
      src: '/marketing/screenshots/shot_workflow.png',
      alt: 'The compiled workflow: each recorded step listed with the element it targets',
      label: 'Build Studio — the learned workflow',
    },
  },
  {
    n: '03',
    title: 'It becomes a skill',
    body: 'The workflow is packaged into a versioned skill — a capability you publish once and your customers or teams install anywhere.',
    shot: {
      src: '/marketing/screenshots/shot_publish.png',
      alt: 'Publishing a versioned skill package for customers to install',
      label: 'Build Studio — publishing a version',
    },
  },
  {
    n: '04',
    title: 'Your AI runs it',
    body: 'Ask in plain language. Claude runs the skill on your machine, step by step, checking its work as it goes. When a screen changes, Conxa finds its way — usually with no AI cost at all. The rare hard case gets flagged for a quick assisted fix.',
    shot: {
      src: '/marketing/screenshots/shot_execution.png',
      alt: 'Claude running the skill from a plain-language request, driving the browser below it',
      label: 'Claude Desktop — running the skill',
    },
  },
]

function useIsWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return wide
}

function StepText({ step, active }: { step: (typeof STEPS)[number]; active: boolean }) {
  return (
    <div>
      <span className={active ? 'text-sm font-medium text-[#22d3ee]' : 'text-sm font-medium text-[#6b7280]'}>{step.n}</span>
      <h3 className={`mt-3 text-2xl font-semibold tracking-tight ${active ? 'text-[#f4f5f7]' : 'text-[#6b7280]'}`}>
        {step.title}
      </h3>
      <p className={`mt-4 text-base leading-relaxed ${active ? 'text-[#9ba3af]' : 'text-[#6b7280]/70'}`}>{step.body}</p>
    </div>
  )
}

/** Stacked, always-visible version — mobile and reduced-motion. */
function StaticSteps() {
  return (
    <div className="mt-20 flex flex-col gap-24">
      {STEPS.map((step, i) => (
        <div
          key={step.n}
          className={`grid items-center gap-10 lg:grid-cols-[minmax(0,340px)_1fr] ${
            i % 2 === 1 ? 'lg:grid-cols-[1fr_minmax(0,340px)] lg:[&>*:first-child]:order-2' : ''
          }`}
        >
          <Reveal direction={i % 2 === 1 ? 'right' : 'left'}>
            <div className="max-w-md">
              <StepText step={step} active />
            </div>
          </Reveal>
          <Reveal direction={i % 2 === 1 ? 'left' : 'right'} delay={0.1}>
            <ShotFrame src={step.shot.src || undefined} alt={step.shot.alt} label={step.shot.label} />
          </Reveal>
        </div>
      ))}
    </div>
  )
}

/** Scroll-scrubbed version — one idea revealed at a time as the camera holds still. */
function ScrubbedSteps() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length)))
    setActive(next)
  })

  return (
    <div ref={ref} className="relative mt-16" style={{ height: `${STEPS.length * 100}vh` }}>
      <div className="sticky top-0 flex h-screen items-center">
        {/* Text stays narrow so the screenshot gets the width it needs to stay readable */}
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,340px)_1fr]">
          {/* Step copy — active one lit, the rest recede */}
          <div className="relative h-64">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.n}
                className="absolute inset-0 max-w-md"
                initial={false}
                animate={{ opacity: i === active ? 1 : 0, y: i === active ? 0 : 12 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                aria-hidden={i !== active}
              >
                <StepText step={step} active />
              </motion.div>
            ))}
          </div>

          {/* Screenshot crossfade */}
          <div className="relative aspect-[16/9]">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.n}
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: i === active ? 1 : 0, scale: i === active ? 1 : 0.98 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                aria-hidden={i !== active}
              >
                <ShotFrame src={step.shot.src || undefined} alt={step.shot.alt} label={step.shot.label} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Progress rail */}
        <div className="absolute -left-10 top-1/2 hidden -translate-y-1/2 flex-col gap-2 xl:flex">
          {STEPS.map((step, i) => (
            <span
              key={step.n}
              className={`h-6 w-0.5 rounded-full transition-colors duration-300 ${i === active ? 'bg-[#22d3ee]' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function HowItWorks() {
  const wide = useIsWide()
  const reducedMotion = useReducedMotion()
  const scrub = wide && !reducedMotion

  return (
    <section id="how-it-works" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          headline="Four steps. No code."
          sub="From one human demonstration to a capability your AI can run on demand."
        />
        {scrub ? <ScrubbedSteps /> : <StaticSteps />}
      </div>
    </section>
  )
}
