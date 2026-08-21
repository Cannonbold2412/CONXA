'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, GitCompare, ListOrdered, Radio, Waypoints } from 'lucide-react'
import { fetchTrackingWorkflow } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { RecoverySankey } from '@/components/viz/RecoverySankey'
import { TrendChart } from '@/components/viz/TrendChart'
import { tierColor } from '@/components/viz/chartTheme'
import { cn } from '@/lib/utils'
import { DashboardError, DashboardPageBody, DashboardSkeleton } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtDuration, fmtNumber, fmtPercent, fmtRelative } from './dashboardData'
import { rangeLongLabel, useRange } from './useRange'

function rateTone(rate: number): string {
  if (rate >= 95) return 'text-emerald-300'
  if (rate >= 85) return 'text-amber-300'
  return 'text-red-300'
}

function barTone(rate: number): string {
  if (rate >= 95) return 'bg-emerald-400/70'
  if (rate >= 85) return 'bg-amber-400/70'
  return 'bg-red-400/70'
}

export function WorkflowDetailPage({ company, slug }: { company: string; slug: string }) {
  const [range] = useRange()
  const detail = useQuery({
    queryKey: queryKeys.trackingWorkflow(company, slug, range),
    queryFn: () => fetchTrackingWorkflow(company, slug, range),
    staleTime: 30_000,
  })

  if (detail.isPending) return <DashboardSkeleton />
  if (detail.isError || !detail.data) return <DashboardError onRetry={() => detail.refetch()} />

  const data = detail.data
  const summary = data.summary
  const label = rangeLongLabel(range)

  return (
    <DashboardPageBody>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/workflows?range=${range}`}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="size-3" aria-hidden />
            All workflows
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold text-zinc-100">{slug}</h1>
          <p className="truncate text-[11px] text-zinc-600">
            {company} · {label.toLowerCase()}
          </p>
        </div>
      </div>

      {!summary ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-6 py-14 text-center">
          <p className="text-sm font-medium text-zinc-200">No runs in this period</p>
          <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-zinc-500">
            This skill has not executed in the selected window. Widen the range, or check that the
            customer&apos;s runtime is still installed and reporting.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] lg:grid-cols-5 lg:divide-y-0">
            {[
              ['Runs', fmtNumber(summary.runs), 'text-zinc-100'],
              ['Success rate', fmtPercent(summary.success_rate), rateTone(summary.success_rate)],
              ['Self-healed', fmtPercent(summary.recovery_rate), 'text-cyan-300'],
              ['p50 duration', fmtDuration(summary.p50_duration), 'text-zinc-200'],
              ['p95 duration', fmtDuration(summary.p95_duration), 'text-zinc-200'],
            ].map(([title, value, tone]) => (
              <div key={String(title)} className="min-w-0 px-4 py-3.5">
                <p className="truncate text-[11px] font-medium text-zinc-500">{title}</p>
                <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums', tone)}>{value}</p>
              </div>
            ))}
          </div>

          <SectionCard
            question="How has this skill behaved over time?"
            context={`Successful and failed runs per ${data.granularity === 'hour' ? 'hour' : 'day'}.`}
            icon={<Waypoints className="size-4" />}
          >
            <TrendChart buckets={data.series} granularity={data.granularity} />
          </SectionCard>

          {summary.versions.length > 1 ? (
            <SectionCard
              question="Did the latest version make things better or worse?"
              context="Newest first. A drop here is the fastest signal that a release regressed."
              icon={<GitCompare className="size-4" />}
            >
              <ul className="space-y-2.5">
                {summary.versions.map((version, index) => (
                  <li key={version.version}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] text-zinc-200">
                        v{version.version}
                        {index === 0 ? (
                          <span className="ml-2 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-300">
                            current
                          </span>
                        ) : null}
                      </span>
                      <span className={cn('shrink-0 text-[11px] tabular-nums', rateTone(version.success_rate))}>
                        {fmtPercent(version.success_rate)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className={cn('h-full rounded-full', barTone(version.success_rate))}
                        style={{ width: `${Math.max(1, version.success_rate)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {fmtNumber(version.runs)} runs · {fmtPercent(version.recovery_rate)} self-healed ·{' '}
                      {fmtRelative(version.last_seen)}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="Which step is the weak link?"
          context="Every step in this skill, worst success rate first."
          icon={<ListOrdered className="size-4" />}
        >
          {data.steps.length ? (
            <ul className="space-y-3">
              {data.steps.map((step) => (
                <li key={`${step.step_index}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-200">{step.step_label}</span>
                    <span className={cn('shrink-0 text-[11px] tabular-nums', rateTone(step.success_rate))}>
                      {fmtPercent(step.success_rate)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn('h-full rounded-full', barTone(step.success_rate))}
                      style={{ width: `${Math.max(1, step.success_rate)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                    <span>
                      {fmtNumber(step.attempts)} attempts · {fmtNumber(step.failures)} failed
                    </span>
                    {step.assertion_pass_rate !== null ? (
                      <span>checks {fmtPercent(step.assertion_pass_rate)}</span>
                    ) : null}
                    {step.dominant_failure_code ? (
                      <span className="text-red-300/80">{step.dominant_failure_code}</span>
                    ) : null}
                    {step.tier_counts.map((tier) => (
                      <span key={tier.tier} className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full" style={{ background: tierColor(tier.tier) }} aria-hidden />
                        {tier.tier} ×{tier.count}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[11px] text-zinc-600">
              No step-level events reported for this skill yet.
            </p>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            question="How did recovery play out here?"
            context={
              data.recovery_cascade.entered_recovery > 0
                ? `${data.recovery_cascade.entered_recovery} steps entered recovery · ${fmtPercent(data.recovery_cascade.heal_rate)} healed.`
                : 'No step in this skill needed recovery.'
            }
            icon={<Waypoints className="size-4" />}
          >
            <RecoverySankey nodes={data.recovery_cascade.nodes} links={data.recovery_cascade.links} />
          </SectionCard>

          <SectionCard
            question="What were the last runs?"
            context="Most recent executions of this skill."
            icon={<Radio className="size-4" />}
          >
            {data.recent_runs.length ? (
              <ul className="space-y-0.5">
                {data.recent_runs.slice(0, 8).map((run) => (
                  <li key={run.run_id}>
                    <Link
                      href={`/dashboard/runs/${encodeURIComponent(run.company)}/${encodeURIComponent(run.run_id)}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
                    >
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          run.status === 'ok' ? 'bg-emerald-400' : run.status === 'fail' ? 'bg-red-400' : 'bg-cyan-400',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
                        {run.failure_code ?? (run.status === 'ok' ? 'Succeeded' : 'Running')}
                        {run.duration_ms > 0 ? ` · ${fmtDuration(run.duration_ms)}` : ''}
                      </span>
                      <time className="shrink-0 text-[11px] tabular-nums text-zinc-600">{fmtRelative(run.at)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[11px] text-zinc-600">No runs in this period.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </DashboardPageBody>
  )
}
