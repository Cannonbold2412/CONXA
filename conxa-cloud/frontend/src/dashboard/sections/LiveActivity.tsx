'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchTrackingActivity, type TrackingActivityRow } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { Skeleton } from '@/components/ui/skeleton'
import { tierColor } from '@/components/viz/chartTheme'
import { cn } from '@/lib/utils'
import { fmtDuration, fmtRelative } from '../dashboardData'

const STATUS = {
  ok: { dot: 'bg-emerald-400', label: 'Succeeded' },
  fail: { dot: 'bg-red-400', label: 'Failed' },
  running: { dot: 'bg-cyan-400', label: 'Running' },
} as const

function ActivityRow({ run }: { run: TrackingActivityRow }) {
  const status = STATUS[run.status] ?? STATUS.running
  return (
    <li>
      <Link
        href={`/dashboard/runs/${encodeURIComponent(run.company)}/${encodeURIComponent(run.run_id)}`}
        className={cn(
          'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.045]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70',
        )}
      >
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className={cn('size-2 rounded-full', status.dot)} />
          {run.status === 'running' ? (
            <span className={cn('absolute inset-0 rounded-full motion-safe:animate-ping', status.dot)} />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] text-zinc-200">{run.workflow}</span>
            {run.version ? <span className="shrink-0 text-[11px] text-zinc-600">v{run.version}</span> : null}
          </div>
          <p className="truncate text-[11px] text-zinc-600">
            {status.label}
            {run.failure_code ? ` · ${run.failure_code}` : ''}
            {run.duration_ms > 0 ? ` · ${fmtDuration(run.duration_ms)}` : ''}
          </p>
        </div>

        {run.recovery_tiers.length > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5" title={`Self-healed at ${run.recovery_tiers.join(', ')}`}>
            {run.recovery_tiers.map((tier) => (
              <span key={tier} className="size-1.5 rounded-full" style={{ background: tierColor(tier) }} aria-hidden />
            ))}
          </span>
        ) : null}

        <time className="shrink-0 text-[11px] tabular-nums text-zinc-600" dateTime={new Date(run.at).toISOString()}>
          {fmtRelative(run.at)}
        </time>
      </Link>
    </li>
  )
}

/**
 * What is running right now.
 *
 * Polls on its own 10-second cadence against a lightweight endpoint rather than riding the
 * dashboard's aggregate refresh — re-running the full workspace aggregation every ten
 * seconds to move a list would be an expensive way to look live.
 */
export function LiveActivity({ limit = 12 }: { limit?: number }) {
  const activity = useQuery({
    queryKey: queryKeys.trackingActivity(),
    queryFn: () => fetchTrackingActivity(40),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  if (activity.isPending) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-2 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (activity.isError) {
    return <p className="py-6 text-center text-[11px] text-red-300">Could not load recent activity.</p>
  }

  const runs = (activity.data?.runs ?? []).slice(0, limit)

  if (!runs.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-zinc-400">No executions yet</p>
        <p className="max-w-xs text-[11px] leading-relaxed text-zinc-600">
          Runs appear here the moment a customer&apos;s runtime executes a skill. Publish a skill
          pack and install it to see the first one.
        </p>
      </div>
    )
  }

  return <ul className="space-y-0.5">{runs.map((run) => <ActivityRow key={run.run_id} run={run} />)}</ul>
}
