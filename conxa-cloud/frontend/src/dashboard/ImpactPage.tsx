'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Coins, Pencil, TrendingUp, X } from 'lucide-react'
import {
  fetchRoiAssumptions,
  fetchTrackingDashboard,
  saveRoiAssumptions,
  type RoiAssumptions,
} from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard } from './SectionCard'
import { fmtNumber } from './dashboardData'
import { rangeLongLabel, useRange } from './useRange'

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${fmtNumber(amount)} ${currency}`
  }
}

/**
 * The assumptions behind the estimate, editable in place.
 *
 * Deliberately on the same page as the number it produces rather than buried in settings:
 * anyone reading "412 hours saved" can see, in one glance, exactly what was assumed to get
 * there. A figure whose inputs live on another screen is a figure nobody can defend.
 */
function AssumptionsEditor({ assumptions }: { assumptions: RoiAssumptions }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [minutes, setMinutes] = useState(String(assumptions.default_minutes))
  const [rate, setRate] = useState(String(assumptions.hourly_rate))

  useEffect(() => {
    setMinutes(String(assumptions.default_minutes))
    setRate(String(assumptions.hourly_rate))
  }, [assumptions.default_minutes, assumptions.hourly_rate])

  const save = useMutation({
    mutationFn: () =>
      saveRoiAssumptions({
        ...assumptions,
        default_minutes: Number(minutes) || 0,
        hourly_rate: Number(rate) || 0,
      }),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.roiAssumptions() })
      queryClient.invalidateQueries({ queryKey: ['tracking-dashboard'] })
    },
  })

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
        <p className="flex-1 text-[11px] leading-relaxed text-zinc-500">
          Assuming a person spends{' '}
          <span className="font-medium text-zinc-300">{assumptions.default_minutes} minutes</span> per run at{' '}
          <span className="font-medium text-zinc-300">
            {money(assumptions.hourly_rate, assumptions.currency)}/hour
          </span>
          .
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3" aria-hidden />
          Edit
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-white/12 bg-white/[0.035] px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="min-w-0">
        <Label htmlFor="roi-minutes" className="text-[11px] text-zinc-500">
          Minutes per run
        </Label>
        <Input
          id="roi-minutes"
          type="number"
          min={0}
          step={1}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="mt-1 h-8 w-28 border-white/12 bg-white/[0.04] tabular-nums"
        />
      </div>
      <div className="min-w-0">
        <Label htmlFor="roi-rate" className="text-[11px] text-zinc-500">
          Hourly rate ({assumptions.currency})
        </Label>
        <Input
          id="roi-rate"
          type="number"
          min={0}
          step={1}
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          className="mt-1 h-8 w-28 border-white/12 bg-white/[0.04] tabular-nums"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={save.isPending}>
          <Check className="size-3.5" aria-hidden />
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-400"
          onClick={() => setEditing(false)}
        >
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
      </div>
      {save.isError ? (
        <p className="w-full text-[11px] text-red-300">
          Could not save. Updating these values requires an admin or owner role.
        </p>
      ) : null}
    </form>
  )
}

export function ImpactPage() {
  const [range] = useRange()
  const dashboard = useQuery({
    queryKey: queryKeys.trackingDashboard(range),
    queryFn: () => fetchTrackingDashboard(range),
    staleTime: 30_000,
  })
  const assumptionsQuery = useQuery({
    queryKey: queryKeys.roiAssumptions(),
    queryFn: fetchRoiAssumptions,
    staleTime: 60_000,
  })

  if (dashboard.isPending) return <DashboardSkeleton />
  if (isUpgradeRequiredError(dashboard.error)) return <DashboardPageBody><UpgradeRequired /></DashboardPageBody>
  if (dashboard.isError || !dashboard.data) return <DashboardError onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const roi = data.roi
  const label = rangeLongLabel(range)

  if (data.metrics.total_executions === 0) {
    return (
      <DashboardPageBody>
        <NoTelemetry />
      </DashboardPageBody>
    )
  }

  const maxHours = Math.max(1, ...roi.estimated.by_workflow.map((w) => w.hours_saved))

  return (
    <DashboardPageBody>
      <SectionCard
        question="What is this automation worth?"
        context={`Time returned to the business over the ${label.toLowerCase()}. Everything on this card depends on an assumption you control.`}
        icon={<TrendingUp className="size-4" />}
      >
        <div className="space-y-4">
          <AssumptionsEditor assumptions={assumptionsQuery.data ?? roi.assumptions} />

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Hours saved', fmtNumber(roi.estimated.hours_saved), 'Estimate'],
              ['Value returned', money(roi.estimated.value_amount, roi.estimated.currency), 'Estimate'],
              ['Runs completed unattended', fmtNumber(roi.measured.unattended_completions), 'Measured'],
            ].map(([title, value, kind]) => (
              <div key={String(title)} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-medium text-zinc-500">{title}</p>
                  <span
                    className={
                      kind === 'Measured'
                        ? 'shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300'
                        : 'shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400'
                    }
                  >
                    {kind}
                  </span>
                </div>
                <p className="mt-1.5 text-3xl font-semibold tabular-nums text-zinc-100">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          question="Which workflows return the most time?"
          context="Ranked by estimated hours saved. Workflows using the workspace default are marked."
          icon={<TrendingUp className="size-4" />}
        >
          {roi.estimated.by_workflow.length ? (
            <ul className="space-y-3">
              {roi.estimated.by_workflow.map((row) => (
                <li key={`${row.company}/${row.workflow}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-200">{row.workflow}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-300">
                      {fmtNumber(row.hours_saved)} h
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-cyan-400/70"
                      style={{ width: `${(row.hours_saved / maxHours) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {fmtNumber(row.runs)} runs × {row.minutes_per_run} min
                    {row.is_estimate_default ? ' (workspace default)' : ' (set for this workflow)'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[11px] text-zinc-600">
              No successful runs in this period.
            </p>
          )}
        </SectionCard>

        <SectionCard
          question="What did reliability cost?"
          context="These four numbers come straight from telemetry — no assumptions anywhere in them."
          icon={<Coins className="size-4" />}
        >
          <dl className="space-y-3">
            {[
              ['Runs that self-healed mid-execution', roi.measured.self_healed_runs, 'Would otherwise have needed a person'],
              ['Steps healed at zero token cost', roi.measured.zero_token_recoveries, 'Healed at Tier 1 or 2, never escalated'],
              ['Steps that needed a model', roi.measured.agent_assisted_recoveries, 'Reached Tier 3 or 4 — the billable path'],
              ['Runtimes gone quiet', data.stale_runtimes, 'No report in over 30 days'],
            ].map(([title, value, detail]) => (
              <div key={String(title)} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <dt className="truncate text-[13px] text-zinc-300">{title}</dt>
                  <dd className="truncate text-[11px] text-zinc-600">{detail}</dd>
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums text-zinc-100">
                  {fmtNumber(Number(value))}
                </span>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </DashboardPageBody>
  )
}
