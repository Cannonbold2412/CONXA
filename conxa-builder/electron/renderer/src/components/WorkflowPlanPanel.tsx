import { Badge } from '@/components/ui/badge'
import type { WorkflowResponse } from '@/types/workflow'

type Props = {
  workflow: WorkflowResponse
}

/**
 * Read-only "Workflow plan" review pane — surfaces the compiled intent_graph (goal, per-step
 * intent + verification anchor, decision points, expected end state), computed once per compile
 * but never shown to Human Edit before this redesign. This is the natural top of the Approve
 * flow: confirming the *plan*, not just the individual steps. See
 * research-analysis/Human-Edit-vs-Skill-Package.md §4 item 2.
 */
export function WorkflowPlanPanel({ workflow }: Props) {
  const graph = workflow.intent_graph
  const goal = typeof graph.goal === 'string' ? graph.goal.trim() : ''
  const steps = Array.isArray(graph.steps) ? graph.steps : []
  const decisionPoints = Array.isArray(graph.decision_points) ? graph.decision_points : []
  const expectedEndState =
    graph.expected_end_state && typeof graph.expected_end_state === 'object' ? graph.expected_end_state : {}
  const hasEndState = Object.keys(expectedEndState).length > 0

  if (!goal && steps.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No workflow plan was recorded for this skill (it may have been compiled before intent-graph
        generation was added, or compiled without an LLM router configured).
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {goal ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Goal</p>
          <p className="text-sm leading-relaxed text-zinc-200">{goal}</p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Step-by-step intent ({steps.length})
          </p>
          <ol className="space-y-1.5">
            {steps.map((s) => (
              <li
                key={s.index}
                className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 text-sm"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[0.65rem] text-zinc-500">
                  {s.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-zinc-200">{s.intent || '(no intent recorded)'}</span>
                  {s.verification_anchor ? (
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      Verify: <span className="text-zinc-400">{s.verification_anchor}</span>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {decisionPoints.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Decision points ({decisionPoints.length})
          </p>
          <ul className="space-y-1.5">
            {decisionPoints.map((dp, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 font-mono text-xs break-all whitespace-pre-wrap text-zinc-400"
              >
                {JSON.stringify(dp)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasEndState ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Expected end state</p>
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(expectedEndState).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="max-w-full font-mono text-[0.65rem] break-all whitespace-normal">
                {key}: {String(value)}
              </Badge>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
