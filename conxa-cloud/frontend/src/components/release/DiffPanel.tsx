'use client'

import { useState } from 'react'
import { ChevronDown, Minus, PencilLine, Plus } from 'lucide-react'
import type { ReleaseDiff } from '@/api/workflowsApi'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { changeCounts, diffHeadline } from '@/lib/releaseState'
import { cn } from '@/lib/utils'

/** "What Will Change": the deterministic diff between a release candidate and
 * the previous published version — see release_diff.py. Same shape whether
 * it's a "ready" version awaiting release or an already-published release's
 * own diff. */
export function DiffPanel({
  diff,
  previousVersion,
}: {
  diff: ReleaseDiff
  previousVersion: string | null
}) {
  const [open, setOpen] = useState(false)
  const counts = changeCounts(diff)
  const hasSkillChanges = diff.skills_added.length > 0 || diff.skills_removed.length > 0
  const hasDetail = counts.total > 0 || hasSkillChanges || diff.recovery_changed_skills.length > 0

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">What Will Change</p>
      <p className="text-sm font-medium text-zinc-200">{diffHeadline(diff, previousVersion)}</p>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-300">
          <Plus className="size-3.5" /> {counts.added} added
        </span>
        <span className="flex items-center gap-1 text-amber-300">
          <PencilLine className="size-3.5" /> {counts.modified} modified
        </span>
        <span className="flex items-center gap-1 text-red-300">
          <Minus className="size-3.5" /> {counts.removed} removed
        </span>
        {diff.recovery_changed_skills.length > 0 && (
          <span className="text-zinc-400">
            ~{diff.recovery_changed_skills.length} recovery rule{diff.recovery_changed_skills.length !== 1 ? 's' : ''} changed
          </span>
        )}
      </div>

      {hasSkillChanges && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {diff.skills_added.map((slug) => (
            <span key={`add-${slug}`} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
              + {slug}
            </span>
          ))}
          {diff.skills_removed.map((slug) => (
            <span key={`rm-${slug}`} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
              − {slug}
            </span>
          ))}
        </div>
      )}

      {hasDetail && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleTrigger className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300">
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            {open ? 'Hide technical diff' : 'Show technical diff'}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="space-y-1.5 rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-[11px]">
              {Object.entries(diff.per_skill ?? {})
                .filter(([, entry]) => entry.status !== 'unchanged')
                .map(([slug, entry]) => (
                  <div key={slug} className="flex items-center justify-between gap-3 text-zinc-400">
                    <span className="truncate text-zinc-300">{slug}</span>
                    <span className="shrink-0">
                      {entry.status === 'added' && <span className="text-emerald-300">added</span>}
                      {entry.status === 'removed' && <span className="text-red-300">removed</span>}
                      {entry.status === 'changed' && (
                        <span>
                          +{entry.steps_added} ~{entry.steps_modified} -{entry.steps_removed}
                          {entry.recovery_changed ? ' · recovery' : ''}
                          {entry.metadata_changed ? ' · metadata' : ''}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
