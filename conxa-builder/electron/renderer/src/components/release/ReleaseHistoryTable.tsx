import { useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import type { RollbackResult, SkillPackVersion } from '@/api/workflowsApi'
import { canRollbackTo } from '@/lib/releaseState'
import { ReleaseStatusBadge } from './ReleaseStatusBadge'
import { RollbackDialog } from './RollbackDialog'

function formatTimestamp(seconds: number): string {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleString()
}

/** Section 4 — Release History. Answers, in order: what's current, what
 * existed before, who published it, when, what changed, is it deployed, can I
 * roll back — see the release-system plan §20. */
export function ReleaseHistoryTable({
  versions,
  currentStableVersion,
  isLoading,
  onRolledBack,
  onSelectVersion,
}: {
  versions: SkillPackVersion[]
  currentStableVersion: string | null
  isLoading: boolean
  onRolledBack: (result: RollbackResult) => void
  onSelectVersion: (version: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="text-xs">Loading release history…</span>
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
        <p className="text-xs text-zinc-500">No releases published yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const isExpanded = expanded === v.version
        return (
          <div key={v.version} className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => {
                setExpanded(isExpanded ? null : v.version)
                onSelectVersion(v.version)
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-medium text-sky-300">
                  v{v.version}
                </span>
                <ReleaseStatusBadge row={v} currentStableVersion={currentStableVersion} />
                {v.published_by?.name && (
                  <span className="truncate text-[11px] text-zinc-500">by {v.published_by.name}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-600">
                <Clock className="size-3" />
                {formatTimestamp(v.published_at)}
              </div>
            </button>
            {v.release_notes && <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{v.release_notes}</p>}

            {isExpanded && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                  <span>{v.skills.length} skill{v.skills.length !== 1 ? 's' : ''}</span>
                  {v.file_count != null && <span>{v.file_count} files</span>}
                  {v.artifact_sha256 && (
                    <span className="font-mono" title={v.artifact_sha256}>
                      sha256 {v.artifact_sha256.slice(0, 12)}…
                    </span>
                  )}
                </div>
                {canRollbackTo(v, currentStableVersion) && (
                  <RollbackDialog version={v.version} currentStableVersion={currentStableVersion} onRolledBack={onRolledBack} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
