import { cn } from '@/lib/utils'

export type SplitSegment = { label: string; value: number; color: string }

/**
 * One whole, split into its parts — status mix, share of runs, recovery outcome.
 *
 * A single proportional bar reads faster than a pie or a Sankey for two to eight parts: every
 * segment shares one baseline, so "most of it" and "a sliver" are obvious at a glance. Each
 * segment's colour must differ in lightness too, not hue alone (see chartTheme.ts).
 */
export function SplitBar({
  segments,
  legend = 'row',
  unit,
  className,
}: {
  segments: SplitSegment[]
  /** `row`: inline legend under the bar. `grid`: legend in columns, for many segments. */
  legend?: 'row' | 'grid'
  /** Appended to each legend value, e.g. "%". */
  unit?: string
  className?: string
}) {
  const parts = segments.filter((s) => s.value > 0)
  const total = parts.reduce((sum, s) => sum + s.value, 0)
  if (!total) return null

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className="flex h-3.5 gap-[3px] overflow-hidden rounded-[4px]"
        role="img"
        aria-label={parts.map((s) => `${s.label}: ${s.value}${unit ?? ''}`).join(', ')}
      >
        {parts.map((s, i) => (
          <span key={i} className="h-full" style={{ flexGrow: s.value, flexBasis: 0, background: s.color }} />
        ))}
      </div>
      <ul
        className={cn(
          'text-sm text-zinc-400',
          legend === 'grid' ? 'grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4' : 'flex flex-wrap gap-x-8 gap-y-2',
        )}
      >
        {parts.map((s, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 truncate">{s.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-zinc-100">
              {s.value.toLocaleString()}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
