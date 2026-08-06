'use client'

import { useId } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'

/**
 * Shape-only trend for a KPI. No axes, no labels, no tooltip — it sits beside a number
 * that already states the value, so its whole job is to say "rising", "flat", or "spiky".
 *
 * Deliberately not interactive: the KPI strip has five of these in a row, and five hover
 * targets competing with the drill-down link underneath is noise, not affordance.
 */
export function Sparkline({
  values,
  width = 88,
  height = 26,
  color = 'var(--chart-1)',
  className,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}) {
  const gradientId = useId()
  const points = values.filter((v) => Number.isFinite(v))

  // One point can't describe a trend, and an empty series would collapse the scale.
  if (points.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden role="presentation">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  // A flat series has a zero-height domain; centre it rather than dividing by zero.
  const domain: [number, number] = min === max ? [min - 1, max + 1] : [min, max]

  const x = scaleLinear().domain([0, points.length - 1]).range([1, width - 1])
  const y = scaleLinear().domain(domain).range([height - 2, 2])

  const linePath = line<number>()
    .x((_, i) => x(i))
    .y((d) => y(d))
    .curve(curveMonotoneX)(points)

  const areaPath = area<number>()
    .x((_, i) => x(i))
    .y0(height)
    .y1((d) => y(d))
    .curve(curveMonotoneX)(points)

  return (
    <svg width={width} height={height} className={className} aria-hidden role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      {linePath ? (
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={2.5} fill={color} />
    </svg>
  )
}
