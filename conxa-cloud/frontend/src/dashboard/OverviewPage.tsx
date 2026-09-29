'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchTrackingDashboard } from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { HealthArc } from '@/components/viz/HealthArc'
import { SplitBar } from '@/components/viz/SplitBar'
import { TrendChart } from '@/components/viz/TrendChart'
import { RECOVERY_COLORS, STATUS_COLORS } from '@/components/viz/chartTheme'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard, Sentence } from './SectionCard'
import { FootprintStrip } from './sections/FootprintStrip'
import { HealthPanel } from './sections/HealthPanel'
import { InsightsPanel } from './sections/InsightsPanel'
import { KpiStrip } from './sections/KpiStrip'
import { RiskQueue } from './sections/RiskQueue'
import { failingAnswer, healingAnswer, overviewSentence, trendAnswer, workflowStatus } from './narrative'
import { rangeLongLabel, useRange } from './useRange'

const TWO_COLUMN = 'grid gap-14 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-16'

function StatusPill({ href, color, text, children }: { href: string; color: string; text: string; children: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full bg-white/[0.05] px-3.5 text-sm ${text} transition-colors hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70`}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </Link>
  )
}

export function OverviewPage() {
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
  const label = rangeLongLabel(range)

  if (data.metrics.total_executions === 0) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  const cascade = data.recovery_cascade
  const statuses = data.workflows.map(workflowStatus)
  const failing = statuses.filter((s) => s === 'failing').length
  const slipping = statuses.filter((s) => s === 'slipping').length
  const workflowsHref = `/dashboard/workflows?range=${range}`

  return (
    <DashboardPageBody>
      <section aria-label="Summary" className={`${TWO_COLUMN} items-center`}>
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">The {label.toLowerCase()}, in one sentence</p>
          <p className="max-w-3xl text-2xl leading-snug tracking-[-0.02em] text-zinc-400 sm:text-3xl">
            <Sentence parts={overviewSentence(data.metrics.total_executions, data.metrics.success_rate, cascade)} />
          </p>
          {failing || slipping || data.stale_runtimes ? (
            <div className="flex flex-wrap gap-2.5">
              {failing ? (
                <StatusPill href={workflowsHref} color={STATUS_COLORS.error} text="text-red-300">
                  {`${failing} workflow${failing === 1 ? '' : 's'} failing`}
                </StatusPill>
              ) : null}
              {slipping ? (
                <StatusPill href={workflowsHref} color={STATUS_COLORS.warn} text="text-amber-300">
                  {`${slipping} workflow${slipping === 1 ? '' : 's'} slipping`}
                </StatusPill>
              ) : null}
              {data.stale_runtimes ? (
                <StatusPill href="/fleet" color="rgba(244,245,247,0.45)" text="text-zinc-400">
                  {`${data.stale_runtimes} runtime${data.stale_runtimes === 1 ? '' : 's'} gone quiet`}
                </StatusPill>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-3">
          <HealthArc score={data.health.score} grade={data.health.grade} />
          <p className="max-w-[16rem] text-center text-xs leading-relaxed text-zinc-400">{data.health.summary}</p>
        </div>
      </section>

      <section aria-label="Key numbers" className="space-y-4">
        <KpiStrip kpis={data.kpis} rangeLabel={label} />
        <FootprintStrip data={data} />
      </section>

      <div className={TWO_COLUMN}>
        <SectionCard
          question="Is the platform healthy?"
          answer={
            data.health.score === null
              ? 'Not scored yet.'
              : `${data.health.grade}, ${data.health.score} out of 100.`
          }
        >
          <HealthPanel health={data.health} />
        </SectionCard>
        <SectionCard question="What needs attention?" answer={data.insights.length ? 'Most urgent first.' : 'Nothing right now.'}>
          <InsightsPanel insights={data.insights} />
        </SectionCard>
      </div>

      <div className={TWO_COLUMN}>
        <SectionCard
          question="How much is running, and how much of it works?"
          answer={trendAnswer(data.series, data.granularity)}
          href={workflowsHref}
          hrefLabel="By workflow"
        >
          <TrendChart buckets={data.series} granularity={data.granularity} />
        </SectionCard>
        <SectionCard
          question="What is failing most?"
          answer={failingAnswer(
            data.most_failed_workflows.map((w) => w.failed_executions),
            data.metrics.failed_executions,
          )}
        >
          <RiskQueue data={data} range={range} />
        </SectionCard>
      </div>

      <SectionCard
        question="Is self-healing keeping up?"
        answer={healingAnswer(cascade)}
        href={`/dashboard/healing?range=${range}`}
        hrefLabel="Recovery detail"
      >
        {cascade.entered_recovery > 0 ? (
          <div className="space-y-3">
            <SplitBar
              segments={[
                { label: 'Healed instantly, at zero AI cost', value: cascade.zero_token_heals, color: RECOVERY_COLORS.free },
                { label: 'Healed with help from an AI agent', value: Math.max(0, cascade.healed - cascade.zero_token_heals), color: RECOVERY_COLORS.agent },
                { label: 'Could not be healed', value: cascade.failed, color: RECOVERY_COLORS.failed },
              ]}
            />
            <p className="text-xs text-zinc-400">
              Only the {cascade.entered_recovery.toLocaleString()} steps that needed recovery.{' '}
              {cascade.resolved_directly.toLocaleString()} others worked first time.
            </p>
          </div>
        ) : (
          <p className="border-t border-white/8 pt-5 text-sm text-zinc-400">Every step worked first time.</p>
        )}
      </SectionCard>
    </DashboardPageBody>
  )
}
