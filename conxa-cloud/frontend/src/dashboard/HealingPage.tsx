'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ShieldAlert, Sparkles, Waypoints } from 'lucide-react'
import { fetchTrackingDashboard, fetchTrackingDrift } from '@/api/pluginApi'
import { queryKeys } from '@/lib/queryKeys'
import { Heatmap } from '@/components/viz/Heatmap'
import { RecoverySankey } from '@/components/viz/RecoverySankey'
import { TierLadder } from '@/components/viz/TierLadder'
import { cn } from '@/lib/utils'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtNumber, fmtPercent, fmtRelative } from './dashboardData'
import { rangeLongLabel, useRange } from './useRange'

function assertionTone(rate: number): string {
  if (rate >= 95) return 'bg-emerald-400/70'
  if (rate >= 80) return 'bg-amber-400/70'
  return 'bg-red-400/70'
}

export function HealingPage() {
  const [range] = useRange()
  const dashboard = useQuery({
    queryKey: queryKeys.trackingDashboard(range),
    queryFn: () => fetchTrackingDashboard(range),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
  const drift = useQuery({
    queryKey: queryKeys.trackingDrift(),
    queryFn: fetchTrackingDrift,
    staleTime: 30_000,
  })

  if (dashboard.isPending) return <DashboardSkeleton />
  if (dashboard.isError || !dashboard.data) return <DashboardError onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const cascade = data.recovery_cascade
  const label = rangeLongLabel(range)

  if (data.metrics.total_executions === 0) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  // Share of steps that entered recovery and had to reach a paid tier. Derived from step
  // counts, not tier hits — one step trying two free tiers is still one step.
  const agentShare = cascade.entered_recovery
    ? Math.round((cascade.agent_assisted / cascade.entered_recovery) * 100)
    : 0

  return (
    <DashboardPageBody>
      <div className="grid grid-cols-2 divide-x divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] lg:grid-cols-4 lg:divide-y-0">
        {[
          ['Steps that needed recovery', fmtNumber(cascade.entered_recovery), 'text-zinc-100', `of ${fmtNumber(cascade.resolved_directly + cascade.entered_recovery)} steps run`],
          ['Healed without a human', fmtNumber(cascade.healed), 'text-emerald-300', `${fmtPercent(cascade.heal_rate)} of recovery attempts`],
          ['Healed at zero token cost', fmtNumber(cascade.zero_token_heals), 'text-cyan-300', 'Tier 1–2, no model call'],
          ['Needed a model', `${agentShare}%`, agentShare >= 20 ? 'text-amber-300' : 'text-zinc-300', 'Tier 3–4 escalations'],
        ].map(([title, value, tone, sub]) => (
          <div key={String(title)} className="min-w-0 px-4 py-3.5">
            <p className="truncate text-[11px] font-medium text-zinc-500">{title}</p>
            <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums', tone)}>{value}</p>
            <p className="mt-1 truncate text-[11px] text-zinc-600">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="Where does recovery spend its budget?"
          context="Only steps that entered recovery are in this flow. Everything that resolved on the first attempt is counted above, not drawn here."
          icon={<Waypoints className="size-4" />}
        >
          <RecoverySankey nodes={cascade.nodes} links={cascade.links} />
        </SectionCard>

        <SectionCard
          question="Which tier is doing the work?"
          context="The deeper the tier, the more it costs to heal."
          icon={<Sparkles className="size-4" />}
        >
          <TierLadder counts={cascade.tier_touch} />
        </SectionCard>
      </div>

      <SectionCard
        question="When does automation get flaky?"
        context={`Volume and failures by hour of the week, UTC · ${label.toLowerCase()}.`}
        icon={<CalendarClock className="size-4" />}
      >
        {data.reliability_heatmap.cells.length ? (
          <Heatmap cells={data.reliability_heatmap.cells} maxRuns={data.reliability_heatmap.max_runs} />
        ) : (
          <p className="py-10 text-center text-[11px] text-zinc-600">
            Not enough runs yet to show a weekly pattern.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          question="Which steps are drifting?"
          context="Steps that repeatedly need recovery. The page has likely changed — republishing restores a direct match."
          icon={<ShieldAlert className="size-4" />}
        >
          {drift.isPending ? (
            <p className="py-8 text-center text-[11px] text-zinc-600">Loading drift signals…</p>
          ) : drift.data?.queue.length ? (
            <ul className="space-y-2.5">
              {drift.data.queue.slice(0, 8).map((row) => (
                <li key={`${row.plugin_id}:${row.plugin_ver}:${row.step_id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-200">
                      {row.plugin_id}
                      <span className="text-zinc-600"> · step {row.step_id ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-amber-300">
                      {fmtPercent(row.occurrence_rate_pct)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                    v{row.plugin_ver} · healed by {row.dominant_method} at {row.dominant_tier} ·{' '}
                    {fmtRelative(row.last_seen)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[11px] leading-relaxed text-zinc-600">
              No step is repeatedly drifting. Compiled selectors are still matching directly.
            </p>
          )}
        </SectionCard>

        <SectionCard
          question="Are post-step checks starting to fail?"
          context="Assertion decay is the earliest warning that a page changed — usually before anything hard-fails."
          icon={<ShieldAlert className="size-4" />}
        >
          {data.assertion_health_by_step.length ? (
            <ul className="space-y-2.5">
              {data.assertion_health_by_step.slice(0, 8).map((row) => (
                <li key={`${row.company}:${row.workflow}:${row.step_index}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-200">
                      {row.workflow}
                      <span className="text-zinc-600"> · {row.step_label}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                      {fmtPercent(row.pass_rate)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn('h-full rounded-full', assertionTone(row.pass_rate))}
                      style={{ width: `${Math.max(1, row.pass_rate)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {row.passed} of {row.total} checks passed
                    {row.advisory_failures > 0 ? ` · ${row.advisory_failures} advisory failures` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[11px] leading-relaxed text-zinc-600">
              No post-step checks have reported yet.
            </p>
          )}
        </SectionCard>
      </div>
    </DashboardPageBody>
  )
}
