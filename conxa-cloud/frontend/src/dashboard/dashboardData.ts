import type { TrackingDashboardResponse } from '@/api/workflowsApi'
import { failureLabel } from './narrative'

export type RiskRow = {
  id: string
  type: 'Workflow' | 'Step'
  name: string
  workflow: string
  failedExecutions: number
  /** Plain-language failure reason (`narrative.ts::failureLabel`). */
  reason: string
  lastSeen: number
}

/** `value || 0` used to turn a missing/NaN metric into a confident "0" — every
 *  number on the dashboard looked healthy even when the field never arrived.
 *  A real 0 still formats as "0"; only a genuinely absent value shows "—". */
export function fmtNumber(value: number) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat().format(value)
}

export function fmtPercent(value: number) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(1).replace(/\.0$/, '')}%`
}

export function fmtDuration(ms: number) {
  if (!ms) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`
  return `${Math.round(ms / 60_000)}m`
}

export function fmtRelative(epochMs: number) {
  if (!epochMs) return 'No timestamp'
  const diff = Date.now() - epochMs
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(epochMs).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function buildRiskRows(data?: TrackingDashboardResponse): RiskRow[] {
  if (!data) return []

  const workflowRows = data.most_failed_workflows.map((row) => ({
    id: `workflow:${row.workflow}`,
    type: 'Workflow' as const,
    name: row.workflow,
    workflow: row.workflow,
    failedExecutions: row.failed_executions,
    reason: failureLabel(row.last_failure_code),
    lastSeen: row.last_seen,
  }))

  // Step labels are the generic "Step N", so the workflow name carries the meaning.
  const stepRows = data.most_failed_steps.map((row) => ({
    id: `step:${row.workflow}:${row.step_index ?? 'unknown'}:${row.step_label}`,
    type: 'Step' as const,
    name: `${row.workflow} · ${row.step_label}`,
    workflow: row.workflow,
    failedExecutions: row.failed_executions,
    reason: failureLabel(row.last_failure_code),
    lastSeen: row.last_seen,
  }))

  return [...workflowRows, ...stepRows]
    .sort((a, b) => b.failedExecutions - a.failedExecutions || b.lastSeen - a.lastSeen)
    .slice(0, 8)
}
