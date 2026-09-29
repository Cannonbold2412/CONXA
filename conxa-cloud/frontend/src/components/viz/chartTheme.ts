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

/** Tier A resolves without any model call — the platform's zero-cost band. */
export const ZERO_TOKEN_TIERS = new Set(['Tier A'])

export const STATUS_COLORS = {
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  error: 'var(--status-error)',
  idle: 'var(--chart-5)',
} as const

/**
 * Neutral ink for data that is fine. Colour is reserved for what needs attention, so a
 * healthy dashboard reads calm and the one red bar is impossible to miss. Steps differ in
 * lightness, so they stay distinguishable without relying on hue.
 */
export const INK = {
  strong: 'rgba(244,245,247,0.8)',
  mid: 'rgba(244,245,247,0.5)',
  soft: 'rgba(244,245,247,0.22)',
  track: 'rgba(255,255,255,0.05)',
} as const

/** Map 0..1 run volume onto neutral ink opacity. Out-of-range input clamps. */
export function volumeInk(t: number): string {
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0
  return `rgba(244,245,247,${(0.06 + clamped * 0.5).toFixed(2)})`
}

/** The three recovery outcomes, used wherever a repair is split by how it ended. */
export const RECOVERY_COLORS = {
  free: INK.strong,
  agent: 'var(--tier-4)',
  failed: STATUS_COLORS.error,
} as const

/** Keyed by `narrative.ts::workflowStatus`. */
export const WORKFLOW_STATUS = {
  failing: { color: STATUS_COLORS.error, text: 'text-red-300', label: 'Failing' },
  slipping: { color: STATUS_COLORS.warn, text: 'text-amber-300', label: 'Slipping' },
  healthy: { color: INK.mid, text: 'text-zinc-400', label: 'Healthy' },
} as const

/** Recessive chrome — grid and axis lines must never compete with the data. */
export const GRID_LINE = 'rgba(255,255,255,0.055)'
/** 11px matches the dashboard's meta-text size; 10px numerals in zinc-500 on a
 *  near-black surface are legible only at close range. */
export const AXIS_TEXT = 'fill-zinc-500 text-[11px] tabular-nums'

/** 2px of surface between adjacent fills keeps stacked bands legible without borders. */
export const MARK_GAP = 2
export const BAR_RADIUS = 4
