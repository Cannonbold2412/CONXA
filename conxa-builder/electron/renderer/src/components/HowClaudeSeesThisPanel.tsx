import { Badge } from '@/components/ui/badge'
import type { WorkflowResponse } from '@/types/workflow'
import { rowsFromServerInputs } from '@/lib/skillInputVariables'
import { compactStepLabel } from '@/lib/workflowViewerHelpers'

type Props = {
  workflow: WorkflowResponse
}

/**
 * Builds a readable approximation of the skill's natural-language description from the step
 * descriptions already in the workflow — the same source data a customer's Claude Desktop draws
 * on, but not the exact generated string (that's assembled from `inputs.json`'s own description
 * field when the skill is published — see `runtime/server.js`'s per-skill tool description and
 * `conxa_compile/skill_package_builder_output.py`). Deliberately honest about being a summary rather
 * than claiming to be verbatim.
 */
function synthesizeDescription(steps: WorkflowResponse['steps']): string {
  if (steps.length === 0) return 'No steps recorded yet.'
  const MAX_STEPS = 5
  const shown = steps
    .slice(0, MAX_STEPS)
    .map((s) => compactStepLabel(s.human_readable_description))
    .filter(Boolean)
  const remaining = steps.length - shown.length
  const summary = shown.join('; then ')
  return remaining > 0 ? `${summary}; and ${remaining} more step${remaining === 1 ? '' : 's'}.` : `${summary}.`
}

/** Right-rail preview of the "agent contract" — what a customer's Claude Desktop understands
 *  about this skill (name, description, required inputs) — sourced entirely from data already
 *  fetched for this page; read-only, no new backend calls. */
export function HowClaudeSeesThisPanel({ workflow }: Props) {
  const title =
    typeof workflow.package_meta.title === 'string' && workflow.package_meta.title.trim()
      ? workflow.package_meta.title.trim()
      : workflow.skill_id
  const description = synthesizeDescription(workflow.steps)
  const inputRows = rowsFromServerInputs(workflow.inputs)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Name</p>
        <p className="text-sm font-medium text-white">{title}</p>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Description</p>
        <p className="text-sm leading-relaxed text-zinc-300">{description}</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
          Required inputs{inputRows.length > 0 ? ` (${inputRows.length})` : ''}
        </p>
        {inputRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No inputs — this skill runs with no customer-supplied values.</p>
        ) : (
          <ul className="space-y-1.5">
            {inputRows.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 text-sm"
              >
                <span className="text-zinc-200">{row.label || row.id}</span>
                <Badge variant="secondary" className="font-mono text-[0.65rem]">{`{{${row.id}}}`}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
