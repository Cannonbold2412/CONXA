import type { ReactNode } from 'react'
import type { StepEditorDTO, WorkflowResponse } from '@/types/workflow'
import { Badge } from '@/components/ui/badge'

type Props = {
  workflow: WorkflowResponse
  currentStep: StepEditorDTO | null
}

function Row({ label, value, wrap = false }: { label: string; value: ReactNode; wrap?: boolean }) {
  if (wrap) {
    // Full value on its own line, broken across lines — used for long identity hashes a
    // support engineer needs to read/copy in full rather than see truncated.
    return (
      <div className="space-y-0.5 border-b border-white/5 py-1.5 text-sm last:border-0">
        <span className="text-zinc-500">{label}</span>
        <span className="block font-mono text-xs break-all text-zinc-300">{value}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-xs text-zinc-300">{value}</span>
    </div>
  )
}

/**
 * Support/Conxa-engineer tier — integrity hashes, compile telemetry, and policy versioning that
 * are correctly kept out of an approver's way but shouldn't be entirely invisible either. Fed
 * by wf.compile_health (workflow-level) and the currently selected step's fingerprint (per-step
 * stable_hash/compat_fingerprint) — both read-only projections, never editable. See
 * research-analysis/Human-Edit-vs-Skill-Package.md §5.1's three-tier IA.
 */
export function DiagnosticsPanel({ workflow, currentStep }: Props) {
  const health = workflow.compile_health
  const routerStats = health.llm_router_stats && typeof health.llm_router_stats === 'object' ? health.llm_router_stats : {}
  const fingerprint = currentStep?.fingerprint

  return (
    <div className="space-y-5">
      <section className="space-y-1 rounded-lg border border-white/8 bg-black/20 p-3">
        <p className="mb-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Compile report</p>
        <Row label="Status" value={health.status || '—'} />
        <Row label="Steps total" value={health.steps_total ?? '—'} />
        <Row
          label="Min. confidence"
          value={typeof health.min_confidence === 'number' ? `${Math.round(health.min_confidence * 100)}%` : '—'}
        />
        <Row label="Steps with warnings" value={health.steps_with_warnings ?? 0} />
        <Row label="Compiler policy version" value={health.compiler_policy_version || '—'} />
        <Row label="Required runtime" value={health.required_runtime || '—'} />
        <Row label="Structural fingerprint" value={health.structural_fingerprint_present ? 'present' : 'absent'} />
      </section>

      {Object.keys(routerStats).length > 0 ? (
        <section className="space-y-1 rounded-lg border border-white/8 bg-black/20 p-3">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">LLM router stats</p>
          <pre className="overflow-x-auto font-mono text-xs leading-6 whitespace-pre-wrap text-zinc-400">
            {JSON.stringify(routerStats, null, 2)}
          </pre>
        </section>
      ) : null}

      <section className="space-y-1 rounded-lg border border-white/8 bg-black/20 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
          Selected step's identity hashes
          {currentStep ? (
            <Badge variant="outline" className="text-[0.6rem]">
              step #{currentStep.step_index + 1}
            </Badge>
          ) : null}
        </p>
        {!currentStep ? (
          <p className="text-sm text-zinc-500">Select a step to see its integrity hashes.</p>
        ) : !fingerprint || (!fingerprint.stable_hash && !fingerprint.compat_fingerprint) ? (
          <p className="text-sm text-zinc-500">No identity_bundle on this step (e.g. a recording marker).</p>
        ) : (
          <>
            <Row label="Stable hash" value={fingerprint.stable_hash || '—'} wrap />
            <Row label="Compat fingerprint" value={fingerprint.compat_fingerprint || '—'} wrap />
            <Row label="Frame depth" value={fingerprint.frame_depth} />
            <Row label="Shadow depth" value={fingerprint.shadow_depth} />
          </>
        )}
      </section>
    </div>
  )
}
