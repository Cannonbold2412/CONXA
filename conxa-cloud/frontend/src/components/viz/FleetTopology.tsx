'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChartTooltip, TooltipRow, useChartWidth, type TooltipState } from './ChartFrame'
import { STATUS_COLORS } from './chartTheme'

export type FleetNode = {
  company: string
  workflow: string
  runs: number
  successRate: number
}

const HEIGHT = 300
const HUB_RADIUS = 26
const MIN_NODE = 9
const MAX_NODE = 26

function healthColor(rate: number): string {
  if (rate >= 95) return STATUS_COLORS.ok
  if (rate >= 85) return STATUS_COLORS.warn
  return STATUS_COLORS.error
}

/**
 * The automation estate at a glance: every skill as a node, sized by volume and coloured
 * by health, hung off its company hub.
 *
 * The layout is deterministic — nodes sorted by name, angles evenly divided — rather than
 * force-directed. A physics simulation reshuffles on every render and every data refresh,
 * so an operator can never learn where anything is; the same skill has to stay in the same
 * place between visits for the picture to be readable at all.
 */
export function FleetTopology({ nodes }: { nodes: FleetNode[] }) {
  const { ref, width } = useChartWidth<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const companies = Array.from(new Set(nodes.map((n) => n.company))).sort()
  const maxRuns = Math.max(1, ...nodes.map((n) => n.runs))

  const centreX = width / 2
  const centreY = HEIGHT / 2
  const orbit = Math.min(centreX, centreY) - MAX_NODE - 26

  // Stable ordering: company first, then skill name. Never by volume — a node that moves
  // when traffic shifts is a node you have to re-find every time you look.
  const ordered = [...nodes].sort(
    (a, b) => a.company.localeCompare(b.company) || a.workflow.localeCompare(b.workflow),
  )

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && ordered.length > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Skills in this workspace, sized by run volume and coloured by success rate">
          {ordered.map((node, index) => {
            const angle = (index / ordered.length) * Math.PI * 2 - Math.PI / 2
            const x = centreX + Math.cos(angle) * orbit
            const y = centreY + Math.sin(angle) * orbit
            return (
              <line
                key={`link-${node.company}-${node.workflow}`}
                x1={centreX}
                y1={centreY}
                x2={x}
                y2={y}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={Math.max(1, (node.runs / maxRuns) * 3)}
              />
            )
          })}

          <circle cx={centreX} cy={centreY} r={HUB_RADIUS} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" />
          <text x={centreX} y={centreY} dy="0.32em" textAnchor="middle" className="fill-zinc-400 text-[11px]">
            {companies.length === 1 ? companies[0].slice(0, 8) : `${companies.length} packs`}
          </text>

          {ordered.map((node, index) => {
            const angle = (index / ordered.length) * Math.PI * 2 - Math.PI / 2
            const x = centreX + Math.cos(angle) * orbit
            const y = centreY + Math.sin(angle) * orbit
            const radius = MIN_NODE + Math.sqrt(node.runs / maxRuns) * (MAX_NODE - MIN_NODE)
            const labelRight = Math.cos(angle) >= 0
            return (
              <g key={`${node.company}-${node.workflow}`}>
                <Link href={`/dashboard/workflows/${encodeURIComponent(node.company)}/${encodeURIComponent(node.workflow)}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={healthColor(node.successRate)}
                    fillOpacity={0.22}
                    stroke={healthColor(node.successRate)}
                    strokeWidth={1.5}
                    className="cursor-pointer motion-safe:transition-[fill-opacity] motion-safe:duration-150 hover:fill-opacity-45"
                    onMouseEnter={() =>
                      setTooltip({
                        x,
                        y,
                        content: (
                          <div className="space-y-1">
                            <p className="mb-1.5 font-medium text-zinc-100">{node.workflow}</p>
                            <TooltipRow label="Runs" value={node.runs} />
                            <TooltipRow
                              color={healthColor(node.successRate)}
                              label="Success rate"
                              value={`${node.successRate}%`}
                            />
                          </div>
                        ),
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                </Link>
                <text
                  x={labelRight ? x + radius + 6 : x - radius - 6}
                  y={y}
                  dy="0.32em"
                  textAnchor={labelRight ? 'start' : 'end'}
                  className="pointer-events-none fill-zinc-500 text-[11px]"
                >
                  {node.workflow.length > 14 ? `${node.workflow.slice(0, 13)}…` : node.workflow}
                </text>
              </g>
            )
          })}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      <ChartTooltip state={tooltip} width={width} />
    </div>
  )
}
