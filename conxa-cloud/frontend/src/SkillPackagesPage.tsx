'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchSkillPack, fetchGroups, type Group, type GroupWorkflowSummary } from '@/api/workflowsApi'
import { fetchEntitlements } from '@/api/productApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OpenInStudioButton } from '@/components/OpenInStudioButton'
import { StudioDownloadDialog } from '@/components/StudioDownloadDialog'
import { Download, FolderKanban, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys'

function formatCount(value: number | null | undefined) {
  if (value == null) return 'Unlimited'
  return new Intl.NumberFormat().format(value)
}

/** ● published · ○ not yet released — glyph carries status as well as colour. */
function workflowGlyph(w: GroupWorkflowSummary) {
  return w.has_ready_version ? '●' : '○'
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

/** What's actually in the folder — a preview of the published workflows. */
function FolderContents({ group }: { group: Group }) {
  const preview = group.workflows.slice(0, 4)
  const hidden = group.workflows.length - preview.length

  if (group.workflows.length === 0) {
    return (
      <p className="text-xs text-zinc-600">
        Empty — publish a workflow from Build Studio to fill this folder.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {preview.map((w) => (
        <li key={w.skill_slug} className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={cn(
              'shrink-0 text-[11px] leading-none',
              w.has_ready_version ? 'text-emerald-400' : 'text-zinc-500',
            )}
          >
            {workflowGlyph(w)}
          </span>
          <span className="min-w-0 flex-1 truncate text-zinc-300">{w.workflow_name}</span>
          <span className="shrink-0 text-[0.6875rem] text-zinc-600">
            {w.has_ready_version ? 'Ready' : 'Draft'}
          </span>
        </li>
      ))}
      {hidden > 0 && <li className="pl-4 text-[0.6875rem] text-zinc-600">+{hidden} more</li>}
    </ul>
  )
}

/** A group rendered as an actual folder — the tab notch is cut out of the card
 * itself (see `.folder-card` in index.css), not drawn on top of a rectangle.
 * Mirrors the Workflows page folder cards in Build Studio. */
function FolderCard({ group }: { group: Group }) {
  const released = group.workflows.filter((w) => w.has_ready_version).length
  const summary =
    group.workflows.length === 0
      ? 'No workflows yet'
      : `${released} of ${group.workflows.length} published`

  return (
    <Link
      href={`/packages/groups/${encodeURIComponent(group.group_id || '_ungrouped')}`}
      aria-label={`${group.group_name || 'Ungrouped'} — ${summary}`}
      className="group block focus-visible:outline-none"
    >
      <span
        className={cn(
          'folder-card relative flex h-full flex-col rounded-[10px] bg-white/10 text-left',
          'transition-[transform,background-color] duration-150 ease-out',
          'group-hover:-translate-y-0.5 group-hover:bg-white/20 motion-reduce:transform-none motion-reduce:transition-none',
        )}
      >
        {/* Inner layer — opaque so it masks the outer layer, leaving only a
            hairline of it visible as an outline that follows the folder edge. */}
        <span
          aria-hidden
          className={cn(
            'folder-card-inner absolute inset-px rounded-[10px] bg-card transition-colors duration-150',
            'group-hover:bg-accent',
          )}
        />

        <span className="absolute left-4 top-0 flex h-[26px] max-w-[150px] items-center truncate text-[0.6875rem] font-medium text-zinc-400">
          {group.workflows.length} workflow{group.workflows.length === 1 ? '' : 's'}
        </span>

        <div className="folder-body relative flex h-full flex-col gap-4 px-4 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors group-hover:border-sky-500/40 group-hover:text-sky-300">
              <FolderKanban className="size-4" />
            </span>
            <p className="min-w-0 flex-1 truncate text-base font-semibold text-white">
              {group.group_name || group.group_id || 'Ungrouped'}
            </p>
          </div>

          <div className="flex-1 border-t border-white/10 pt-3">
            <FolderContents group={group} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className={cn(
                  'text-[13px] leading-none',
                  released > 0 ? 'text-emerald-400' : 'text-amber-400',
                )}
              >
                {released > 0 ? '●' : '▲'}
              </span>
              <span className={released > 0 ? 'text-emerald-400' : 'text-amber-400'}>{summary}</span>
            </div>
          </div>
        </div>
      </span>
    </Link>
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
            : 'Published skills for customers.'
        }
        info="Groups of published skills that customers install via the Company Agent."
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
          <div className="folder-grid">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="folder-card rounded-[10px] bg-white/10">
                <div className="folder-body relative flex h-full flex-col gap-4 px-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="size-9 animate-pulse rounded-lg bg-white/[0.06]" />
                    <div className="h-4 w-32 animate-pulse rounded bg-white/[0.08]" />
                  </div>
                  <div className="flex-1 space-y-2 border-t border-white/10 pt-3">
                    <div className="h-3 w-44 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-3 w-36 animate-pulse rounded bg-white/[0.05]" />
                  </div>
                </div>
              </div>
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
          <div className="folder-grid">
            {groups.map((g) => (
              <FolderCard key={g.group_id || '_ungrouped'} group={g} />
            ))}
          </div>
        )}
      </div>

      <StudioDownloadDialog open={downloadOpen} onOpenChange={setDownloadOpen} />
    </div>
  )
}
