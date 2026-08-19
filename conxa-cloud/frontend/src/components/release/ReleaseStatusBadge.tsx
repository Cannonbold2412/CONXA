'use client'

import { Badge } from '@/components/ui/badge'
import { releaseBadge, releaseBadgeLabel, type ReleaseRowLike } from '@/lib/releaseState'

// Cloud's Badge has no success/warning/info variants (unlike Build Studio's) —
// the established Cloud convention (see SkillPackageVersionsPage.tsx) is
// variant="outline" plus a color className per state.
const CLASS_NAME: Record<ReturnType<typeof releaseBadge>, string> = {
  stable: 'h-5 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300',
  ready: 'h-5 border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300',
  superseded: 'h-5 border-white/10 bg-white/[0.04] text-[10px] text-zinc-400',
  pending: 'h-5 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300',
  failed: 'h-5 border-red-500/30 bg-red-500/10 text-[10px] text-red-300',
}

/** One badge, one source of truth for "what is this release's state" — used
 * by the Ready for Release section and every row of the Release History table. */
export function ReleaseStatusBadge({
  row,
  currentStableVersion,
}: {
  row: ReleaseRowLike
  currentStableVersion: string | null
}) {
  const badge = releaseBadge(row, currentStableVersion)
  return (
    <Badge variant="outline" className={CLASS_NAME[badge]}>
      {releaseBadgeLabel(badge)}
    </Badge>
  )
}
