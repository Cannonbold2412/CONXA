/**
 * Pure state-derivation logic for the Release Center (Publish Skill Package page).
 *
 * Deliberately dependency-free (no imports from api/workflowsApi.ts, no React) so
 * it can be exercised directly by a plain node:test file without a bundler — see
 * electron/test/releaseState.test.js, run via
 * `node --experimental-strip-types test/releaseState.test.js`. Types below are a
 * minimal, structural subset of the real API response shapes (workflowsApi.ts),
 * not a re-export of them — any object with the right fields satisfies them.
 */

export type WorkflowTestLike = { last_test_status: 'passed' | 'failed' | 'never' }

export type CandidateReadiness = 'no_package' | 'needs_test' | 'ready'

/** What the "Release Candidate" section shows before any version/notes have
 * been typed: is there a package, and has the SELECTED skill been tested?
 * Mirrors the gate cmd_publish_skill_pack itself doesn't enforce (only the
 * RENDERER does — the backend allows publishing an untested skill if asked
 * directly), so this must stay a client-side-only convenience, not a security
 * boundary. Scoped to one workflow — a sibling workflow's test status never
 * affects this skill's readiness. */
export function deriveCandidateReadiness(hasPackage: boolean, workflow: WorkflowTestLike | null): CandidateReadiness {
  if (!hasPackage || !workflow) return 'no_package'
  return workflow.last_test_status === 'passed' ? 'ready' : 'needs_test'
}

export function isUntested(workflow: WorkflowTestLike | null): boolean {
  return workflow ? workflow.last_test_status !== 'passed' : true
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version)
}

/** Suggests the next patch release after the last one actually published. */
export function suggestNextVersion(lastPublished: string | null | undefined): string {
  const match = lastPublished?.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return '1.0.0'
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

// --- Permissions ------------------------------------------------------------

/** Mirrors the cloud's require_admin() (app/services/rbac.py) — publish and
 * rollback are admin/owner-only. The server enforces this regardless; this is
 * purely so the UI doesn't dangle a button that will just 403. */
export function canManageReleases(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'owner'
}

// --- Publish readiness --------------------------------------------------

export type PublishReadinessInput = {
  hasPackage: boolean
  allTestsPassed: boolean
  versionValid: boolean
  versionAvailable: boolean
  notesValid: boolean
  publishing: boolean
  canManage: boolean
}

export function canPublish(input: PublishReadinessInput): boolean {
  return (
    input.hasPackage &&
    input.allTestsPassed &&
    input.versionValid &&
    input.versionAvailable &&
    input.notesValid &&
    !input.publishing &&
    input.canManage
  )
}

// --- Publishing UX states (§13 of the release-system plan) -----------------

export type PublishUiState = 'idle' | 'publishing' | 'success' | 'failure'

export function derivePublishUiState(input: {
  publishing: boolean
  publishError: string
  publishDone: boolean
}): PublishUiState {
  if (input.publishing) return 'publishing'
  if (input.publishError) return 'failure'
  if (input.publishDone) return 'success'
  return 'idle'
}

export type PublishStage = 'validated' | 'uploading' | 'published' | 'failed' | 'skipped'
export type StageStepState = 'done' | 'active' | 'pending' | 'failed'

const STAGE_ORDER: PublishStage[] = ['validated', 'uploading', 'published']

const STAGE_LABELS: Record<PublishStage, string> = {
  validated: 'Validated package',
  uploading: 'Uploading to Conxa Cloud',
  published: 'Release created, stable channel updated',
  failed: 'Publish failed',
  skipped: 'Publish skipped (no cloud configured)',
}

export function stageLabel(stage: PublishStage): string {
  return STAGE_LABELS[stage]
}

/** Given the last stage event actually observed (from backend sink events — see
 * backend.py's `stage` field), derive done/active/pending for each step in the
 * checklist. Each `stage` event means that stage just COMPLETED, so the next
 * one in order is what's now active — never claims a step happened that wasn't
 * actually observed; a "failed"/"skipped" terminal event leaves every step
 * pending rather than guessing how far it got. */
export function stageChecklist(reachedStage: PublishStage | null): Array<{ stage: PublishStage; state: StageStepState }> {
  if (reachedStage === null || reachedStage === 'failed' || reachedStage === 'skipped') {
    return STAGE_ORDER.map((stage) => ({ stage, state: 'pending' as StageStepState }))
  }
  if (reachedStage === 'published') {
    return STAGE_ORDER.map((stage) => ({ stage, state: 'done' as StageStepState }))
  }
  const reachedIndex = STAGE_ORDER.indexOf(reachedStage)
  return STAGE_ORDER.map((stage, i) => {
    if (i <= reachedIndex) return { stage, state: 'done' as StageStepState }
    if (i === reachedIndex + 1) return { stage, state: 'active' as StageStepState }
    return { stage, state: 'pending' as StageStepState }
  })
}

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
 * labels layered on top, not a second count (a brand-new skill's steps already
 * flow into steps_added, see release_diff.py's docstring). */
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
 * duplicate-version gate. "ready" is uploaded and awaiting a Cloud admin's
 * Release/Deploy decision — see docs/App-Flow.md; Build Studio never acts on
 * it, only Cloud does. */
export function releaseBadge(row: ReleaseRowLike, currentStableVersion: string | null): ReleaseBadge {
  if (row.version === currentStableVersion) return 'stable'
  if (row.status === 'ready') return 'ready'
  if (row.status === 'pending') return 'failed'
  return 'superseded'
}

const BADGE_LABELS: Record<ReleaseBadge, string> = {
  stable: 'Published · Stable',
  ready: 'Ready for Release',
  superseded: 'Superseded',
  pending: 'Pending',
  failed: 'Failed',
}

export function releaseBadgeLabel(badge: ReleaseBadge): string {
  return BADGE_LABELS[badge]
}

