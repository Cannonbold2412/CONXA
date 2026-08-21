'use client'
import { queryKeys } from '@/lib/queryKeys'
import { toneBadgeClasses, type Tone } from '@/lib/tone'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchRuntimeRegistrations,
  revokeRuntime,
  type RuntimeRegistration,
  type RuntimeStatus,
} from '@/api/telemetryApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/product/ProductPrimitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Activity, Cpu, Filter, RefreshCw, Search, Server, Users } from 'lucide-react'

const ALL_STATUS = 'all'
const ALL_VERSION = 'all'
const PAGE_SIZE = 100

const STATUS_TONE: Record<RuntimeStatus, Tone> = {
  active: 'good',
  stale: 'warn',
  revoked: 'bad',
}

const STATUS_LABEL: Record<RuntimeStatus, string> = {
  active: 'Active',
  stale: 'Stale',
  revoked: 'Revoked',
}

function formatEpoch(seconds: number) {
  if (!seconds) return 'Never'
  return new Date(seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatRelative(seconds: number) {
  if (!seconds) return 'never'
  const diff = Date.now() - seconds * 1000
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function osLabel(reg: RuntimeRegistration) {
  const parts = [reg.platform, reg.os_release, reg.os_arch].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Unknown'
}

function registrationSearchText(reg: RuntimeRegistration) {
  return [reg.install_id, reg.hostname, reg.username, reg.platform, reg.runtime_version]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function SummaryMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Server }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-400">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-zinc-600">{detail}</p>
    </div>
  )
}

function CapabilityChips({ capabilities }: { capabilities?: Record<string, string> }) {
  const entries = Object.entries(capabilities ?? {})
  if (entries.length === 0) return <span className="text-zinc-600">—</span>
  return (
    <div className="flex max-w-56 flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <Badge key={key} variant="outline" className="border-white/10 bg-white/[0.035] font-mono text-[11px] text-zinc-400">
          {key}={value}
        </Badge>
      ))}
    </div>
  )
}

function FleetTable({
  rows,
  onRevoke,
  revokingId,
}: {
  rows: RuntimeRegistration[]
  onRevoke: (installId: string) => void
  revokingId?: string
}) {
  if (rows.length === 0) {
    return <EmptyState title="No machines match the current filters" description="Try a broader search or status filter." />
  }

  return (
    <Card className="border-white/8 bg-white/[0.025] shadow-none">
      <CardHeader className="border-b border-white/6 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
          <Server className="size-4 text-zinc-400" />
          Company Agent Machines
          <span className="ml-auto text-xs font-normal text-zinc-600">{rows.length} visible</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[64rem] w-full text-left text-sm">
            <thead className="border-b border-white/6 bg-black/20 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Machine</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">OS</th>
                <th className="px-4 py-3 font-medium">Last heartbeat</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Capabilities</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {rows.map((reg) => (
                <tr key={reg.install_id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-zinc-200">{reg.hostname || 'Unknown host'}</p>
                    <p className="mt-0.5 max-w-40 truncate font-mono text-[11px] text-zinc-600">{reg.install_id}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-300">{reg.username || '—'}</td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-zinc-400">{reg.runtime_version || 'unknown'}</td>
                  <td className="px-4 py-3 align-top text-zinc-400">{osLabel(reg)}</td>
                  <td className="px-4 py-3 align-top">
                    <p className="whitespace-nowrap text-zinc-200">{formatEpoch(reg.last_seen)}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{formatRelative(reg.last_seen)}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={toneBadgeClasses(STATUS_TONE[reg.status])}>
                      {STATUS_LABEL[reg.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <CapabilityChips capabilities={reg.capabilities} />
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {reg.status !== 'revoked' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-400 hover:text-red-300"
                        disabled={revokingId === reg.install_id}
                        onClick={() => {
                          if (window.confirm(`Revoke ${reg.hostname || reg.install_id}? This only relabels it in the dashboard — it keeps syncing and running skills normally.`)) {
                            onRevoke(reg.install_id)
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function FleetPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ALL_STATUS)
  const [version, setVersion] = useState(ALL_VERSION)
  const [pages, setPages] = useState(1)

  const fleetQ = useQuery({
    queryKey: queryKeys.runtimes(pages * PAGE_SIZE, 0),
    queryFn: () => fetchRuntimeRegistrations(pages * PAGE_SIZE, 0),
  })

  const revokeM = useMutation({
    mutationFn: revokeRuntime,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runtimes'] }),
  })

  const registrations = useMemo(() => fleetQ.data?.registrations ?? [], [fleetQ.data?.registrations])
  const versions = useMemo(
    () => Object.keys(fleetQ.data?.version_distribution ?? {}).sort(),
    [fleetQ.data?.version_distribution],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return registrations.filter((reg) => {
      if (status !== ALL_STATUS && reg.status !== status) return false
      if (version !== ALL_VERSION && reg.runtime_version !== version) return false
      if (!normalizedSearch) return true
      return registrationSearchText(reg).includes(normalizedSearch)
    })
  }, [registrations, search, status, version])

  const revokedCount = registrations.filter((r) => r.status === 'revoked').length

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Fleet"
        description="Company Agent machines reporting in."
        info="Every Company Agent installation reporting in — for fleet visibility and security, not billing. There is no limit on how many machines can register."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
            onClick={() => fleetQ.refetch()}
            disabled={fleetQ.isFetching}
          >
            <RefreshCw className={fleetQ.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Refresh
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6">
        {fleetQ.isLoading ? <LoadingState /> : null}
        {fleetQ.isError ? <ErrorState message={(fleetQ.error as Error).message} /> : null}
        {fleetQ.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric label="Total machines" value={String(fleetQ.data.total)} detail="Reported across all installs" icon={Server} />
              <SummaryMetric label="Stale (30d+)" value={String(fleetQ.data.stale_count)} detail="Haven't phoned home recently" icon={Activity} />
              <SummaryMetric label="Revoked" value={String(revokedCount)} detail="Flagged for security review" icon={Users} />
              <SummaryMetric label="Versions in the field" value={String(versions.length)} detail="Distinct agent versions" icon={Cpu} />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-black/20 p-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search hostname, user, install ID, or version"
                  className="h-9 border-white/10 bg-white/[0.03] pl-9 text-zinc-100"
                />
              </label>
              <label className="flex min-w-40 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">
                <Filter className="size-4 text-zinc-500" />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                >
                  <option value={ALL_STATUS}>All statuses</option>
                  <option value="active">Active</option>
                  <option value="stale">Stale</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>
              <label className="flex min-w-40 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">
                <Cpu className="size-4 text-zinc-500" />
                <select
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                >
                  <option value={ALL_VERSION}>All versions</option>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <FleetTable rows={filteredRows} onRevoke={(id) => revokeM.mutate(id)} revokingId={revokeM.isPending ? revokeM.variables : undefined} />

            {fleetQ.data.total > registrations.length ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                  onClick={() => setPages((p) => p + 1)}
                  disabled={fleetQ.isFetching}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
