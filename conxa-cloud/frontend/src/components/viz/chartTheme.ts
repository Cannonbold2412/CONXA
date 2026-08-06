/**
 * Shared chart vocabulary.
 *
 * Colour is assigned by the job it does, never by series order alone:
 *  - categorical  → identity (which workflow), fixed order, never cycled
 *  - sequential   → magnitude (recovery tier, cell density), one hue, light→dark
 *  - status       → state (ok / warn / error), reserved, never reused as a series
 *
 * Values live in `src/index.css` as CSS variables so a theme change is one file.
 * The categorical set is capped at four because six hues do not survive the
 * all-pairs colour-vision check on this surface — a fifth series folds into
 * "Other" rather than inventing a hue nobody can distinguish.
 */

export const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
] as const

export const OTHER_COLOR = 'var(--chart-5)'

export const MAX_SERIES = CATEGORICAL.length

/** Identity colour for series `index`. Anything past the 4th slot is "Other". */
export function seriesColor(index: number): string {
  return index < MAX_SERIES ? CATEGORICAL[index] : OTHER_COLOR
}

export const TIER_COLORS: Record<string, string> = {
  'Tier 1': 'var(--tier-1)',
  'Tier 2': 'var(--tier-2)',
  'Tier 3': 'var(--tier-3)',
  'Tier 4': 'var(--tier-4)',
}

export const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'] as const

/** Tier 1 and 2 resolve without any model call — the platform's zero-cost band. */
export const ZERO_TOKEN_TIERS = new Set(['Tier 1', 'Tier 2'])

export function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? OTHER_COLOR
}

export const STATUS_COLORS = {
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  error: 'var(--status-error)',
  idle: 'var(--chart-5)',
} as const

const HEAT_STEPS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

/** Map a 0..1 intensity onto the sequential heat ramp. Out-of-range input clamps. */
export function heatColor(t: number): string {
  if (!Number.isFinite(t)) return HEAT_STEPS[0]
  const clamped = Math.max(0, Math.min(1, t))
  return HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.round(clamped * (HEAT_STEPS.length - 1)))]
}

export const HEAT_LEGEND = HEAT_STEPS

/** Recessive chrome — grid and axis lines must never compete with the data. */
export const AXIS_LINE = 'rgba(255,255,255,0.10)'
export const GRID_LINE = 'rgba(255,255,255,0.055)'
/** 11px matches the dashboard's meta-text size; 10px numerals in zinc-500 on a
 *  near-black surface are legible only at close range. */
export const AXIS_TEXT = 'fill-zinc-500 text-[11px] tabular-nums'

/** 2px of surface between adjacent fills keeps stacked bands legible without borders. */
export const MARK_GAP = 2
export const BAR_RADIUS = 4
