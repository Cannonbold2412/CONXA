'use client'

import { arc } from 'd3-shape'

const RADIUS = 74
const THICKNESS = 10
const SWEEP = Math.PI * 1.5 // three-quarter dial, opening at the bottom

function toneFor(score: number) {
  if (score >= 90) return { color: 'var(--status-ok)', text: 'text-emerald-300' }
  if (score >= 75) return { color: 'var(--tier-4)', text: 'text-cyan-300' }
  if (score >= 60) return { color: 'var(--status-warn)', text: 'text-amber-300' }
  return { color: 'var(--status-error)', text: 'text-red-300' }
}

/**
 * Platform health as a single dial.
 *
 * The arc is the headline; the factor list beside it is what makes the number usable.
 * A score with no visible decomposition is a number an operator can watch move and never
 * act on, which is why `score` is rendered alongside its factors rather than alone.
 */
export function HealthArc({ score, grade }: { score: number | null; grade: string }) {
  const size = (RADIUS + THICKNESS) * 2
  const centre = size / 2
  const start = -SWEEP / 2
  const value = score ?? 0
  const tone = toneFor(value)

  const build = arc<{ from: number; to: number }>()
    .innerRadius(RADIUS - THICKNESS)
    .outerRadius(RADIUS)
    .cornerRadius(THICKNESS / 2)
    .startAngle((d) => d.from)
    .endAngle((d) => d.to)

  const track = build({ from: start, to: start + SWEEP }) ?? undefined
  const fill = score === null ? undefined : build({ from: start, to: start + SWEEP * (value / 100) }) ?? undefined

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={score === null ? `Health score unavailable: ${grade}` : `Health score ${value} out of 100: ${grade}`}
      >
        <g transform={`translate(${centre}, ${centre})`}>
          <path d={track} fill="rgba(255,255,255,0.06)" />
          {fill ? (
            <path
              d={fill}
              fill={tone.color}
              className="motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out"
            />
          ) : null}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score === null ? (
          <span className="text-sm font-medium text-zinc-500">No data</span>
        ) : (
          <>
            <span className={`text-4xl font-semibold tabular-nums ${tone.text}`}>{value}</span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{grade}</span>
          </>
        )}
      </div>
    </div>
  )
}
