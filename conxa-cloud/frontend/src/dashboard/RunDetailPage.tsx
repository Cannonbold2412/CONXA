'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ListOrdered } from 'lucide-react'
import { fetchTrackingRun } from '@/api/pluginApi'
import { queryKeys } from '@/lib/queryKeys'
import { ExecutionFlow } from '@/components/viz/ExecutionFlow'
import { cn } from '@/lib/utils'
import { DashboardError, DashboardPageBody, DashboardSkeleton } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtDuration, fmtNumber, fmtRelative } from './dashboardData'
import { useRange } from './useRange'

const STATUS_LABEL = { ok: 'Succeeded', fail: 'Failed', running: 'Running' } as const

export function RunDetailPage({ company, runId }: { company: string; runId: string }) {
  const [range] = useRange()
  const run = useQuery({
    queryKey: queryKeys.trackingRun(company, runId),
    queryFn: () => fetchTrackingRun(company, runId),
    staleTime: 30_000,
  })

  if (run.isPending) return <DashboardSkeleton />
  if (run.isError || !run.data) return <DashboardError onRetry={() => run.refetch()} />

  const data = run.data
  const summary = data.summary
  const status = STATUS_LABEL[summary?.status ?? 'running'] ?? 'Running'

  return (
    <DashboardPageBody>
      <div className="min-w-0">
        <Link
          href={`/dashboard/workflows/${encodeURIComponent(company)}/${encodeURIComponent(data.plugin_id)}?range=${range}`}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="size-3" aria-hidden />
          {data.plugin_id}
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-zinc-100">
          <span className="truncate">{data.plugin_id}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              summary?.status === 'ok'
                ? 'bg-emerald-500/10 text-emerald-300'
                : summary?.status === 'fail'
                  ? 'bg-red-500/10 text-red-300'
                  : 'bg-cyan-500/10 text-cyan-300',
            )}
          >
            {status}
          </span>
        </h1>
        <p className="truncate text-[11px] text-zinc-600">
          {company} · v{data.plugin_ver} · runtime {data.runtime_ver} ·{' '}
          {summary?.started_at ? fmtRelative(summary.started_at) : 'unknown time'}
        </p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] lg:grid-cols-4 lg:divide-y-0">
        {[
          ['Duration', summary?.duration_ms ? fmtDuration(summary.duration_ms) : '—'],
          ['Steps', fmtNumber(summary?.total_steps ?? data.steps.length)],
          ['Steps self-healed', fmtNumber(summary?.recovered_steps ?? 0)],
          ['Failure reason', summary?.failure_code ?? '—'],
        ].map(([title, value]) => (
          <div key={String(title)} className="min-w-0 px-4 py-3.5">
            <p className="truncate text-[11px] font-medium text-zinc-500">{title}</p>
            <p className="mt-1.5 truncate text-lg font-semibold tabular-nums text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      <SectionCard
        question="What happened, step by step?"
        context="Each step's outcome and the recovery tier that resolved it, in execution order."
        icon={<ListOrdered className="size-4" />}
      >
        <ExecutionFlow steps={data.steps} />
      </SectionCard>

      <SectionCard
        question="What did the runtime report?"
        context={`${data.timeline.length} raw events, oldest first.`}
        icon={<ListOrdered className="size-4" />}
      >
        {data.timeline.length ? (
          <div className="max-h-80 overflow-y-auto">
            <ul className="space-y-0.5">
              {data.timeline.map((event, index) => (
                <li
                  key={`${event.e}-${event.ts}-${index}`}
                  className="flex items-baseline gap-3 rounded px-2 py-1 text-[11px] hover:bg-white/[0.03]"
                >
                  <span className="w-32 shrink-0 truncate font-medium text-zinc-300">{event.e}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">
                    {Object.entries(event)
                      .filter(([key]) => key !== 'e' && key !== 'ts')
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' · ') || '—'}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-700">
                    {event.si !== undefined ? `step ${event.si + 1}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="py-6 text-center text-[11px] text-zinc-600">This run reported no events.</p>
        )}
      </SectionCard>
    </DashboardPageBody>
  )
}
