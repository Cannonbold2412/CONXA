'use client'

import { useMemo, useState } from 'react'
import { sankey, sankeyJustify, sankeyLinkHorizontal } from 'd3-sankey'
import { ChartTooltip, TooltipRow, useChartWidth, type TooltipState } from './ChartFrame'
import { STATUS_COLORS, tierColor } from './chartTheme'

export type CascadeNode = { name: string }
export type CascadeLink = { source: number; target: number; value: number }

type LaidOutNode = CascadeNode & {
  x0: number; x1: number; y0: number; y1: number; value: number
}
type LaidOutLink = {
  width: number
  value: number
  source: LaidOutNode
  target: LaidOutNode
}

const HEIGHT = 260

function nodeColor(name: string): string {
  if (name === 'Healed') return STATUS_COLORS.ok
  if (name === 'Failed') return STATUS_COLORS.error
  if (name === 'Entered recovery') return 'var(--chart-5)'
  return tierColor(name)
}

/**
 * Where recovery spends its budget.
 *
 * Only steps that entered recovery are in the flow. The far larger population of steps that
 * resolved on the first try is stated as a number beside the diagram instead — folding it in
 * would compress every interesting band to a hairline.
 *
 * The graph is strictly layered (entry → tiers in order → outcome), which is what keeps it
 * acyclic; a Sankey layout cannot resolve a cycle.
 */
export function RecoverySankey({
  nodes,
  links,
}: {
  nodes: CascadeNode[]
  links: CascadeLink[]
}) {
  const { ref, width } = useChartWidth<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const graph = useMemo(() => {
    if (!width || !links.length) return null
    try {
      const layout = sankey<CascadeNode, CascadeLink>()
        .nodeWidth(11)
        .nodePadding(18)
        .nodeAlign(sankeyJustify)
        .extent([
          [1, 6],
          [Math.max(width - 1, 2), HEIGHT - 6],
        ])
      return layout({
        nodes: nodes.map((n) => ({ ...n })),
        links: links.map((l) => ({ ...l })),
      })
    } catch {
      // A malformed graph (orphan node index, accidental cycle) must not take the page
      // down — the panel falls back to its empty state instead.
      return null
    }
  }, [nodes, links, width])

  if (!links.length) {
    return (
      <p className="flex h-[180px] items-center justify-center text-center text-[11px] leading-relaxed text-zinc-600">
        No step needed recovery in this period.
        <br />
        Every element was found on the first attempt.
      </p>
    )
  }

  return (
    <div ref={ref} className="relative w-full">
      {graph ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Recovery cascade from entry through tiers to outcome">
          <g>
            {(graph.links as unknown as LaidOutLink[]).map((link, index) => {
              const path = sankeyLinkHorizontal()(link as never)
              if (!path) return null
              return (
                <path
                  key={index}
                  d={path}
                  fill="none"
                  stroke={nodeColor(link.source.name)}
                  strokeOpacity={0.22}
                  strokeWidth={Math.max(1, link.width)}
                  className="motion-safe:transition-[stroke-opacity] motion-safe:duration-150 hover:stroke-opacity-50"
                  onMouseEnter={(event) =>
                    setTooltip({
                      x: event.nativeEvent.offsetX,
                      y: event.nativeEvent.offsetY,
                      content: (
                        <div className="space-y-1">
                          <p className="mb-1.5 font-medium text-zinc-100">
                            {link.source.name} → {link.target.name}
                          </p>
                          <TooltipRow color={nodeColor(link.source.name)} label="Steps" value={link.value} />
                        </div>
                      ),
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })}

            {(graph.nodes as unknown as LaidOutNode[]).map((node) => {
              const height = Math.max(2, node.y1 - node.y0)
              const labelOnLeft = node.x0 > width / 2
              return (
                <g key={node.name}>
                  <rect
                    x={node.x0}
                    y={node.y0}
                    width={Math.max(2, node.x1 - node.x0)}
                    height={height}
                    rx={3}
                    fill={nodeColor(node.name)}
                  />
                  <text
                    x={labelOnLeft ? node.x0 - 8 : node.x1 + 8}
                    y={node.y0 + height / 2}
                    dy="0.32em"
                    textAnchor={labelOnLeft ? 'end' : 'start'}
                    className="fill-zinc-400 text-[11px]"
                  >
                    {node.name}
                    <tspan className="fill-zinc-600"> {node.value}</tspan>
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      <ChartTooltip state={tooltip} width={width} />
    </div>
  )
}
