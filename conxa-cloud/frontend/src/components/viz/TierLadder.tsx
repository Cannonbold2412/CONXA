import { INK, RECOVERY_COLORS } from './chartTheme'

export type MethodCount = { type: string; count: number }

/**
 * Recovery methods, grouped by the tier that owns them — mirrors the backend's
 * `tracking.py::_RECOVERY_TIERS`. Order is the runtime's escalation order.
 */
const METHODS = [
  { type: 'Selector', tier: 'Tier A', name: 'Backup ways to find it', how: 'Retried, then tried the other saved ways of locating the element.' },
  { type: 'Text Anchor', tier: 'Tier A', name: 'Match by visible label', how: 'Found the element by its name or label when its position changed.' },
  { type: 'Text Variant', tier: 'Tier B', name: 'Match similar wording', how: 'Matched text that had changed slightly since recording.' },
  { type: 'Vision', tier: 'Tier B', name: 'AI agent', how: 'An AI agent read the page and picked the right element.' },
] as const

function MethodRow({ method, count, max }: { method: (typeof METHODS)[number]; count: number; max: number }) {
  const free = method.tier === 'Tier A'
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-6 gap-y-2 border-b border-white/6 py-4 md:grid-cols-[4rem_minmax(0,20rem)_minmax(0,1fr)_6rem]">
      <span
        className={
          free
            ? 'justify-self-start rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-100'
            : 'justify-self-start rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300'
        }
      >
        {method.tier}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-zinc-100">{method.name}</span>
        <span className="block text-xs text-zinc-400">{method.how}</span>
      </span>
      <span className="col-span-2 h-2 rounded-full md:col-span-1" style={{ background: INK.track }}>
        <span
          className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${max ? (count / max) * 100 : 0}%`, background: free ? RECOVERY_COLORS.free : RECOVERY_COLORS.agent }}
        />
      </span>
      <span className="col-span-2 flex items-baseline justify-between gap-2 md:col-span-1 md:flex-col md:items-end md:gap-0.5">
        <span className="text-sm font-medium tabular-nums text-zinc-100">{count.toLocaleString()}×</span>
        <span className="text-xs text-zinc-400">{free ? 'free' : 'uses AI tokens'}</span>
      </span>
    </li>
  )
}

/**
 * Which repair method is doing the work, split at the A/B boundary.
 *
 * That boundary is the product's economics: Tier A heals locally at zero model cost, Tier B
 * calls a model. The divider between them states the rule a reader would otherwise have to
 * know — Tier B only runs once every free method has missed.
 */
export function TierLadder({ usage }: { usage: MethodCount[] }) {
  const counts = new Map(usage.map((u) => [u.type, u.count]))
  const max = Math.max(0, ...METHODS.map((m) => counts.get(m.type) ?? 0))
  const tierA = METHODS.filter((m) => m.tier === 'Tier A')
  const tierB = METHODS.filter((m) => m.tier === 'Tier B')

  return (
    <div>
      <ul className="border-t border-white/6">
        {tierA.map((m) => (
          <MethodRow key={m.type} method={m} count={counts.get(m.type) ?? 0} max={max} />
        ))}
      </ul>
      <p className="flex items-center gap-2 py-3 text-xs text-zinc-400 md:pl-[5.5rem]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v16M6 14l6 6 6-6" />
        </svg>
        Escalates to Tier B only after every free method has failed
      </p>
      <ul className="border-t border-white/6">
        {tierB.map((m) => (
          <MethodRow key={m.type} method={m} count={counts.get(m.type) ?? 0} max={max} />
        ))}
      </ul>
    </div>
  )
}
