'use client'

import { Building2, Download, Users, WifiOff } from 'lucide-react'
import type { TrackingDashboardResponse } from '@/api/workflowsApi'
import { cn } from '@/lib/utils'
import { fmtNumber } from '../dashboardData'

/**
 * Deployment footprint — how far the automation is actually rolled out.
 *
 * Kept visually lighter than the KPI strip above it and given no sparklines: these are
 * standing facts about reach, not the operational numbers a reader is scanning for change.
 * Runtimes that have gone quiet sit alongside them because a shrinking install base and a
 * healthy success rate look identical if you only watch the success rate.
 */
export function FootprintStrip({ data }: { data: TrackingDashboardResponse }) {
  const cells = [
    { icon: Download, label: 'Installs', value: data.metrics.total_installs, tone: 'text-zinc-200' },
    { icon: Users, label: 'Active users', value: data.metrics.active_users, tone: 'text-zinc-200' },
    { icon: Building2, label: 'Active companies', value: data.metrics.active_companies, tone: 'text-zinc-200' },
    {
      icon: WifiOff,
      label: 'Runtimes gone quiet',
      value: data.stale_runtimes,
      tone: data.stale_runtimes > 0 ? 'text-amber-300' : 'text-zinc-200',
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-white/8 bg-white/[0.015] px-4 py-2.5">
      {cells.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-zinc-600" aria-hidden />
          <span className="text-[11px] text-zinc-500">{label}</span>
          <span className={cn('text-[13px] font-medium tabular-nums', tone)}>{fmtNumber(value)}</span>
        </div>
      ))}
      <p className="ml-auto text-[11px] text-zinc-600">
        No report in 30+ days counts as quiet.
      </p>
    </div>
  )
}
