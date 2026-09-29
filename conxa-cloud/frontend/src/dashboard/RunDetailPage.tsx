'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchTrackingRun } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { ExecutionFlow } from '@/components/viz/ExecutionFlow'
import { STATUS_COLORS } from '@/components/viz/chartTheme'
import { DashboardError, DashboardPageBody, DashboardSkeleton } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtDuration, fmtNumber, fmtRelative } from './dashboardData'
import { failureLabel, runAnswer, runTitle } from './narrative'
import { useRange } from './useRange'

const STATUS = {
  ok: { label: 'Finished', text: 'text-zinc-100', dot: 'rgba(244,245,247,0.5)' },
  fail: { label: 'Failed', text: 'text-red-300', dot: STATUS_COLORS.error },
  running: { label: 'Running', text: 'text-cyan-300', dot: 'var(--tier-4)' },
} as const

export function RunDetailPage({ company, runId }: { company: string; runId: string }) {
  const [range] = useRange()
  const run = useQuery({
    queryKey: queryKeys.trackingRun(company, runId),
    queryFn: () => fetchTrackingRun(company, runId),
    staleTime: 30_000,
  })

  if (run.isPending) return <DashboardSkeleton />
  if (run.isError || !run.data) return <DashboardError error={run.error} onRetry={() => run.refetch()} />

  const data = run.data
  const summary = data.summary
  const status = STATUS[summary?.status ?? 'running'] ?? STATUS.running
  const workflowHref = `/dashboard/workflows/${encodeURIComponent(company)}/${encodeURIComponent(data.workflow_id)}?range=${range}`
  const repaired = data.steps.filter((s) => s.status === 'recovered').length
  const reached = data.steps.filter((s) => s.status !== 'not_reached' && s.status !== 'failed').length

  return (
    <DashboardPageBody>
      <section aria-label="Summary" className="space-y-9">
        <div className="space-y-5">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link href={`/dashboard/workflows?range=${range}`} className="transition-colors hover:text-zinc-100">
              Workflows
            </Link>
            <span aria-hidden>/</span>
            <Link href={workflowHref} className="truncate transition-colors hover:text-zinc-100">
              {data.workflow_id}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-100">Run {data.run_id.slice(0, 8)}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-100 sm:text-3xl">{runTitle(data)}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs ${status.text}`}>
              <span className="size-1.5 rounded-full" style={{ background: status.dot }} aria-hidden />
              {status.label}
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            {data.workflow_id} v{data.workflow_ver} · {company} · runtime {data.runtime_ver} ·{' '}
            {summary?.started_at ? fmtRelative(summary.started_at) : 'unknown time'}
          </p>
          <p className="max-w-3xl text-xl leading-snug tracking-[-0.015em] text-zinc-100 sm:text-2xl">{runAnswer(data)}</p>
        </div>

        <div className="grid grid-cols-2 border-y border-white/8 lg:grid-cols-4 lg:divide-x lg:divide-white/8">
          {[
            ['Took', summary?.duration_ms ? fmtDuration(summary.duration_ms) : '—'],
            ['Steps completed', `${fmtNumber(reached)} of ${fmtNumber(summary?.total_steps ?? data.steps.length)}`],
            ['Steps repaired', fmtNumber(summary?.recovered_steps ?? repaired)],
            ['Why it stopped', summary?.status === 'fail' ? failureLabel(summary.failure_code) : '—'],
          ].map(([title, value]) => (
            <div key={title} className="min-w-0 space-y-2 py-5 pr-6 lg:px-6 lg:first:pl-0">
              <p className="truncate text-sm text-zinc-400">{title}</p>
              <p className="text-xl font-semibold leading-snug text-zinc-100 tabular-nums">{value}</p>
              {title === 'Why it stopped' && summary?.failure_code ? (
                <p className="truncate text-xs text-zinc-400">Reported as {summary.failure_code}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <SectionCard
        question="What happened, step by step?"
        answer={
          repaired
            ? `${fmtNumber(repaired)} step${repaired === 1 ? ' was' : 's were'} repaired along the way.`
            : 'Each step, in the order it ran.'
        }
      >
        <ExecutionFlow steps={data.steps} />
      </SectionCard>

      <section className="space-y-4">
        <details className="group border-t border-white/8 pt-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70">
            <span className="space-y-1">
              <span className="block text-sm font-medium text-zinc-400">What did the runtime report?</span>
              <span className="block text-lg font-medium text-zinc-100">
                {fmtNumber(data.timeline.length)} raw events, for engineers who want the detail.
              </span>
            </span>
            <span className="shrink-0 rounded-lg border border-white/10 px-3.5 py-2 text-sm text-zinc-100 group-open:hidden">Show</span>
            <span className="hidden shrink-0 rounded-lg border border-white/10 px-3.5 py-2 text-sm text-zinc-100 group-open:inline">Hide</span>
          </summary>
          {data.timeline.length ? (
            <ol className="mt-5 max-h-96 space-y-1.5 overflow-y-auto rounded-xl border border-white/6 bg-[#0b0f14] p-4">
              {data.timeline.map((event, index) => (
                <li key={`${event.e}-${event.ts}-${index}`} className="flex items-baseline gap-4 text-xs">
                  <span className="w-44 shrink-0 truncate font-medium text-zinc-100">{event.e}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400">
                    {Object.entries(event)
                      .filter(([key]) => key !== 'e' && key !== 'ts')
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' · ') || '—'}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">{event.si !== undefined ? `step ${event.si + 1}` : ''}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-zinc-400">This run reported no events.</p>
          )}
        </details>
      </section>
    </DashboardPageBody>
  )
}
