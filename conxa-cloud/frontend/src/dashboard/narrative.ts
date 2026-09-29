/**
 * Plain-language layer for the Operations dashboard.
 *
 * Every section on the dashboard leads with a sentence that answers its question before the
 * chart shows the detail. Those sentences, the failure-code wording and the workflow status
 * thresholds all live here so they stay consistent across tabs — and so they can be tested
 * without a browser (`test/narrative.test.mjs`). Pure functions only; type imports only.
 */
import type {
  TrackingCascade,
  TrackingFailureCode,
  TrackingKpi,
  TrackingRoi,
  TrackingRunDetail,
  TrackingSeriesBucket,
  TrackingStepRow,
  TrackingWorkflowRow,
  TrackingWorkflowVersion,
} from '@/api/workflowsApi'

/** A sentence with emphasised spans — rendered by `Sentence` in SectionCard.tsx. */
export type Phrase = Array<string | { strong: string }>

const num = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value))
const pct = (value: number) => `${value.toFixed(1).replace(/\.0$/, '')}%`
const plural = (count: number, word: string) => `${num(count)} ${word}${count === 1 ? '' : 's'}`

// ── Failure codes ────────────────────────────────────────────────────────────────────────

/** Codes the runtime actually emits (`runtime/app/tracker.js::mapErrorToCode`, run.js, server.js). */
const FAILURE_LABELS: Record<string, string> = {
  selector_missing: 'Could not find a button or field',
  timeout: 'Page took too long',
  url_mismatch: 'Landed on the wrong page',
  navigation_failed: 'Could not open the page',
  auth_failure: 'Sign-in had expired or failed',
  tab_not_found: 'Expected tab never opened',
  entity_not_found: 'The record it needed was missing',
  bad_input: 'Received input it could not use',
  cancelled: 'Stopped by the user',
  unknown: 'Unknown reason',
}

/** Plain wording for a runtime failure code. Unmapped codes are de-snaked rather than hidden. */
export function failureLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown reason'
  const known = FAILURE_LABELS[code]
  if (known) return known
  const words = code.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown reason'
}

// ── Workflow status ──────────────────────────────────────────────────────────────────────

export const FAILING_BELOW = 80
export const SLIPPING_DROP = 3

export type WorkflowStatus = 'failing' | 'slipping' | 'healthy'

export function workflowStatus(row: Pick<TrackingWorkflowRow, 'success_rate' | 'success_rate_delta'>): WorkflowStatus {
  if (row.success_rate < FAILING_BELOW) return 'failing'
  if (row.success_rate_delta !== null && row.success_rate_delta <= -SLIPPING_DROP) return 'slipping'
  return 'healthy'
}

// ── KPI meaning ──────────────────────────────────────────────────────────────────────────

const KPI_WORDS: Record<string, [rising: string, falling: string]> = {
  executions: ['busier than before', 'quieter than before'],
  success_rate: ['better', 'worse'],
  failed_executions: ['more failures', 'fewer failures'],
  recovery_rate: ['healing more often', 'healing less often'],
  average_execution_time: ['slower', 'faster'],
}

/** The plain word after a KPI's delta, e.g. "fewer failures". */
export function kpiMeaning(kpi: Pick<TrackingKpi, 'key' | 'delta' | 'delta_pct'>): string {
  if (kpi.delta_pct === null) return 'no earlier data'
  if (kpi.delta === 0) return 'no change'
  const [rising, falling] = KPI_WORDS[kpi.key] ?? ['up', 'down']
  return kpi.delta > 0 ? rising : falling
}

// ── Overview ─────────────────────────────────────────────────────────────────────────────

export function overviewSentence(totalRuns: number, successRate: number, cascade: Pick<TrackingCascade, 'entered_recovery' | 'healed'>): Phrase {
  if (!totalRuns) return ['No runs in this period yet.']
  const head: Phrase = [{ strong: `${plural(totalRuns, 'run')}.` }, ` ${pct(successRate)} finished on their own`]
  if (!cascade.entered_recovery) return [...head, ', and nothing needed repairing.']
  return [
    ...head,
    ', and ',
    { strong: `${num(cascade.healed)} of ${num(cascade.entered_recovery)}` },
    ' breakages repaired themselves before anyone had to step in.',
  ]
}

