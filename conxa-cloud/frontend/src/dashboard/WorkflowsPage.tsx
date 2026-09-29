'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchTrackingDashboard, type TrackingWorkflowRow } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { RATE_FLOOR, RateShift } from '@/components/viz/RateShift'
import { SplitBar } from '@/components/viz/SplitBar'
import { INK, STATUS_COLORS, WORKFLOW_STATUS } from '@/components/viz/chartTheme'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard, Sentence } from './SectionCard'
import { fmtNumber, fmtPercent } from './dashboardData'
import {
  FAILING_BELOW,
  SLIPPING_DROP,
  failureLabel,
  failureReasonsAnswer,
  volumeAnswer,
  workflowStatus,
  workflowsAnswer,
  workflowsSummary,
  type WorkflowStatus,
} from './narrative'
import { useRange } from './useRange'

const ROW_GRID = 'md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_4.5rem_6rem_4.5rem]'
const STATUS_ORDER: Record<WorkflowStatus, number> = { failing: 0, slipping: 1, healthy: 2 }
/** Healthy workflows share neutral ink, lightest for the busiest, so the bar stays calm. */
const HEALTHY_SHADES = ['rgba(244,245,247,0.7)', 'rgba(244,245,247,0.5)', 'rgba(244,245,247,0.34)', 'rgba(244,245,247,0.22)', 'rgba(244,245,247,0.14)']

function changeText(delta: number | null): string {
  if (delta === null) return 'new'
  if (delta === 0) return 'no change'
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pts`
}

function WorkflowRow({ row, range }: { row: TrackingWorkflowRow; range: string }) {
  const status = WORKFLOW_STATUS[workflowStatus(row)]
  const dropped = row.success_rate_delta !== null && row.success_rate_delta <= -SLIPPING_DROP
  return (
    <li>
      <Link
        href={`/dashboard/workflows/${encodeURIComponent(row.company)}/${encodeURIComponent(row.workflow)}?range=${range}`}
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-white/6 py-4 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70 ${ROW_GRID}`}
      >
        <span className="min-w-0 space-y-1">
          <span className="block truncate text-sm text-zinc-100">{row.workflow}</span>
          <span className={`flex items-center gap-1.5 text-xs ${status.text}`}>
            <span className="size-1.5 rounded-full" style={{ background: status.color }} aria-hidden />
            {status.label} · {fmtPercent(row.success_rate)}
            <span className="truncate text-zinc-400">· {row.company}</span>
          </span>
        </span>
        <span className="hidden md:block">
          <RateShift
            current={row.success_rate}
            previous={row.previous_success_rate}
            color={workflowStatus(row) === 'healthy' ? '#f4f5f7' : status.color}
          />
        </span>
        <span className="text-right text-sm tabular-nums text-zinc-100">{fmtNumber(row.runs)}</span>
        <span className={`hidden text-right text-sm tabular-nums md:block ${dropped ? status.text : 'text-zinc-400'}`}>
          {changeText(row.success_rate_delta)}
        </span>
        <span className="hidden truncate text-sm text-zinc-400 md:block">
          {row.versions[0] ? `v${row.versions[0].version}` : '—'}
        </span>
      </Link>
    </li>
  )
}

