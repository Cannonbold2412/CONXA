import { Loader2 } from 'lucide-react'
import type { ReleaseEvent } from '@/api/workflowsApi'

const ACTION_LABELS: Record<string, string> = {
  skill_version_created: 'Created version',
  skill_publish_started: 'Started publishing',
  skill_publish_succeeded: 'Published',
  skill_publish_failed: 'Publish failed',
  stable_channel_changed: 'Stable channel updated',
  rollback_started: 'Started rollback',
  rollback_completed: 'Rolled back',
}

function describeEvent(event: ReleaseEvent): string {
  const label = ACTION_LABELS[event.action] ?? event.action
  const version = event.metadata?.version ?? event.metadata?.to
  return typeof version === 'string' ? `${label} v${version}` : label
}

function formatTimestamp(seconds: number): string {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleString()
}

/** Section 6 — Audit. Every consequential release action, never fabricated —
 * this is release_channel.list_release_events() verbatim, not a synthesized
 * timeline. */
export function ReleaseAuditLog({ events, isLoading }: { events: ReleaseEvent[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="text-xs">Loading audit trail…</span>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
        <p className="text-xs text-zinc-500">No release activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.02] px-3 py-2 text-xs"
        >
          <span className="text-zinc-300">{describeEvent(event)}</span>
          <span className="shrink-0 text-[11px] text-zinc-600">{formatTimestamp(event.created_at)}</span>
        </div>
      ))}
    </div>
  )
}