export function trendAnswer(series: TrackingSeriesBucket[], granularity: 'hour' | 'day'): string {
  const total = series.reduce((sum, b) => sum + b.successful + b.failed, 0)
  if (!total || !series.length) return 'Nothing ran in this period.'
  const unit = granularity === 'hour' ? 'an hour' : 'a day'
  const head = `About ${num(total / series.length)} runs ${unit}.`
  const worst = series.reduce((a, b) => (b.failed > a.failed ? b : a))
  if (!worst.failed) return `${head} No failures.`
  const when = granularity === 'hour'
    ? new Date(worst.at).toLocaleTimeString([], { hour: 'numeric' })
    : new Date(worst.at).toLocaleDateString([], { weekday: 'long' })
  return `${head} Failures peaked ${granularity === 'hour' ? 'at' : 'on'} ${when}, with ${num(worst.failed)}.`
}

export function failingAnswer(failedByWorkflow: number[], totalFailed: number): string {
  if (!totalFailed || !failedByWorkflow.length) return 'Nothing failed in this period.'
  if (failedByWorkflow.length === 1) return 'Every failure came from one workflow.'
  const [first, second] = [...failedByWorkflow].sort((a, b) => b - a)
  const share = Math.round(((first + second) / totalFailed) * 100)
  return share >= 50
    ? `Two workflows cause ${Math.min(share, 100)}% of all failures.`
    : `Failures are spread across ${plural(failedByWorkflow.length, 'workflow')}.`
}

// ── Self-healing ─────────────────────────────────────────────────────────────────────────

export function healingAnswer(cascade: Pick<TrackingCascade, 'entered_recovery' | 'healed' | 'heal_rate'>): string {
  const { entered_recovery: entered, healed } = cascade
  if (!entered) return 'Nothing needed repairing in this period.'
  if (healed === entered) return `Yes — all ${plural(entered, 'step')} that broke were repaired automatically.`
  if (cascade.heal_rate >= 80) return `Yes. ${num(healed)} of the ${num(entered)} steps that broke were repaired automatically.`
  return `Not fully. Only ${num(healed)} of the ${num(entered)} steps that broke were repaired.`
}

export function healingSummary(cascade: Pick<TrackingCascade, 'entered_recovery' | 'healed' | 'zero_token_heals'>): Phrase {
  if (!cascade.entered_recovery) return ['Nothing needed repairing in this period — every step worked first time.']
  return [
    { strong: `${num(cascade.healed)} of ${num(cascade.entered_recovery)}` },
    ' breakages repaired themselves, and ',
    { strong: num(cascade.zero_token_heals) },
    ` of those repairs cost nothing.`,
  ]
}

// ── Workflows ────────────────────────────────────────────────────────────────────────────

export function workflowsSummary(rows: Array<Pick<TrackingWorkflowRow, 'success_rate' | 'success_rate_delta'>>): Phrase {
  if (!rows.length) return ['No workflows ran in this period.']
  const count = { healthy: 0, slipping: 0, failing: 0 }
  for (const row of rows) count[workflowStatus(row)] += 1
  return [
    `${plural(rows.length, 'workflow')} ran. `,
    { strong: `${num(count.healthy)} healthy` },
    `, ${num(count.slipping)} slipping, and ${num(count.failing)} failing.`,
  ]
}

export function workflowsAnswer(rows: Array<Pick<TrackingWorkflowRow, 'workflow' | 'success_rate_delta'>>): string {
  const worst = rows
    .filter((r) => r.success_rate_delta !== null && r.success_rate_delta < 0)
    .sort((a, b) => (a.success_rate_delta ?? 0) - (b.success_rate_delta ?? 0))[0]
  if (!worst) return 'Every workflow held or improved its success rate.'
  return `${worst.workflow} fell furthest — ${Math.abs(worst.success_rate_delta ?? 0)} points on the previous period.`
}

export function volumeAnswer(runsByWorkflow: number[]): string {
  const total = runsByWorkflow.reduce((a, b) => a + b, 0)
  if (!total) return 'Nothing ran in this period.'
  const sorted = [...runsByWorkflow].sort((a, b) => b - a)
  if (sorted.length > 3) {
    return `Three workflows carry ${Math.round(((sorted[0] + sorted[1] + sorted[2]) / total) * 100)}% of all runs.`
  }
  return `The busiest workflow carries ${Math.round((sorted[0] / total) * 100)}% of all runs.`
}

