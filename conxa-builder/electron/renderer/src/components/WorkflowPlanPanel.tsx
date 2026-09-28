import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { SECTION_LABEL } from '@/lib/fieldStyles'
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
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Goal</p>
          <p className="text-base leading-normal text-zinc-100">{goal}</p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className={cn(goal && 'border-t border-white/8 pt-4')}>
          <p className={SECTION_LABEL}>Step-by-step intent ({steps.length})</p>
          <ol>
            {steps.map((s) => (
              <li key={s.index} className="flex gap-3.5 border-b border-white/8 py-3.5">
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-white/15 text-xs text-zinc-500">
                  {s.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-zinc-100">{s.intent || '(no intent recorded)'}</span>
                  {s.verification_anchor ? (
                    <span className="mt-1 block text-xs text-zinc-500">Verifies: {s.verification_anchor}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {decisionPoints.length > 0 || hasEndState ? (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
              Advanced
              <ChevronRight className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-90')} aria-hidden />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-3">
            {decisionPoints.length > 0 ? (
              <div className="space-y-2">
                <p className={SECTION_LABEL}>
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
                <p className={SECTION_LABEL}>Expected end state</p>
                <ul className="flex flex-wrap gap-1.5">
                  {Object.entries(expectedEndState).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="max-w-full font-mono text-xs break-all whitespace-normal">
                      {key}: {String(value)}
                    </Badge>
                  ))}
                </ul>
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
