'use client'

import { useMemo, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { ChartTooltip, TooltipRow, useChartWidth, type TooltipState } from './ChartFrame'
import { AXIS_TEXT, BAR_RADIUS, GRID_LINE, MARK_GAP, STATUS_COLORS } from './chartTheme'

export type TrendBucket = {
  bucket: string
  at: number
  executions: number
  successful: number
  failed: number
  recovered: number
  success_rate: number | null
}

const HEIGHT = 190
const PAD_LEFT = 34
const PAD_BOTTOM = 20
const PAD_TOP = 8

/**
 * Execution volume over time, split by outcome.
 *
 * Only `successful` and `failed` are stacked — they are disjoint and sum to the completed
 * runs. `recovered` is NOT a third band: a self-healed run is also a successful one, so
 * stacking it would count the same execution twice and inflate the bar. It appears in the
 * tooltip as a stated subset instead.
 *
 * There is no second y-axis for success rate. Two scales on one plot is the single most
 * misread chart form; the rate lives in the KPI strip above, on its own.
 */
export function TrendChart({
  buckets,
  granularity,
}: {
  buckets: TrendBucket[]
  granularity: 'hour' | 'day'
}) {
  const { ref, width } = useChartWidth<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const plotWidth = Math.max(0, width - PAD_LEFT)
  const plotHeight = HEIGHT - PAD_BOTTOM - PAD_TOP

  const maxValue = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.successful + b.failed)),
    [buckets],
  )

  const y = useMemo(
    () => scaleLinear().domain([0, maxValue]).nice(4).range([plotHeight, 0]),
    [maxValue, plotHeight],
  )

  const ticks = y.ticks(3)
  const slot = buckets.length ? plotWidth / buckets.length : 0
  // Keep a visible gutter between bars without letting them vanish at 90-day density.
  const barWidth = Math.max(2, Math.min(26, slot - (slot > 8 ? 4 : 1)))

  const label = (bucket: TrendBucket) => {
    const date = new Date(bucket.at)
    return granularity === 'hour'
      ? date.toLocaleTimeString([], { hour: 'numeric' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Executions over time by outcome">
          <g transform={`translate(0, ${PAD_TOP})`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD_LEFT} x2={width} y1={y(tick)} y2={y(tick)} stroke={GRID_LINE} />
                <text x={PAD_LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className={AXIS_TEXT}>
                  {tick}
                </text>
              </g>
            ))}

            {buckets.map((bucket, index) => {
              const completed = bucket.successful + bucket.failed
              const x = PAD_LEFT + index * slot + (slot - barWidth) / 2
              const okHeight = completed ? (bucket.successful / maxValue) * plotHeight : 0
              const failHeight = completed ? (bucket.failed / maxValue) * plotHeight : 0
              const isActive = activeIndex === index

              return (
                <g key={bucket.bucket}>
                  {bucket.failed > 0 ? (
                    <rect
                      x={x}
                      y={y(completed)}
                      width={barWidth}
                      height={Math.max(1, failHeight - (bucket.successful > 0 ? MARK_GAP : 0))}
                      rx={Math.min(BAR_RADIUS, barWidth / 2)}
                      fill={STATUS_COLORS.error}
                      opacity={isActive || activeIndex === null ? 1 : 0.45}
                    />
                  ) : null}
                  {bucket.successful > 0 ? (
                    <rect
                      x={x}
                      y={y(bucket.successful)}
                      width={barWidth}
                      height={Math.max(1, okHeight)}
                      rx={Math.min(BAR_RADIUS, barWidth / 2)}
                      fill={STATUS_COLORS.ok}
                      opacity={isActive || activeIndex === null ? 1 : 0.45}
                    />
                  ) : null}
                  {completed === 0 ? (
                    <rect x={x} y={plotHeight - 2} width={barWidth} height={2} rx={1} fill="rgba(255,255,255,0.09)" />
                  ) : null}

                  {/* Full-column hit target: a 2px bar is not a usable pointer target. */}
                  <rect
                    x={PAD_LEFT + index * slot}
                    y={-PAD_TOP}
                    width={Math.max(slot, 1)}
                    height={HEIGHT}
                    fill="transparent"
                    onMouseEnter={() => {
                      setActiveIndex(index)
                      setTooltip({
                        x: PAD_LEFT + index * slot + slot / 2,
                        y: HEIGHT / 2,
                        content: (
                          <div className="space-y-1">
                            <p className="mb-1.5 font-medium text-zinc-100">{label(bucket)}</p>
                            <TooltipRow color={STATUS_COLORS.ok} label="Succeeded" value={bucket.successful} />
                            <TooltipRow color={STATUS_COLORS.error} label="Failed" value={bucket.failed} />
                            <TooltipRow
                              color="var(--tier-4)"
                              label="of which self-healed"
                              value={bucket.recovered}
                            />
                            {bucket.success_rate !== null ? (
                              <TooltipRow label="Success rate" value={`${bucket.success_rate}%`} />
                            ) : null}
                          </div>
                        ),
                      })
                    }}
                    onMouseLeave={() => {
                      setActiveIndex(null)
                      setTooltip(null)
                    }}
                  />
                </g>
              )
            })}

            {/* First and last ticks only — a label under every bar is unreadable at 30d+. */}
            {buckets.length > 0 ? (
              <>
                <text x={PAD_LEFT} y={plotHeight + 14} className={AXIS_TEXT}>
                  {label(buckets[0])}
                </text>
                <text x={width} y={plotHeight + 14} textAnchor="end" className={AXIS_TEXT}>
                  {label(buckets[buckets.length - 1])}
                </text>
              </>
            ) : null}
          </g>
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      <ChartTooltip state={tooltip} width={width} />
    </div>
  )
}
