'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import {
  fetchRoiAssumptions,
  fetchTrackingDashboard,
  saveRoiAssumptions,
  type RoiAssumptions,
} from '@/api/workflowsApi'
import { queryKeys } from '@/lib/queryKeys'
import { money } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DashboardError, DashboardPageBody, DashboardSkeleton, NoTelemetry, UpgradeRequired, isUpgradeRequiredError } from './DashboardStates'
import { SectionCard, Sentence } from './SectionCard'
import { fmtNumber } from './dashboardData'
import { impactSummary, topReturnAnswer } from './narrative'
import { rangeLongLabel, useRange } from './useRange'

/**
 * How the estimate is made, in one line, with the hourly rate as the only input.
 *
 * Time saved per run is each workflow's recorded length in Build Studio (seeded into
 * `per_workflow` on first publish), so nobody has to guess minutes. The hourly rate is the
 * one number a person supplies. Totals update after a save — the server owns the formula
 * (oversight time, recorded minutes), so the browser never guesses at it.
 */
function HourlyRate({ assumptions }: { assumptions: RoiAssumptions }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [rate, setRate] = useState(String(assumptions.hourly_rate))

  useEffect(() => {
    setRate(String(assumptions.hourly_rate))
  }, [assumptions.hourly_rate])

  const save = useMutation({
    // PUT replaces the whole row, so every other field is sent back unchanged.
    mutationFn: () => saveRoiAssumptions({ ...assumptions, hourly_rate: Number(rate) || 0 }),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.roiAssumptions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.trackingDashboardAll })
    },
  })

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-400">
        Each workflow&apos;s recorded time in Build Studio × the runs it finished on its own, valued at your
        hourly rate of{' '}
        <span className="font-medium text-zinc-100">{money(assumptions.hourly_rate, assumptions.currency)}</span>.{' '}
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-sm text-zinc-100 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70"
          >
            Change hourly rate
          </button>
        ) : null}
      </p>
      {editing ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <div>
            <Label htmlFor="roi-rate" className="text-xs text-zinc-400">
              Hourly rate ({assumptions.currency})
            </Label>
            <Input
              id="roi-rate"
              type="number"
              min={0}
              step={1}
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className="mt-2 h-11 w-40 border-white/12 bg-[#06080b] tabular-nums"
            />
          </div>
          <Button type="submit" size="sm" className="h-11" disabled={save.isPending}>
            <Check className="size-3.5" aria-hidden />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-11 text-zinc-400" onClick={() => setEditing(false)}>
            <X className="size-3.5" aria-hidden />
            Cancel
          </Button>
          {save.isError ? (
            <p className="w-full text-xs text-red-300">Could not save. Changing the hourly rate requires an admin or owner role.</p>
          ) : null}
        </form>
      ) : null}
    </div>
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
  if (dashboard.isError || !dashboard.data) return <DashboardError error={dashboard.error} onRetry={() => dashboard.refetch()} />

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

  const value = money(roi.estimated.value_amount, roi.estimated.currency)
  const ranked = [...roi.estimated.by_workflow].sort((a, b) => b.hours_saved - a.hours_saved)
  const maxHours = Math.max(1, ...ranked.map((w) => w.hours_saved))
  const aiRepairs = roi.measured.agent_assisted_recoveries

  return (
    <DashboardPageBody>
      <section aria-label="Summary" className="space-y-9">
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">What is this automation worth over the {label.toLowerCase()}?</p>
          <p className="max-w-3xl text-2xl leading-snug tracking-[-0.02em] text-zinc-400 sm:text-3xl">
            <Sentence parts={impactSummary(roi.estimated.hours_saved, value)} />
          </p>
        </div>
        <HourlyRate assumptions={assumptionsQuery.data ?? roi.assumptions} />
        <div className="grid border-y border-white/8 sm:grid-cols-3 sm:divide-x sm:divide-white/8">
          {[
            ['Hours saved', fmtNumber(roi.estimated.hours_saved), 'Estimate'],
            ['Value returned', value, 'Estimate'],
            ['Runs finished unattended', fmtNumber(roi.measured.unattended_completions), 'Measured'],
          ].map(([title, figure, kind]) => (
            <div key={title} className="min-w-0 space-y-3 py-5 sm:px-6 sm:first:pl-0">
              <p className="flex items-center gap-2.5 text-sm text-zinc-400">
                {title}
                <span
                  className={
                    kind === 'Measured'
                      ? 'rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-zinc-100'
                      : 'rounded-full border border-dashed border-white/20 px-2 py-0.5 text-xs text-zinc-400'
                  }
                >
                  {kind}
                </span>
              </p>
              <p className="truncate text-4xl font-semibold leading-none tracking-[-0.02em] tabular-nums text-zinc-100">{figure}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-14 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-16">
        <SectionCard question="Which workflows return the most time?" answer={topReturnAnswer(ranked)}>
          {ranked.length ? (
            <ol className="space-y-5">
              {ranked.map((row) => (
                <li
                  key={`${row.company}/${row.workflow}`}
                  className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_4rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{row.workflow}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {fmtNumber(row.runs)} runs × {row.minutes_per_run} min
                      {row.is_estimate_default ? ' · no recording time yet, workspace default' : ' recorded'}
                    </span>
                  </span>
                  <span className="col-span-2 row-start-2 h-2 rounded-full bg-white/[0.05] md:col-span-1 md:row-start-auto">
                    <span className="block h-full rounded-full bg-zinc-100/60" style={{ width: `${(row.hours_saved / maxHours) * 100}%` }} />
                  </span>
                  <span className="text-right text-sm font-medium tabular-nums text-zinc-100">{fmtNumber(row.hours_saved)} h</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border-t border-white/8 pt-5 text-sm text-zinc-400">No successful runs in this period.</p>
          )}
        </SectionCard>

        <SectionCard
          question="What did reliability cost?"
          answer={aiRepairs ? `Very little. Only ${fmtNumber(aiRepairs)} repair${aiRepairs === 1 ? '' : 's'} needed AI.` : 'Nothing. No repair needed AI.'}
          context="Straight from runtime reports — no assumptions."
        >
          <div className="border-t border-white/8">
            {[
              ['Runs that repaired themselves mid-way', roi.measured.self_healed_runs, 'Each would otherwise have needed a person.'],
              ['Repairs at zero AI cost', roi.measured.zero_token_recoveries, 'Tier A — fixed without calling a model.'],
              ['Repairs that needed AI', aiRepairs, 'Tier B — the only billable path.'],
              ['Runtimes gone quiet', data.stale_runtimes, 'No report in over 30 days — not counted above.'],
            ].map(([title, count, detail]) => (
              <div key={String(title)} className="flex items-start justify-between gap-4 border-b border-white/8 py-4">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100">{title}</p>
                  <p className="text-xs text-zinc-400">{detail}</p>
                </div>
                <span className="shrink-0 text-xl font-semibold tabular-nums text-zinc-100">{fmtNumber(Number(count))}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </DashboardPageBody>
  )
}
