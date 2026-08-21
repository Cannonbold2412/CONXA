import { useQuery } from '@tanstack/react-query'
import { PencilLine, Users, Monitor, Zap, type LucideIcon } from 'lucide-react'
import { fetchEntitlements, type EntitlementMeter, type EntitlementMeterKey } from '@/api/usageApi'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const LABELS: Record<EntitlementMeterKey, string> = {
  seats: 'Seats',
  machines: 'Machines',
  compile_credits: 'Compile credits',
  human_edit_tokens: 'Human Edit pool',
}

const ICONS: Record<EntitlementMeterKey, LucideIcon> = {
  seats: Users,
  machines: Monitor,
  compile_credits: Zap,
  human_edit_tokens: PencilLine,
}

const DEFAULT_METERS: EntitlementMeterKey[] = ['seats', 'machines', 'compile_credits', 'human_edit_tokens']

function formatCount(value: number | null | undefined, key: EntitlementMeterKey) {
  if (value == null) return 'Unlimited'
  if (key === 'human_edit_tokens' && value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return new Intl.NumberFormat().format(value)
}

function meterText(meter: EntitlementMeter | undefined, key: EntitlementMeterKey) {
  if (!meter) return 'Unavailable'
  if (meter.unlimited) return `${formatCount(meter.used, key)} used`
  return `${formatCount(meter.used, key)} of ${formatCount(meter.limit, key)}`
}

/** Percentage of the allowance consumed. 0 for unlimited/unmetered. */
function usedPct(meter: EntitlementMeter) {
  if (meter.unlimited || !meter.limit) return 0
  return Math.min(100, Math.round(((meter.used ?? 0) / meter.limit) * 100))
}

/** Clay is reserved for the current primary action (DESIGN.md — The One Accent
 * Rule), so a usage bar never uses it: neutral while healthy, then the status
 * amber/red vocabulary once the balance actually needs attention. */
function barColor(pct: number) {
  if (pct >= 90) return 'bg-status-error'
  if (pct >= 75) return 'bg-status-warn'
  return 'bg-zinc-400'
}

function formatResetDate(resetAt: string | undefined) {
  if (!resetAt) return null
  const d = new Date(resetAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * Compact toolbar pill for a single entitlement meter — icon + label +
 * used/limit, with a thin usage bar once the meter is actually metered, and
 * full detail on hover. Sits in a page toolbar; must render inside a
 * TooltipProvider. Renders nothing if the meter is unavailable.
 */
export function MeterBadge({ meterKey, className }: { meterKey: EntitlementMeterKey; className?: string }) {
  const key = meterKey
  const Icon = ICONS[key]
  const usageQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })

  if (usageQ.isLoading) {
    return <div className={cn('hidden h-8 w-36 animate-pulse rounded-md border border-white/8 bg-white/[0.03] sm:block', className)} />
  }

  const meter = usageQ.data?.meters?.[key]
  if (!meter || usageQ.isError || usageQ.data?.entitlements_unavailable) return null

  const used = meter.used ?? 0
  const unlimited = meter.unlimited || meter.limit == null
  const pct = usedPct(meter)
  const valueText = unlimited ? 'Unlimited' : `${formatCount(meter.remaining, key)} left`
  const detailText = unlimited ? `${formatCount(used, key)} used` : `${formatCount(used, key)} of ${formatCount(meter.limit, key)} used`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-label={`${LABELS[key]}: ${valueText}`}
          className={cn(
            'hidden h-8 cursor-default items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 sm:flex',
            className,
          )}
        >
          <Icon className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
          <span className="text-[11px] font-medium text-zinc-500">{LABELS[key]}</span>
          <span className={cn('text-[11px] font-semibold tabular-nums', pct >= 90 && !unlimited ? 'text-status-error' : 'text-zinc-200')}>
            {valueText}
          </span>
          {!unlimited && (
            <span className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
              <span className={cn('block h-full rounded-full', barColor(pct))} style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <p className="font-medium text-zinc-100">{LABELS[key]}</p>
          <p className="text-zinc-300">{detailText}</p>
          {usageQ.data?.reset_at || usageQ.data?.plan ? (
            <p className="text-zinc-500">
              {[formatResetDate(usageQ.data?.reset_at) ? `Resets ${formatResetDate(usageQ.data?.reset_at)}` : null, usageQ.data?.plan ? `${usageQ.data.plan} plan` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The Compile + Human Edit pair, shown in the toolbar of the Workflows and
 * Group pages. These are the two metered resources the product bills on, so
 * they travel together and always in this order.
 */
export function UsageCards({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <MeterBadge meterKey="compile_credits" />
      <MeterBadge meterKey="human_edit_tokens" />
    </div>
  )
}

/** Back-compat wrapper — the Human Edit pool badge used across the editor toolbar. */
export function HumanEditPoolBadge({ className }: { className?: string }) {
  return <MeterBadge meterKey="human_edit_tokens" className={className} />
}

export function EntitlementMeters({
  meters = DEFAULT_METERS,
  className,
  compact = false,
}: {
  meters?: EntitlementMeterKey[]
  className?: string
  compact?: boolean
}) {
  const usageQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })

  if (usageQ.isLoading) {
    return (
      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', className)}>
        {meters.map((key) => (
          <div key={key} className="h-20 animate-pulse rounded-lg border border-white/8 bg-white/[0.03]" />
        ))}
      </div>
    )
  }

  const data = usageQ.data
  if (usageQ.isError || data?.entitlements_unavailable) {
    return (
      <div className={cn('rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200', className)}>
        {data?.error?.message || 'Cloud entitlement meters are unavailable.'}
      </div>
    )
  }

  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {meters.map((key) => {
        const meter = data?.meters?.[key]
        const remaining = meter?.unlimited ? 'Unlimited' : formatCount(meter?.remaining, key)
        return (
          <div key={key} className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[0.6875rem] font-medium text-zinc-400">{LABELS[key]}</p>
            <p className="mt-1 text-sm font-medium text-white">{meterText(meter, key)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{remaining} remaining</p>
          </div>
        )
      })}
    </div>
  )
}