export function WorkflowsPage() {
  const [range] = useRange()
  const dashboard = useQuery({
    queryKey: queryKeys.trackingDashboard(range),
    queryFn: () => fetchTrackingDashboard(range),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  if (dashboard.isPending) return <DashboardSkeleton />
  if (isUpgradeRequiredError(dashboard.error)) return <DashboardPageBody><UpgradeRequired /></DashboardPageBody>
  if (dashboard.isError || !dashboard.data) return <DashboardError error={dashboard.error} onRetry={() => dashboard.refetch()} />

  const data = dashboard.data

  if (!data.workflows.length) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  const rows = [...data.workflows].sort(
    (a, b) => STATUS_ORDER[workflowStatus(a)] - STATUS_ORDER[workflowStatus(b)] || b.runs - a.runs,
  )
  const count = { healthy: 0, slipping: 0, failing: 0 }
  for (const row of rows) count[workflowStatus(row)] += 1

  const totalRuns = rows.reduce((sum, r) => sum + r.runs, 0)
  let shade = 0
  const volume = [...rows]
    .sort((a, b) => b.runs - a.runs)
    .map((row) => {
      const status = workflowStatus(row)
      return {
        label: row.workflow,
        value: totalRuns ? Math.round((row.runs / totalRuns) * 100) : 0,
        color: status === 'healthy' ? HEALTHY_SHADES[Math.min(shade++, HEALTHY_SHADES.length - 1)] : WORKFLOW_STATUS[status].color,
      }
    })

  const maxFailure = Math.max(1, ...data.failure_codes.map((f) => f.count))

  return (
    <DashboardPageBody>
      <section aria-label="Summary" className="space-y-8">
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">Which workflows are succeeding, and which are slipping?</p>
          <p className="max-w-3xl text-2xl leading-snug tracking-[-0.02em] text-zinc-400 sm:text-3xl">
            <Sentence parts={workflowsSummary(rows)} />
          </p>
        </div>
        <SplitBar
          segments={[
            { label: 'Healthy', value: count.healthy, color: WORKFLOW_STATUS.healthy.color },
            { label: 'Slipping', value: count.slipping, color: WORKFLOW_STATUS.slipping.color },
            { label: 'Failing', value: count.failing, color: WORKFLOW_STATUS.failing.color },
          ]}
        />
        <p className="text-xs text-zinc-400">
          Failing: below {FAILING_BELOW}% success. Slipping: down {SLIPPING_DROP}+ points on the previous period.
        </p>
      </section>

      <SectionCard question="How is each workflow doing?" answer={workflowsAnswer(rows)}>
        <div>
          <div className={`hidden items-end gap-x-6 border-b border-white/8 pb-3 text-xs text-zinc-400 md:grid ${ROW_GRID}`}>
            <span>Workflow</span>
            <span className="space-y-2">
              <span className="flex items-center gap-4">
                Success rate
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full border-[1.5px] border-zinc-500" aria-hidden />
                  last period
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-zinc-100" aria-hidden />
                  this period
                </span>
              </span>
              <span className="flex justify-between tabular-nums">
                {[RATE_FLOOR, 70, 80, 90, 100].map((tick) => (
                  <span key={tick}>{tick}%</span>
                ))}
              </span>
            </span>
            <span className="text-right">Runs</span>
            <span className="text-right">Change</span>
            <span>Version</span>
          </div>
          <ul>
            {rows.map((row) => (
              <WorkflowRow key={`${row.company}/${row.workflow}`} row={row} range={range} />
            ))}
          </ul>
        </div>
      </SectionCard>

      <SectionCard question="Where does the volume go?" answer={volumeAnswer(rows.map((r) => r.runs))}>
        <div className="space-y-3">
          <SplitBar segments={volume} legend="grid" unit="%" />
          <p className="text-xs text-zinc-400">
            Each block is sized by its share of runs. Amber and red blocks are the slipping and failing workflows.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        question="Why are runs failing?"
        answer={failureReasonsAnswer(data.failure_codes, data.metrics.failed_executions)}
      >
        {data.failure_codes.length ? (
          <ol className="space-y-5">
            {data.failure_codes.map((row) => (
              <li key={row.code} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_3rem]">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-zinc-100">{failureLabel(row.code)}</span>
                  <span className="block truncate text-xs text-zinc-400">
                    Reported as {row.code} · across {row.workflow_count} workflow{row.workflow_count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="col-span-2 row-start-2 h-2 rounded-full md:col-span-1 md:row-start-auto" style={{ background: INK.track }}>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(row.count / maxFailure) * 100}%`, background: STATUS_COLORS.error, opacity: 0.75 }}
                  />
                </span>
                <span className="text-right text-sm font-medium tabular-nums text-zinc-100">{fmtNumber(row.count)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-t border-white/8 pt-5 text-sm text-zinc-400">No runs failed in this period.</p>
        )}
      </SectionCard>
    </DashboardPageBody>
  )
}
