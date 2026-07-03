import type { TrackingDashboardRange, TrackingDashboardResponse } from '@/api/pluginApi'
import type { Tone } from '@/lib/tone'

export const EMPTY_METRICS: TrackingDashboardResponse['metrics'] = {
  total_installs: 0,
  active_users: 0,
  active_companies: 0,
  total_executions: 0,
  executions_last_24h: 0,
  success_rate: 0,
  failed_executions: 0,
  recovery_rate: 0,
  average_execution_time: 0,
}

export const DEFAULT_RECOVERY_USAGE: TrackingDashboardResponse['recovery_type_usage'] = [
  { type: 'Selector', count: 0 },
  { type: 'Text Anchor', count: 0 },
  { type: 'Text Variant', count: 0 },
  { type: 'Vision', count: 0 },
]


export type DashboardHealth = {
  label: 'Healthy' | 'Degraded' | 'Attention needed' | 'No telemetry'
  tone: Tone
  description: string
}

export type RiskRow = {
  id: string
  type: 'Workflow' | 'Step'
  name: string
  context: string
  failedExecutions: number
  failureCode: string
  lastSeen: number
}

export function fmtNumber(value: number) {
  return new Intl.NumberFormat().format(value || 0)
}

export function fmtPercent(value: number) {
  return `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}%`
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

export function rangeLabel(range: TrackingDashboardRange) {
  return range === '30d' ? 'Last 30 days' : 'Last 7 days'
}

export function clampPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

export function deriveDashboardHealth(metrics: TrackingDashboardResponse['metrics']): DashboardHealth {
  if (metrics.total_executions === 0) {
    return {
      label: 'No telemetry',
      tone: 'neutral',
      description: 'Production runtime data will appear here after the first customer execution.',
    }
  }

  if (metrics.success_rate >= 95 && metrics.failed_executions === 0) {
    return {
      label: 'Healthy',
      tone: 'good',
      description: 'Executions are completing cleanly with no active failure pressure.',
    }
  }

  if (metrics.success_rate >= 85) {
    return {
      label: 'Degraded',
      tone: 'warn',
      description: 'Reliability is usable, but failures or recoveries need operator review.',
    }
  }

  return {
    label: 'Attention needed',
    tone: 'bad',
    description: 'Execution health is below target. Prioritize the risk queue before new rollout work.',
  }
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