export function failureReasonsAnswer(codes: TrackingFailureCode[], totalFailed: number): string {
  if (!codes.length || !totalFailed) return 'No runs failed in this period.'
  const top = codes.reduce((a, b) => (b.count > a.count ? b : a))
  return `Most often: ${failureLabel(top.code).toLowerCase()} — ${num(top.count)} of ${num(totalFailed)} failures.`
}

// ── Impact ───────────────────────────────────────────────────────────────────────────────

export function impactSummary(hours: number, valueText: string): Phrase {
  if (!hours) return ['No time saved yet in this period — no run has finished unattended.']
  return ['About ', { strong: `${num(hours)} hours` }, ' of work returned — roughly ', { strong: valueText }, '.']
}

export function topReturnAnswer(byWorkflow: TrackingRoi['estimated']['by_workflow']): string {
  const total = byWorkflow.reduce((sum, w) => sum + w.hours_saved, 0)
  if (!total) return 'No successful runs to count yet.'
  const top = byWorkflow.reduce((a, b) => (b.hours_saved > a.hours_saved ? b : a))
  return `${top.workflow} returns the most — ${Math.round((top.hours_saved / total) * 100)}% of all time saved.`
}

// ── Workflow detail ──────────────────────────────────────────────────────────────────────

/** `versions` newest first, as the API sends them. Null when there is nothing to compare. */
export function versionAnswer(versions: TrackingWorkflowVersion[]): string | null {
  if (versions.length < 2) return null
  const [current, before] = versions
  const diff = current.success_rate - before.success_rate
  if (diff <= -SLIPPING_DROP) return `It hurt — success fell from ${pct(before.success_rate)} to ${pct(current.success_rate)}.`
  if (diff >= SLIPPING_DROP) return `It helped — success rose from ${pct(before.success_rate)} to ${pct(current.success_rate)}.`
  return `About the same — ${pct(before.success_rate)} before, ${pct(current.success_rate)} now.`
}

/** `steps` worst success rate first, as the API sends them. */
export function stepAnswer(steps: Array<Pick<TrackingStepRow, 'step_label' | 'success_rate'>>): string {
  if (!steps.length) return 'No step-level events reported yet.'
  const [worst, ...rest] = steps
  if (worst.success_rate >= 95) return 'Every step holds above 95%.'
  const tail = rest.length && rest.every((s) => s.success_rate >= 95) ? ' Every other step holds above 95%.' : ''
  return `${worst.step_label} succeeds ${pct(worst.success_rate)} of the time.${tail}`
}

export function workflowVerdict(
  summary: Pick<TrackingWorkflowRow, 'success_rate' | 'success_rate_delta'>,
  steps: Array<Pick<TrackingStepRow, 'step_label' | 'success_rate'>>,
): Phrase {
  const delta = summary.success_rate_delta
  const change = delta === null || delta === 0
    ? '.'
    : `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points on the previous period.`
  const weak = steps[0] && steps[0].success_rate < 90 ? [' ', { strong: steps[0].step_label }, ' is the weak link.'] : []
  return ['Succeeds ', { strong: `${pct(summary.success_rate)} of runs` }, change, ...weak]
}

// ── Run detail ───────────────────────────────────────────────────────────────────────────

export function runTitle(run: Pick<TrackingRunDetail, 'run_id' | 'summary' | 'steps'>): string {
  const id = run.run_id.slice(0, 8)
  const failed = run.steps.find((s) => s.status === 'failed')
  if (run.summary?.status === 'fail') return failed ? `Run ${id} stopped at step ${failed.index + 1}` : `Run ${id} failed`
  if (run.summary?.status === 'ok') return `Run ${id} finished`
  return `Run ${id} is running`
}

export function runAnswer(run: Pick<TrackingRunDetail, 'summary' | 'steps'>): string {
  const summary = run.summary
  if (!summary || summary.status === 'running') return 'Still running — results appear as steps report in.'
  if (summary.status === 'ok') {
    return summary.recovered_steps
      ? `Finished, with ${plural(summary.recovered_steps, 'step')} repaired automatically along the way.`
      : 'Finished without needing any repairs.'
  }
  const failed = run.steps.find((s) => s.status === 'failed')
  const where = failed ? `at “${failed.label}”` : 'before finishing'
  const tried = failed?.tiers.includes('Tier B')
    ? ' Free repairs and an AI agent both tried and could not recover it.'
    : failed?.tiers.length
      ? ' Free repairs tried and could not recover it.'
      : ''
  return `Stopped ${where}: ${failureLabel(summary.failure_code).toLowerCase()}.${tried}`
}
