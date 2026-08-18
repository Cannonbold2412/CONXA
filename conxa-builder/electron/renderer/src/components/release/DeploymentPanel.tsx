import { Loader2, Monitor } from 'lucide-react'
import type { DeploymentsResponse } from '@/api/workflowsApi'
import { deploymentStatusLabel, upToDatePercent, type DeploymentStatusLike } from '@/lib/releaseState'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<DeploymentStatusLike, string> = {
  up_to_date: 'bg-emerald-400',
  pending: 'bg-amber-400',
  offline: 'bg-zinc-600',
  unknown: 'bg-zinc-700',
}

/** Section 5 — Deployment. Only ever shows counts the runtime actually
 * reported (runtime_registrations) — never a fabricated percentage. */
export function DeploymentPanel({ data, isLoading }: { data: DeploymentsResponse | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="text-xs">Loading deployment status…</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
        <p className="text-xs text-zinc-500">Deployment data unavailable</p>
      </div>
    )
  }

  const { summary, machines, desired_version: desiredVersion } = data
  const percent = upToDatePercent(summary)

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Current rollout</p>
          <p className="mt-0.5 font-mono text-sm text-zinc-200">
            {desiredVersion ? `v${desiredVersion}` : 'No stable release yet'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Monitor className="size-3.5" />
          {summary.total} machine{summary.total !== 1 ? 's' : ''}
        </div>
      </div>

      {summary.total > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['up_to_date', 'pending', 'offline', 'unknown'] as DeploymentStatusLike[]).map((status) => (
          <div key={status} className="rounded-md border border-white/8 bg-black/20 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">{deploymentStatusLabel(status)}</span>
            </div>
            <p className="mt-0.5 text-lg font-semibold text-zinc-200">{summary[status]}</p>
          </div>
        ))}
      </div>

      {machines.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-white/8">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-[#0d0f12] text-zinc-500">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">Machine</th>
                <th className="px-2.5 py-1.5 font-medium">Runtime</th>
                <th className="px-2.5 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.machine_id} className="border-t border-white/5 text-zinc-400">
                  <td className="truncate px-2.5 py-1.5 font-mono">{m.machine_id || '—'}</td>
                  <td className="px-2.5 py-1.5">{m.runtime_version || '—'}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('size-1.5 rounded-full', STATUS_DOT[m.status])} />
                      {deploymentStatusLabel(m.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-zinc-600">
        Runtimes receive the stable release automatically at their next sync — this is not instantaneous.
      </p>
    </div>
  )
}
