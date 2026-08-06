'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Measures its container so charts render at real pixel size.
 *
 * The alternative — a fixed viewBox scaled with `width="100%"` — also stretches the
 * axis labels, so tick text ends up a different size on every breakpoint. Measuring
 * costs one ResizeObserver and keeps type at the size it was designed at.
 */
export function useChartWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current))
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

export type TooltipState = { x: number; y: number; content: ReactNode } | null

/**
 * Tooltip layer for a chart. Positioned against the chart box and flipped near the
 * right edge so it never overflows the card it lives in.
 */
export function ChartTooltip({ state, width }: { state: TooltipState; width: number }) {
  if (!state) return null
  const flip = width > 0 && state.x > width - 140
  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-20 min-w-[8rem] rounded-lg border border-white/10',
        'bg-[#0d1117]/95 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-200 shadow-xl backdrop-blur',
      )}
      style={{
        left: state.x,
        top: state.y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      {state.content}
    </div>
  )
}

/** One tooltip row: a colour chip, a label, and a right-aligned value. */
export function TooltipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {color ? (
        <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />
      ) : (
        <span className="size-2 shrink-0" aria-hidden />
      )}
      <span className="text-zinc-400">{label}</span>
      <span className="ml-auto font-medium tabular-nums text-zinc-100">{value}</span>
    </div>
  )
}

/**
 * Shared empty state for a visualization that has no data yet.
 *
 * Says which runtime event produces the data and what to do next — an empty chart that
 * only says "no data" teaches nothing, and this product's data appears only after a
 * customer actually runs something.
 */
export function ChartEmpty({
  icon,
  title,
  hint,
  height = 200,
}: {
  icon?: ReactNode
  title: string
  hint: string
  height?: number
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-6 text-center"
      style={{ minHeight: height }}
    >
      {icon ? <span className="text-zinc-600" aria-hidden>{icon}</span> : null}
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <p className="max-w-xs text-[11px] leading-relaxed text-zinc-600">{hint}</p>
    </div>
  )
}
