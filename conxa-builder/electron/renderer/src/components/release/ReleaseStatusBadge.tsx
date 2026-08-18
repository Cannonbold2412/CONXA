import { Badge } from '@/components/ui/badge'
import { releaseBadge, releaseBadgeLabel, type ReleaseRowLike } from '@/lib/releaseState'

const VARIANT: Record<ReturnType<typeof releaseBadge>, 'success' | 'outline' | 'warning' | 'destructive'> = {
  stable: 'success',
  superseded: 'outline',
  pending: 'warning',
  failed: 'destructive',
}

/** One badge, one source of truth for "what is this release's state" — used by
 * both the Release Candidate card and every row of the Release History table. */
export function ReleaseStatusBadge({
  row,
  currentStableVersion,
}: {
  row: ReleaseRowLike
  currentStableVersion: string | null
}) {
  const badge = releaseBadge(row, currentStableVersion)
  return <Badge variant={VARIANT[badge]}>{releaseBadgeLabel(badge)}</Badge>
}
