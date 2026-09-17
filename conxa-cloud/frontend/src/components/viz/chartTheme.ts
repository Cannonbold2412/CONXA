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

const OTHER_COLOR = 'var(--chart-5)'

const TIER_COLORS: Record<string, string> = {
  'Tier A': 'var(--tier-1)',
  'Tier B': 'var(--tier-4)',
}

export const TIER_ORDER = ['Tier A', 'Tier B'] as const

/** Tier A resolves without any model call — the platform's zero-cost band. */
export const ZERO_TOKEN_TIERS = new Set(['Tier A'])

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
export const GRID_LINE = 'rgba(255,255,255,0.055)'
/** 11px matches the dashboard's meta-text size; 10px numerals in zinc-500 on a
 *  near-black surface are legible only at close range. */
export const AXIS_TEXT = 'fill-zinc-500 text-[11px] tabular-nums'

/** 2px of surface between adjacent fills keeps stacked bands legible without borders. */
export const MARK_GAP = 2
export const BAR_RADIUS = 4
