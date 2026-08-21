'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups } from '@/api/workflowsApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, PackageCheck } from 'lucide-react'
import { queryKeys } from '@/lib/queryKeys'

/** Skill Packages → Group: the workflows (skills) published under one group.
 * Click a workflow to reach its full release/deployment/rollback/audit page. */
export function GroupPage({ groupId }: { groupId: string }) {
  const groupsQ = useQuery({ queryKey: queryKeys.groups, queryFn: fetchGroups, staleTime: 15_000 })
  const groups = groupsQ.data?.groups ?? []
  const group = groups.find((g) => g.group_id === groupId)
  const isLoading = groupsQ.isLoading
  const isError = groupsQ.isError
  const error = groupsQ.error

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={group?.group_name || groupId || 'Ungrouped'}
        description="Skill group."
        info="A publishable group of related workflow skills for customer installation."
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white"
          >
            <Link href="/packages">
              <ChevronLeft className="size-3.5" />
              Back
            </Link>
          </Button>
        }
      />

      <main className="flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-lg border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error?.message}
          </div>
        ) : !group || group.workflows.length === 0 ? (
          <Card className="border-white/8 bg-white/[0.03] shadow-none">
            <CardContent className="flex flex-col items-center gap-2.5 py-9 text-center">
              <PackageCheck className="size-7 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">No workflows published in this group yet</p>
              <p className="max-w-xs text-xs text-zinc-500">
                Publish a workflow from Build Studio into this group to see it here as Ready for Release.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.workflows.map((w) => (
              <Link
                key={w.skill_slug}
                href={`/packages/groups/${encodeURIComponent(groupId)}/workflows/${encodeURIComponent(w.skill_slug)}`}
                className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <Card
                  size="sm"
                  className="h-full gap-0 border-white/8 bg-white/[0.035] py-3 shadow-none transition-colors group-hover:border-white/15 group-hover:bg-white/[0.05]"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate text-sm font-medium text-white">{w.workflow_name}</CardTitle>
                      {w.has_ready_version && (
                        <Badge variant="outline" className="h-5 shrink-0 border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300">
                          Ready for Release
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span className="font-mono">
                        {w.current_stable_version ? `v${w.current_stable_version}` : 'Not released'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-zinc-400 transition-colors group-hover:text-white">
                        Open
                        <ChevronRight className="size-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
