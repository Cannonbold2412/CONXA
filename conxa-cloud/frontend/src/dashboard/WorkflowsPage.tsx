'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, GitBranch, Network, Timer } from 'lucide-react'
import { fetchTrackingDashboard, type TrackingWorkflowRow } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { FleetTopology } from '@/components/viz/FleetTopology'
import { Sparkline } from '@/components/viz/Sparkline'
import { cn } from '@/lib/utils'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtDuration, fmtNumber, fmtPercent, fmtRelative } from './dashboardData'
import { rangeLongLabel, useRange } from './useRange'

function rateTone(rate: number): string {
  if (rate >= 95) return 'text-emerald-300'
  if (rate >= 85) return 'text-amber-300'
  return 'text-red-300'
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-[11px] text-zinc-700">new</span>
  }
  if (delta === 0) {
    return <span className="text-[11px] tabular-nums text-zinc-600">±0</span>
  }
  const good = delta > 0
  const Arrow = good ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('flex items-center gap-0.5 text-[11px] tabular-nums', good ? 'text-emerald-300' : 'text-red-300')}>
      <Arrow className="size-3" aria-hidden />
      {Math.abs(delta)}
    </span>
  )
}

/**
 * Version chips.
 *
 * The newest version sits first and carries its own success rate, because the question a
 * release owner actually has is "did the version I just shipped make things worse" — a
 * blended per-workflow rate hides exactly that.
 */
function VersionChips({ versions }: { versions: TrackingWorkflowRow['versions'] }) {
  if (versions.length < 2) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {versions.slice(0, 3).map((version, index) => (
        <span
          key={version.version}
          className={cn(
            'rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums',
            index === 0 ? 'border-white/12 text-zinc-300' : 'border-white/8 text-zinc-600',
          )}
          title={`${version.runs} run${version.runs === 1 ? '' : 's'} on v${version.version}`}
        >
          v{version.version} · {fmtPercent(version.success_rate)}
        </span>
      ))}
    </div>
  )
}

function WorkflowRow({ row, range }: { row: TrackingWorkflowRow; range: string }) {
  return (
    <li>
      <Link
        href={`/dashboard/workflows/${encodeURIComponent(row.company)}/${encodeURIComponent(row.workflow)}?range=${range}`}
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-3 py-3 transition-colors',
          'hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70',
          'md:grid-cols-[minmax(0,1.6fr)_5rem_7rem_5.5rem_6.5rem_5rem]',
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-zinc-100">{row.workflow}</p>
          <p className="truncate text-[11px] text-zinc-600">{row.company}</p>
          <VersionChips versions={row.versions} />
        </div>

        <div className="hidden md:block">
          <p className="text-[11px] text-zinc-600">Runs</p>
          <p className="text-sm tabular-nums text-zinc-200">{fmtNumber(row.runs)}</p>
        </div>

        <div className="hidden md:block">
          <p className="text-[11px] text-zinc-600">Success</p>
          <p className="flex items-center gap-1.5">
            <span className={cn('text-sm tabular-nums', rateTone(row.success_rate))}>
              {fmtPercent(row.success_rate)}
            </span>
            <DeltaChip delta={row.success_rate_delta} />
          </p>
        </div>

        <div className="hidden md:block">
          <p className="text-[11px] text-zinc-600">Self-healed</p>
          <p className="text-sm tabular-nums text-zinc-300">{fmtPercent(row.recovery_rate)}</p>
        </div>

        <div className="hidden md:block">
          <p className="text-[11px] text-zinc-600">p50 · p95</p>
          <p className="text-sm tabular-nums text-zinc-300">
            {fmtDuration(row.p50_duration)}
            <span className="text-zinc-600"> · {fmtDuration(row.p95_duration)}</span>
          </p>
        </div>

        <div className="text-right md:text-left">
          <p className="hidden text-[11px] text-zinc-600 md:block">Last run</p>
          <p className="text-[11px] tabular-nums text-zinc-500">{fmtRelative(row.last_seen)}</p>
          <div className="mt-1 flex justify-end md:justify-start">
            <Sparkline
              values={[row.previous_success_rate ?? row.success_rate, row.success_rate]}
              width={44}
              height={16}
              color={row.success_rate >= 95 ? 'var(--status-ok)' : 'var(--status-warn)'}
            />
          </div>
        </div>
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
  if (dashboard.isError || !dashboard.data) return <DashboardError onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const label = rangeLongLabel(range)

  if (!data.workflows.length) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  const regressing = data.workflows.filter((w) => (w.success_rate_delta ?? 0) <= -5)

  return (
    <DashboardPageBody>
      <SectionCard
        question="Which workflows are succeeding, and which are slipping?"
        context={
          regressing.length
            ? `${regressing.length} workflow${regressing.length === 1 ? '' : 's'} lost 5 points or more against the previous period.`
            : `Every workflow held its success rate against the previous period · ${label.toLowerCase()}.`
        }
        icon={<GitBranch className="size-4" />}
        bodyClassName="px-1.5 py-2"
      >
        <ul className="space-y-0.5">
          {data.workflows.map((row) => (
            <WorkflowRow key={`${row.company}/${row.workflow}`} row={row} range={range} />
          ))}
        </ul>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="What does the automation estate look like?"
          context="Every skill, sized by run volume and coloured by success rate. Click through to a skill."
          icon={<Network className="size-4" />}
        >
          <FleetTopology
            nodes={data.workflows.map((w) => ({
              company: w.company,
              workflow: w.workflow,
              runs: w.runs,
              successRate: w.success_rate,
            }))}
          />
        </SectionCard>

        <SectionCard
          question="Why are runs failing?"
          context="Failures grouped by the reason code the runtime reported."
          icon={<Timer className="size-4" />}
        >
          {data.failure_codes.length ? (
            <ul className="space-y-2.5">
              {data.failure_codes.map((row) => {
                const max = Math.max(...data.failure_codes.map((f) => f.count))
                return (
                  <li key={row.code}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] text-zinc-300">{row.code}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{row.count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-red-400/70"
                        style={{ width: `${(row.count / max) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      across {row.workflow_count} workflow{row.workflow_count === 1 ? '' : 's'}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-[11px] leading-relaxed text-zinc-600">
              No failures in this period.
            </p>
          )}
        </SectionCard>
      </div>
    </DashboardPageBody>
  )
}
