import { useQuery } from '@tanstack/react-query'
import { fetchEntitlements, type EntitlementMeter, type EntitlementMeterKey } from '@/api/usageApi'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const LABELS: Record<EntitlementMeterKey, string> = {
  seats: 'Seats',
  installer_slots: 'Installer slots',
  compile_credits: 'Compile credits',
  human_edit_tokens: 'Human Edit pool',
}

const DEFAULT_METERS: EntitlementMeterKey[] = ['seats', 'installer_slots', 'compile_credits', 'human_edit_tokens']

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

/**
 * Compact toolbar pill for the Human Edit pool — label + used/limit + a thin
 * clay usage bar, with full detail on hover. Designed to sit in a page toolbar.
 * Must render inside a TooltipProvider. Renders nothing if the meter is unavailable.
 */
export function HumanEditPoolBadge({ className }: { className?: string }) {
  const key: EntitlementMeterKey = 'human_edit_tokens'
  const usageQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })

  if (usageQ.isLoading) {
    return <div className={cn('hidden h-8 w-36 animate-pulse rounded-md border border-white/10 bg-white/[0.03] lg:block', className)} />
  }

  const meter = usageQ.data?.meters?.[key]
  if (!meter || usageQ.isError || usageQ.data?.entitlements_unavailable) return null

  const used = meter.used ?? 0
  const unlimited = meter.unlimited || meter.limit == null
  const pct = unlimited || !meter.limit ? 0 : Math.min(100, Math.round((used / meter.limit) * 100))
  const barColor = pct >= 90 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-brand'
  const valueText = unlimited ? `${formatCount(used, key)} used` : `${formatCount(used, key)} / ${formatCount(meter.limit, key)}`
  const remainingText = unlimited ? 'Unlimited' : `${formatCount(meter.remaining, key)} remaining`

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-label={`Human Edit pool: ${valueText}, ${remainingText}`}
            className={cn(
              'hidden h-8 cursor-default items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 lg:flex',
              className,
            )}
          >
            <span className="text-[11px] font-medium text-zinc-400">Human edit</span>
            <span className="text-[11px] font-semibold tabular-nums text-zinc-200">{valueText}</span>
            {!unlimited && (
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
                <span className={cn('block h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-0.5">
            <p className="font-medium text-zinc-100">Human Edit pool</p>
            <p className="text-zinc-300">
              {valueText}
              {unlimited ? '' : ` · ${remainingText}`}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
      <div className="mx-0.5 hidden h-5 w-px bg-white/10 lg:block" aria-hidden />
    </>
  )
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
            <p className="text-[11px] font-medium uppercase text-zinc-500">{LABELS[key]}</p>
            <p className="mt-1 text-sm font-medium text-white">{meterText(meter, key)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{remaining} remaining</p>
          </div>
        )
      })}
    </div>
  )
}
