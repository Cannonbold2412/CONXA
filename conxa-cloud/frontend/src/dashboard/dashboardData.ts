import type { TrackingDashboardResponse } from '@/api/workflowsApi'

export type RiskRow = {
  id: string
  type: 'Workflow' | 'Step'
  name: string
  context: string
  failedExecutions: number
  failureCode: string
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
    context: 'Workflow failure',
    failedExecutions: row.failed_executions,
    failureCode: row.last_failure_code || 'unknown failure',
    lastSeen: row.last_seen,
  }))

  const stepRows = data.most_failed_steps.map((row) => ({
    id: `step:${row.workflow}:${row.step_index ?? 'unknown'}:${row.step_label}`,
    type: 'Step' as const,
    name: row.step_label,
    context: `${row.workflow}${row.step_index === null ? '' : ` / step ${row.step_index + 1}`}`,
    failedExecutions: row.failed_executions,
    failureCode: row.last_failure_code || 'unknown failure',
    lastSeen: row.last_seen,
  }))

  return [...workflowRows, ...stepRows]
    .sort((a, b) => b.failedExecutions - a.failedExecutions || b.lastSeen - a.lastSeen)
    .slice(0, 8)
}
