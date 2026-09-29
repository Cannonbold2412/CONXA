/** Track floor: every workflow worth watching sits above it, and a 0–100 track would squash them together. */
export const RATE_FLOOR = 60

const pos = (rate: number) => Math.max(0, Math.min(100, ((rate - RATE_FLOOR) / (100 - RATE_FLOOR)) * 100))

/**
 * Success rate, last period → this period, as two dots on one track.
 *
 * Direction and distance of the move are the story ("slipping" is literally a dot sliding
 * left); a hollow ring is where it was, a filled dot is where it is. Below the floor, both
 * clamp to the left edge — the status label beside it carries the exact number.
 */
export function RateShift({ current, previous, color }: { current: number; previous: number | null; color: string }) {
  const now = pos(current)
  const before = previous === null ? now : pos(previous)
  return (
    <span
      className="relative block h-5 w-full"
      role="img"
      aria-label={
        previous === null
          ? `${current}% success, no earlier period`
          : `${current}% success this period, ${previous}% last period`
      }
    >
      <span className="absolute inset-x-0 top-[9px] h-0.5 rounded-full bg-white/[0.06]" />
      <span
        className="absolute top-[9px] h-0.5"
        style={{ left: `${Math.min(now, before)}%`, width: `${Math.abs(now - before)}%`, background: color }}
      />
      {previous !== null ? (
        <span
          className="absolute top-[5px] -ml-[5px] size-2.5 rounded-full border-[1.5px] border-zinc-500 bg-[#0a0c0f]"
          style={{ left: `${before}%` }}
        />
      ) : null}
      <span className="absolute top-1 -ml-1.5 size-3 rounded-full" style={{ left: `${now}%`, background: color }} />
    </span>
  )
}
