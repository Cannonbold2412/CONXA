'use client'

import { motion } from 'framer-motion'
import { GradientMesh } from '../GradientMesh'
import { GridBackground } from '../GridBackground'
import { GlowButton } from '../primitives/GlowButton'
import { ChatPanel } from './ChatPanel'
import { BrowserSim } from './BrowserSim'

/** The four rungs of the ladder, stated without prices — the numbers live in the pricing section. */
const RUNGS = [
  'Prove it on one machine',
  'Run it across your team',
  'Ship it to your own customers',
  'White-label it',
]

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#06080b] px-6 pb-20 pt-32 lg:pt-28">
      <GradientMesh />
      <GridBackground />

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-5 max-w-4xl text-center font-semibold tracking-tight text-balance text-[#f4f5f7]"
        style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5.5rem)', lineHeight: 1.08 }}
      >
        Do the process once. Your AI does it from then on.
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-10 max-w-2xl text-center text-base leading-relaxed text-[#9ba3af] sm:text-lg"
      >
        Conxa records a cross-system process the way your team already runs it, then hands it to Claude and other AI
        agents as a skill they can run reliably — on software nobody has to modify, on your own machines, and it keeps
        working after the screens change.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-8 flex flex-wrap items-center justify-center gap-3"
      >
        <GlowButton href="/sign-up">Start free</GlowButton>
        <GlowButton href="#pricing" variant="ghost">See what it costs →</GlowButton>
      </motion.div>

      {/* The ladder, in one line — the growth story before any price */}
      <motion.ol
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-xs text-[#6b7280] sm:text-sm"
      >
        {RUNGS.map((rung, i) => (
          <li key={rung} className="flex items-center gap-3">
            {i > 0 && <span className="text-[#6b7280]/50" aria-hidden>→</span>}
            <span>{rung}</span>
          </li>
        ))}
      </motion.ol>

      {/* Demo panels */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]"
        style={{ height: 'clamp(380px, 52vh, 580px)' }}
      >
        <ChatPanel />
        <BrowserSim />
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-widest text-[#6b7280]">scroll</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="h-4 w-0.5 rounded-full bg-[#6b7280]/40"
        />
      </motion.div>
    </section>
  )
}
