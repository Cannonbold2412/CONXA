'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

/** Two views of the same screen: a known path, and the same screen without one. */
export function PathVsGuesswork() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reducedMotion = useReducedMotion()
  const play = reducedMotion || inView
  // `initial` stays static so SSR and the first client render agree; reduced
  // motion snaps straight to the drawn state instead of animating there.
  const t = (spec: Record<string, unknown>) => (reducedMotion ? { duration: 0 } : spec)

  const fields = [
    { x: 34, y: 74 },
    { x: 34, y: 118 },
    { x: 34, y: 162 },
  ]

  return (
    <div ref={ref} className="overflow-x-auto rounded-2xl border border-white/6 bg-[#0b0f14] p-6 sm:p-10">
      <svg
        viewBox="0 0 760 260"
        className="mx-auto w-full max-w-3xl"
        role="img"
        aria-label="The same screen twice: on the left a person follows a known path through it; on the right an AI agent has no path and its attempts trail off"
      >
        {/* ── Left: the known path ── */}
        <g>
          <text x="20" y="22" fill="#9ba3af" fontSize="12">
            A person who knows the job
          </text>
          <rect x="20" y="36" width="300" height="200" rx="12" fill="#0f1620" stroke="#ffffff" strokeOpacity="0.08" />
          <line x1="20" y1="58" x2="320" y2="58" stroke="#ffffff" strokeOpacity="0.06" />

          {fields.map((f, i) => (
            <rect key={i} x={f.x} y={f.y} width="200" height="24" rx="6" fill="#0b0f14" stroke="#ffffff" strokeOpacity="0.08" />
          ))}
          <rect x="34" y="200" width="84" height="24" rx="6" fill="#0b0f14" stroke="#22d3ee" strokeOpacity="0.5" />

          <motion.path
            d="M250 86 C 288 92, 288 122, 250 130 C 288 138, 288 166, 250 174 C 200 182, 130 190, 90 206"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={play ? { pathLength: 1 } : {}}
            transition={t({ duration: 1.1, ease: 'easeInOut' })}
          />
          {[
            { x: 250, y: 86 },
            { x: 250, y: 130 },
            { x: 250, y: 174 },
            { x: 90, y: 206 },
          ].map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#22d3ee"
              initial={{ opacity: 0 }}
              animate={play ? { opacity: 1 } : {}}
              transition={t({ duration: 0.3, delay: 0.3 + i * 0.22 })}
            />
          ))}
        </g>

        {/* ── Divider ── */}
        <line x1="380" y1="30" x2="380" y2="240" stroke="#ffffff" strokeOpacity="0.06" strokeDasharray="3 5" />

        {/* ── Right: no path ── */}
        <g>
          <text x="440" y="22" fill="#9ba3af" fontSize="12">
            An AI agent, first time, every time
          </text>
          <rect x="440" y="36" width="300" height="200" rx="12" fill="#0f1620" stroke="#ffffff" strokeOpacity="0.08" />
          <line x1="440" y1="58" x2="740" y2="58" stroke="#ffffff" strokeOpacity="0.06" />

          {fields.map((f, i) => (
            <rect
              key={i}
              x={f.x + 420}
              y={f.y}
              width="200"
              height="24"
              rx="6"
              fill="#0b0f14"
              stroke="#ffffff"
              strokeOpacity="0.09"
              strokeDasharray="4 4"
            />
          ))}
          <rect x="454" y="200" width="84" height="24" rx="6" fill="#0b0f14" stroke="#ffffff" strokeOpacity="0.09" strokeDasharray="4 4" />

          {/* The agent, hovering outside the screen with nothing to follow */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={play ? { opacity: 1 } : {}}
            transition={t({ duration: 0.4, delay: 0.8 })}
          >
            <rect x="686" y="118" width="26" height="26" rx="7" fill="#0b0f14" stroke="#6b7280" strokeWidth="1.2" />
            <text x="699" y="136" textAnchor="middle" fill="#6b7280" fontSize="14">
              ?
            </text>
          </motion.g>

          {/* Probes that reach in and trail off into nothing */}
          {[
            'M688 124 C 650 108, 620 92, 596 86',
            'M686 131 C 646 134, 618 130, 592 130',
            'M688 138 C 652 156, 622 172, 598 176',
          ].map((d, i) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="#6b7280"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeDasharray="4 6"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={play ? { pathLength: 1, opacity: 1 } : {}}
              transition={t({ duration: 0.7, delay: 1 + i * 0.2, ease: 'easeOut' })}
            />
          ))}
          {[
            { x: 596, y: 86 },
            { x: 592, y: 130 },
            { x: 598, y: 176 },
          ].map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.2"
              fill="none"
              stroke="#6b7280"
              strokeWidth="1.2"
              initial={{ opacity: 0 }}
              animate={play ? { opacity: 1 } : {}}
              transition={t({ duration: 0.4, delay: 1.5 + i * 0.2 })}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
