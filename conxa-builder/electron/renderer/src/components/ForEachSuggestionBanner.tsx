import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { acceptForEachSuggestion, errorMessage, rejectForEachSuggestion } from '@/api/workflowApi'
import type { ForEachSuggestion, WorkflowRevalidationResponse } from '@/types/workflow'

type Props = {
  skillId: string
  suggestions: ForEachSuggestion[]
  onAccepted: (result: WorkflowRevalidationResponse) => void
}

/**
 * A compiler-computed "generalize this to a loop" suggestion (compiler/loop_suggestion.py) —
 * deterministic, no LLM, unlike the Copilot chat proposals ProposalCard.tsx renders. Shown
 * always-visible the moment Human Edit loads (not gated behind opening the Copilot panel),
 * since a reviewer should see "this workflow could handle any number of files" without first
 * knowing to ask. Same accept/reject/undo/edit-log governance as every other compiler
 * suggestion in this app: propose, never auto-apply.
 */
export function ForEachSuggestionBanner({ skillId, suggestions, onAccepted }: Props) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const visible = suggestions.filter((s) => !dismissedIds.has(s.id))
  if (visible.length === 0) return null

  const accept = async (suggestion: ForEachSuggestion) => {
    setBusyId(suggestion.id)
    try {
      const result = await acceptForEachSuggestion(skillId, suggestion)
      onAccepted(result)
      toast.success('Generalized to a loop')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not apply this suggestion'))
    } finally {
      setBusyId(null)
    }
  }

  const dismiss = async (suggestion: ForEachSuggestion) => {
    setBusyId(suggestion.id)
    try {
      await rejectForEachSuggestion(skillId, suggestion)
      setDismissedIds((prev) => new Set(prev).add(suggestion.id))
    } catch (err) {
      toast.error(errorMessage(err, 'Could not dismiss this suggestion'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-white/8 bg-white/[0.02] px-4 py-2.5 sm:px-6">
      {visible.map((suggestion) => (
        <div key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="min-w-0 flex-1 text-zinc-300">{suggestion.why}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="brand"
              size="sm"
              className="h-7"
              disabled={busyId !== null}
              onClick={() => accept(suggestion)}
            >
              {busyId === suggestion.id ? 'Applying…' : 'Accept'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={busyId !== null}
              onClick={() => dismiss(suggestion)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
