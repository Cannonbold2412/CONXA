'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchTrackingWorkflow } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { OpenInStudioButton } from '@/components/OpenInStudioButton'
import { SplitBar } from '@/components/viz/SplitBar'
import { TrendChart } from '@/components/viz/TrendChart'
import { INK, RECOVERY_COLORS, STATUS_COLORS, WORKFLOW_STATUS } from '@/components/viz/chartTheme'
import { DashboardError, DashboardPageBody, DashboardSkeleton, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard, Sentence } from './SectionCard'
import { fmtDuration, fmtNumber, fmtPercent, fmtRelative } from './dashboardData'
import { failureLabel, healingAnswer, stepAnswer, versionAnswer, workflowStatus, workflowVerdict } from './narrative'
import { rangeLongLabel, useRange } from './useRange'

const TWO_COLUMN = 'grid gap-14 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-16'

function rateColor(rate: number): string {
  if (rate < 80) return STATUS_COLORS.error
  if (rate < 95) return STATUS_COLORS.warn
  return INK.mid
}

export function WorkflowDetailPage({ company, slug }: { company: string; slug: string }) {
  const [range] = useRange()
  const detail = useQuery({
    queryKey: queryKeys.trackingWorkflow(company, slug, range),
    queryFn: () => fetchTrackingWorkflow(company, slug, range),
    staleTime: 30_000,
  })

  if (detail.isPending) return <DashboardSkeleton />
  if (isUpgradeRequiredError(detail.error)) return <DashboardPageBody><UpgradeRequired /></DashboardPageBody>
  if (detail.isError || !detail.data) return <DashboardError error={detail.error} onRetry={() => detail.refetch()} />

  const data = detail.data
  const summary = data.summary
  const label = rangeLongLabel(range)
  const status = summary ? WORKFLOW_STATUS[workflowStatus(summary)] : null
  const versions = summary?.versions ?? []
  // Mark when the current version first ran — only meaningful when the version changed in-window.
  const marker = versions.length > 1 ? { at: versions[0].first_seen, label: `v${versions[0].version} first ran` } : undefined
  const cascade = data.recovery_cascade

  return (
    <DashboardPageBody>
      <section aria-label="Summary" className="space-y-9">
        <div className="space-y-5">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-zinc-400">
            <Link href={`/dashboard/workflows?range=${range}`} className="transition-colors hover:text-zinc-100">
              Workflows
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate text-zinc-100">{slug}</span>
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate text-2xl font-semibold tracking-[-0.02em] text-zinc-100 sm:text-3xl">{slug}</h2>
                {status ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs ${status.text}`}>
                    <span className="size-1.5 rounded-full" style={{ background: status.color }} aria-hidden />
                    {status.label}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-zinc-400">
                {company}
                {versions[0] ? ` · version ${versions[0].version}` : ''} · {label.toLowerCase()}
              </p>
              {summary ? (
                <p className="max-w-3xl text-xl leading-snug tracking-[-0.015em] text-zinc-400 sm:text-2xl">
                  <Sentence parts={workflowVerdict(summary, data.steps)} />
                </p>
              ) : null}
            </div>
            <OpenInStudioButton workflowId={slug} primary label="Fix in Studio" />
          </div>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 border-y border-white/8 lg:grid-cols-5 lg:divide-x lg:divide-white/8">
            {[
              ['Success rate', fmtPercent(summary.success_rate), status?.text ?? 'text-zinc-100'],
              ['Runs', fmtNumber(summary.runs), 'text-zinc-100'],
              ['Runs self-healed', fmtPercent(summary.recovery_rate), 'text-zinc-100'],
              ['Typical run', fmtDuration(summary.p50_duration), 'text-zinc-100'],
              ['Last run', fmtRelative(summary.last_seen), 'text-zinc-100'],
            ].map(([title, value, tone]) => (
              <div key={title} className="min-w-0 space-y-2 py-5 pr-6 lg:px-6 lg:first:pl-0">
                <p className="truncate text-sm text-zinc-400">{title}</p>
                <p className={`truncate text-2xl font-semibold tabular-nums sm:text-3xl ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-white/8 pt-5 text-sm leading-relaxed text-zinc-400">
            This skill has not run in the selected window. Widen the range, or check that the customer&apos;s
            runtime is still installed and reporting.
          </p>
        )}
      </section>

      {summary ? (
        <div className={TWO_COLUMN}>
          <SectionCard
            question="How has it behaved over time?"
            answer={`Successful and failed runs per ${data.granularity === 'hour' ? 'hour' : 'day'}.`}
          >
            <TrendChart buckets={data.series} granularity={data.granularity} marker={marker} />
          </SectionCard>
          <SectionCard
            question="Did the latest version help or hurt?"
            answer={versionAnswer(versions) ?? 'Only one version ran in this period.'}
          >
            <ul className="space-y-6">
              {versions.slice(0, 4).map((version, index) => (
                <li key={version.version} className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-zinc-100">
                      v{version.version}
                      <span className="text-xs text-zinc-400">
                        {index === 0 ? ' · current' : ''} · {fmtNumber(version.runs)} runs
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-100">{fmtPercent(version.success_rate)}</span>
                  </div>
                  <div className="h-2.5 rounded-full" style={{ background: INK.track }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(1, version.success_rate)}%`, background: rateColor(version.success_rate) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : null}

      <div className={TWO_COLUMN}>
        <SectionCard question="Which step is the weak link?" answer={stepAnswer(data.steps)}>
          {data.steps.length ? (
            <ol className="border-t border-white/6">
              {data.steps.map((step) => {
                const weak = step.success_rate < 90
                return (
                  <li
                    key={`${step.step_index}`}
                    className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-5 gap-y-2 border-b border-white/6 py-3.5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-100">{step.step_label}</span>
                      <span className="block truncate text-xs text-zinc-400">
                        {fmtNumber(step.attempts)} attempts · {fmtNumber(step.failures)} failed
                        {step.recoveries ? ` · repaired ${fmtNumber(step.recoveries)}×` : ''}
                        {step.failures && step.dominant_failure_code ? ` · ${failureLabel(step.dominant_failure_code).toLowerCase()}` : ''}
                      </span>
                    </span>
                    <span className="col-span-2 row-start-2 h-1.5 rounded-full md:col-span-1 md:row-start-auto" style={{ background: INK.track }}>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(1, step.success_rate)}%`, background: rateColor(step.success_rate) }}
                      />
                    </span>
                    <span className={`text-right text-sm tabular-nums ${weak ? 'text-red-300' : 'text-zinc-100'}`}>
                      {fmtPercent(step.success_rate)}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="border-t border-white/8 pt-5 text-sm text-zinc-400">No step-level events reported for this skill yet.</p>
          )}
        </SectionCard>

        <div className="space-y-14">
          <SectionCard question="What were the last runs?" answer={data.recent_runs.length ? 'Newest first.' : 'No runs in this period.'}>
            {data.recent_runs.length ? (
              <ul className="border-t border-white/8">
                {data.recent_runs.slice(0, 6).map((run) => (
                  <li key={run.run_id}>
                    <Link
                      href={`/dashboard/runs/${encodeURIComponent(run.company)}/${encodeURIComponent(run.run_id)}?range=${range}`}
                      className="flex min-h-14 items-center gap-3.5 border-b border-white/8 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          background:
                            run.status === 'fail' ? STATUS_COLORS.error : run.status === 'running' ? 'var(--tier-4)' : INK.mid,
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-100">
                          {run.status === 'fail'
                            ? run.failed_step_id !== null
                              ? `Failed at step ${run.failed_step_id + 1}`
                              : 'Failed'
                            : run.status === 'running'
                              ? 'Running'
                              : run.recovered_steps
                                ? `Finished · ${run.recovered_steps} step${run.recovered_steps === 1 ? '' : 's'} repaired`
                                : 'Finished'}
                        </span>
                        <span className="block truncate text-xs text-zinc-400">
                          {run.status === 'fail' ? `${failureLabel(run.failure_code)} · ` : ''}
                          {fmtRelative(run.at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                        {run.duration_ms > 0 ? fmtDuration(run.duration_ms) : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          <SectionCard question="How did recovery play out here?" answer={healingAnswer(cascade)}>
            {cascade.entered_recovery > 0 ? (
              <SplitBar
                segments={[
                  { label: 'Healed free', value: cascade.zero_token_heals, color: RECOVERY_COLORS.free },
                  { label: 'Healed with AI', value: Math.max(0, cascade.healed - cascade.zero_token_heals), color: RECOVERY_COLORS.agent },
                  { label: 'Not healed', value: cascade.failed, color: RECOVERY_COLORS.failed },
                ]}
              />
            ) : null}
          </SectionCard>
        </div>
      </div>
    </DashboardPageBody>
  )
}
