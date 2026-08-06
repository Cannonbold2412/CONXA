'use client'

import { useState } from 'react'
import { ChartTooltip, TooltipRow, useChartWidth, type TooltipState } from './ChartFrame'
import { HEAT_LEGEND, STATUS_COLORS, heatColor } from './chartTheme'

export type HeatCell = {
  weekday: number
  hour: number
  runs: number
  successful: number
  failed: number
  success_rate: number | null
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const GUTTER = 34
const ROW_GAP = 3

/**
 * When does automation actually run, and when does it break?
 *
 * Two channels, deliberately kept separate rather than blended into one colour: cell
 * brightness is volume, and a failure marker is correctness. A single compound scale would
 * make a quiet-but-perfect hour and a busy-but-broken hour hard to tell apart, which is the
 * exact comparison this grid exists to support.
 *
 * Buckets are UTC, matching how the runtime stamps its events.
 */
export function Heatmap({ cells, maxRuns }: { cells: HeatCell[]; maxRuns: number }) {
  const { ref, width } = useChartWidth<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const lookup = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c]))
  const available = Math.max(0, width - GUTTER)
  const cellSize = available > 0 ? Math.max(6, available / 24 - ROW_GAP) : 0
  const height = 7 * (cellSize + ROW_GAP)

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <>
          <svg width={width} height={height + 18} role="img" aria-label="Execution volume and failures by weekday and hour, UTC">
            {DAYS.map((day, weekday) => (
              <g key={day}>
                <text
                  x={0}
                  y={weekday * (cellSize + ROW_GAP) + cellSize / 2}
                  dy="0.32em"
                  className="fill-zinc-600 text-[11px]"
                >
                  {day}
                </text>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = lookup.get(`${weekday}:${hour}`)
                  const runs = cell?.runs ?? 0
                  const x = GUTTER + hour * (cellSize + ROW_GAP)
                  const y = weekday * (cellSize + ROW_GAP)
                  return (
                    <g key={hour}>
                      <rect
                        x={x}
                        y={y}
                        width={cellSize}
                        height={cellSize}
                        rx={3}
                        fill={runs ? heatColor(maxRuns ? runs / maxRuns : 0) : 'transparent'}
                        stroke={runs ? 'none' : 'rgba(255,255,255,0.05)'}
                        onMouseEnter={() =>
                          setTooltip({
                            x: x + cellSize / 2,
                            y: y + cellSize / 2,
                            content: (
                              <div className="space-y-1">
                                <p className="mb-1.5 font-medium text-zinc-100">
                                  {day} {String(hour).padStart(2, '0')}:00 UTC
                                </p>
                                <TooltipRow label="Runs" value={runs} />
                                <TooltipRow color={STATUS_COLORS.error} label="Failed" value={cell?.failed ?? 0} />
                                {cell?.success_rate !== null && cell !== undefined ? (
                                  <TooltipRow label="Success rate" value={`${cell.success_rate}%`} />
                                ) : null}
                              </div>
                            ),
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                      />
                      {cell && cell.failed > 0 ? (
                        <circle
                          cx={x + cellSize - 3.5}
                          cy={y + 3.5}
                          r={2}
                          fill={STATUS_COLORS.error}
                          pointerEvents="none"
                        />
                      ) : null}
                    </g>
                  )
                })}
              </g>
            ))}
            <text x={GUTTER} y={height + 12} className="fill-zinc-600 text-[11px] tabular-nums">00:00</text>
            <text x={width} y={height + 12} textAnchor="end" className="fill-zinc-600 text-[11px] tabular-nums">
              23:00
            </text>
          </svg>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              Fewer runs
              {HEAT_LEGEND.map((step) => (
                <span key={step} className="size-2.5 rounded-[2px]" style={{ background: step }} aria-hidden />
              ))}
              More
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: STATUS_COLORS.error }} aria-hidden />
              Hour contained a failure
            </span>
          </div>
        </>
      ) : (
        <div style={{ height: 180 }} />
      )}
      <ChartTooltip state={tooltip} width={width} />
    </div>
  )
}
