'use client'

import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, HeartPulse, Radio, TrendingUp, Waypoints } from 'lucide-react'
import { fetchTrackingDashboard } from '@/api/pluginApi'
import { queryKeys } from '@/lib/queryKeys'
import { TrendChart } from '@/components/viz/TrendChart'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { FootprintStrip } from './sections/FootprintStrip'
import { HealthPanel } from './sections/HealthPanel'
import { InsightsPanel } from './sections/InsightsPanel'
import { KpiStrip } from './sections/KpiStrip'
import { LiveActivity } from './sections/LiveActivity'
import { RiskQueue } from './sections/RiskQueue'
import { RoiSummary } from './sections/RoiSummary'
import { rangeLongLabel, useRange } from './useRange'

export function OverviewPage() {
  const [range] = useRange()
  const dashboard = useQuery({
    queryKey: queryKeys.trackingDashboard(range),
    queryFn: () => fetchTrackingDashboard(range),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  if (dashboard.isPending) return <DashboardSkeleton />
  if (dashboard.isError || !dashboard.data) return <DashboardError onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const label = rangeLongLabel(range)
  const hasTelemetry = data.metrics.total_executions > 0

  if (!hasTelemetry) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  const cascade = data.recovery_cascade

  return (
    <DashboardPageBody>
      <KpiStrip kpis={data.kpis} rangeLabel={label} />
      <FootprintStrip data={data} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="Is the platform healthy?"
          context={`One score across reliability, checks, drift, healing cost, and runtime freshness — ${label.toLowerCase()}.`}
          icon={<HeartPulse className="size-4" />}
        >
          <HealthPanel health={data.health} />
        </SectionCard>

        <SectionCard
          question="What needs attention?"
          context="Computed from the numbers on this page. Every item links to its evidence."
          icon={<AlertTriangle className="size-4" />}
        >
          <InsightsPanel insights={data.insights} />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="How much is running, and how much of it works?"
          context={`Successful and failed runs per ${data.granularity === 'hour' ? 'hour' : 'day'}. Self-healed runs are a subset of successful ones, shown on hover.`}
          icon={<Activity className="size-4" />}
          href={`/dashboard/workflows?range=${range}`}
          hrefLabel="By workflow"
        >
          <TrendChart buckets={data.series} granularity={data.granularity} />
        </SectionCard>

        <SectionCard
          question="What is running right now?"
          context="Newest executions across every workspace, refreshing every 10 seconds."
          icon={<Radio className="size-4" />}
        >
          <LiveActivity />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          question="What is failing most?"
          context="Workflows and the exact steps inside them, ranked by failure count."
          icon={<AlertTriangle className="size-4" />}
        >
          <RiskQueue data={data} />
        </SectionCard>

        <SectionCard
          question="What is this worth?"
          context="Time returned to the business, and the healing that cost nothing."
          icon={<TrendingUp className="size-4" />}
          href={`/dashboard/impact?range=${range}`}
          hrefLabel="Full breakdown"
        >
          <RoiSummary roi={data.roi} />
        </SectionCard>
      </div>

      <SectionCard
        question="Is self-healing keeping up?"
        context={
          cascade.entered_recovery > 0
            ? `${cascade.entered_recovery} step${cascade.entered_recovery === 1 ? '' : 's'} needed recovery and ${cascade.heal_rate}% were healed. ${cascade.resolved_directly.toLocaleString()} resolved on the first try.`
            : 'No step needed recovery in this period.'
        }
        icon={<Waypoints className="size-4" />}
        href={`/dashboard/healing?range=${range}`}
        hrefLabel="Recovery detail"
      >
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          {[
            ['Steps healed', cascade.healed, 'text-emerald-300'],
            ['Steps still failed', cascade.failed, 'text-red-300'],
            ['Healed at zero token cost', cascade.zero_token_heals, 'text-cyan-300'],
          ].map(([label_, value, tone]) => (
            <div key={String(label_)}>
              <p className="text-[11px] font-medium text-zinc-500">{label_}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </DashboardPageBody>
  )
}
