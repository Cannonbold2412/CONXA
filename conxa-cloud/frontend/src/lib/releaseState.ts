/**
 * Pure state-derivation logic for Cloud's Release Center — the per-Workflow
 * page under Skill Packages → Group → Workflow. Cloud owns release, rollback,
 * and deployment status (see docs/App-Flow.md); Build Studio only publishes
 * an immutable "ready" version, it never derives any of this.
 *
 * Deliberately dependency-free (no imports from api/workflowsApi.ts, no
 * React), mirroring conxa-builder/electron/renderer/src/lib/releaseState.ts's
 * style. Types below are a minimal, structural subset of the real API
 * response shapes — any object with the right fields satisfies them.
 */

// --- Diff summarization ------------------------------------------------

export type ReleaseDiffLike = {
  steps_added: number
  steps_removed: number
  steps_modified: number
  skills_added: string[]
  skills_removed: string[]
  recovery_changed_skills: string[]
}

export type ChangeCounts = { added: number; modified: number; removed: number; total: number }

/** The single "N changes" number for the "What Will Change" section header —
 * step-level add/modify/remove only; skills_added/removed are informational
 * labels layered on top, not a second count. */
export function changeCounts(diff: ReleaseDiffLike): ChangeCounts {
  const { steps_added: added, steps_removed: removed, steps_modified: modified } = diff
  return { added, modified, removed, total: added + modified + removed }
}

export function diffHeadline(diff: ReleaseDiffLike, previousVersion: string | null): string {
  const { total } = changeCounts(diff)
  const from = previousVersion ? ` from v${previousVersion}` : ''
  if (total === 0 && diff.skills_added.length === 0 && diff.skills_removed.length === 0) {
    return `No changes${from}`
  }
  return `${total} change${total === 1 ? '' : 's'}${from}`
}

// --- Version history badges ---------------------------------------------

export type ReleaseRowLike = { version: string; status?: 'ready' | 'pending' | 'published' }

export type ReleaseBadge = 'stable' | 'ready' | 'superseded' | 'pending' | 'failed'

/** "Failed" here means an orphaned legacy "pending" row from a publish
 * attempt that crashed before ever reaching "ready" — see publish_routes.py's
 * duplicate-version gate. "ready" is the new, intentional steady state: a
 * published version awaiting an explicit Release/Deploy decision. */
export function releaseBadge(row: ReleaseRowLike, currentStableVersion: string | null): ReleaseBadge {
  if (row.version === currentStableVersion) return 'stable'
  if (row.status === 'ready') return 'ready'
  if (row.status === 'pending') return 'failed'
  return 'superseded'
}

const BADGE_LABELS: Record<ReleaseBadge, string> = {
  stable: 'Live · Stable',
  ready: 'Ready for Release',
  superseded: 'Superseded',
  pending: 'Pending',
  failed: 'Failed',
}

export function releaseBadgeLabel(badge: ReleaseBadge): string {
  return BADGE_LABELS[badge]
}

/** Only a version awaiting release ("ready") can be Released/Deployed —
 * matches the cloud's own guard (release_not_ready). */
export function canReleaseTo(row: ReleaseRowLike): boolean {
  return row.status === 'ready'
}

/** Only an already-published, non-current release can be rolled back to —
 * matches the cloud's own rollback guard (release_not_published / already_stable). */
export function canRollbackTo(row: ReleaseRowLike, currentStableVersion: string | null): boolean {
  return row.status === 'published' && row.version !== currentStableVersion
}

// --- Deployment ----------------------------------------------------------

export type DeploymentStatusLike = 'up_to_date' | 'pending' | 'failed' | 'offline' | 'unknown'

const DEPLOYMENT_LABELS: Record<DeploymentStatusLike, string> = {
  up_to_date: 'Healthy',
  pending: 'Updating',
  failed: 'Failed',
  offline: 'Offline',
  unknown: 'Unknown',
}

export function deploymentStatusLabel(status: DeploymentStatusLike): string {
  return DEPLOYMENT_LABELS[status]
}

export type DeploymentSummaryLike = {
  total: number
  up_to_date: number
  pending: number
  failed: number
  offline: number
  unknown: number
}

/** Percentage of registered machines currently on the desired (stable)
 * version, rounded — 0 when there's nothing to report rather than NaN. */
export function upToDatePercent(summary: DeploymentSummaryLike): number {
  if (summary.total <= 0) return 0
  return Math.round((summary.up_to_date / summary.total) * 100)
}
