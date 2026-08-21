'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchSkillPack, fetchGroups } from '@/api/workflowsApi'
import { fetchEntitlements } from '@/api/productApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OpenInStudioButton } from '@/components/OpenInStudioButton'
import { StudioDownloadDialog } from '@/components/StudioDownloadDialog'
import { ChevronRight, Download, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { queryKeys } from '@/lib/queryKeys'

function formatCount(value: number | null | undefined) {
  if (value == null) return 'Unlimited'
  return new Intl.NumberFormat().format(value)
}

function CompileCreditsSummary() {
  const q = useQuery({ queryKey: queryKeys.entitlements, queryFn: fetchEntitlements, staleTime: 30_000, retry: 1 })
  const meter = q.data?.meters?.compile_credits

  if (q.isLoading) {
    return (
      <div className="flex h-9 min-w-56 items-center border-l border-white/10 pl-4">
        <div className="space-y-1.5">
          <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-2.5 w-28 animate-pulse rounded bg-white/[0.06]" />
        </div>
      </div>
    )
  }

  if (q.isError || !meter) {
    return (
      <div className="flex h-9 min-w-56 items-center justify-between gap-4 border-l border-white/10 pl-4">
        <div className="leading-none">
          <p className="text-[11px] font-medium text-zinc-500">Compile credits</p>
          <p className="mt-1 text-[11px] text-amber-300">Usage unavailable</p>
        </div>
      </div>
    )
  }

  const usage = meter.unlimited ? formatCount(meter.used) : `${formatCount(meter.used)} / ${formatCount(meter.limit)}`
  const capacity = meter.unlimited ? 'Unlimited this month' : `${formatCount(meter.remaining)} left this month`

  return (
    <div className="flex h-9 min-w-56 items-center justify-between gap-4 border-l border-white/10 pl-4">
      <div className="leading-none">
        <p className="text-[11px] font-medium text-zinc-500">Compile credits</p>
        <p className="mt-1 text-[11px] text-zinc-600">{capacity}</p>
      </div>
      <div className="whitespace-nowrap text-right">
        <span className="text-sm font-semibold text-white">{usage}</span>
        <span className="ml-1 text-xs text-zinc-500">used</span>
      </div>
    </div>
  )
}

export function SkillPackagesPage() {
  const [downloadOpen, setDownloadOpen] = useState(false)
  const packQ = useQuery({ queryKey: queryKeys.skillPack, queryFn: fetchSkillPack, staleTime: 10_000 })
  const groupsQ = useQuery({ queryKey: queryKeys.groups, queryFn: fetchGroups, staleTime: 15_000 })
  const groups = groupsQ.data?.groups ?? []

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Skill Packages"
        description={
          groupsQ.isSuccess && groups.length > 0
            ? `${groups.length} group${groups.length !== 1 ? 's' : ''}`
            : 'Groups of published skills for customer installation.'
        }
        actions={
          <>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white"
            >
              <Link href="/packages/installer">Installer</Link>
            </Button>
            <OpenInStudioButton label="Open Build Studio" primary />
            <CompileCreditsSummary />
          </>
        }
      />
      <div className="flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
        {packQ.isLoading || groupsQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Card key={item} size="sm" className="gap-0 border-white/8 bg-white/[0.03] py-3 shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                      <div className="h-3 w-44 animate-pulse rounded bg-white/[0.06]" />
                    </div>
                    <div className="h-5 w-14 animate-pulse rounded-full bg-white/[0.06]" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="h-3 w-36 animate-pulse rounded bg-white/[0.06]" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groupsQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {(groupsQ.error as Error).message}
          </div>
        ) : groups.length === 0 ? (
          <Card className="border-white/8 bg-white/[0.03] shadow-none">
            <CardContent className="flex flex-col items-center gap-2.5 py-9 text-center">
              <FolderOpen className="size-7 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">No groups yet</p>
              <p className="max-w-xs text-xs text-zinc-500">
                Create a group in Build Studio — it appears here immediately, even before any
                workflow is published.
              </p>
              <OpenInStudioButton label="Open Build Studio" primary />
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white gap-1.5"
                onClick={() => setDownloadOpen(true)}
              >
                <Download className="size-3.5" />
                Download Build Studio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const readyCount = g.workflows.filter((w) => w.has_ready_version).length
              return (
                <Link
                  key={g.group_id || '_ungrouped'}
                  href={`/packages/groups/${encodeURIComponent(g.group_id)}`}
                  className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  <Card
                    size="sm"
                    className="h-full gap-0 border-white/8 bg-white/[0.035] py-3 shadow-none transition-colors group-hover:border-white/15 group-hover:bg-white/[0.05]"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-sm font-medium text-white">
                            {g.group_name || g.group_id || 'Ungrouped'}
                          </CardTitle>
                        </div>
                        {readyCount > 0 && (
                          <Badge variant="outline" className="h-5 shrink-0 border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300">
                            {readyCount} ready
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span>
                          {g.workflows.length} workflow{g.workflows.length !== 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-zinc-400 transition-colors group-hover:text-white">
                          Open
                          <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <StudioDownloadDialog open={downloadOpen} onOpenChange={setDownloadOpen} />
    </div>
  )
}
