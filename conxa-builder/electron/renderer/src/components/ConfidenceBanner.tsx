import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SuggestionItem } from '@/types/workflow'

type Props = {
  suggestions: SuggestionItem[]
  totalSteps: number
  /** Opens the Suggestions tool tab so the user can act on what's flagged. */
  onReviewFlagged: () => void
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Headline trust signal at the top of Human Edit, promoting what today only lived one click
 * deep in the Suggestions tool tab (`SuggestionsInlinePanel`) into the page's first thing a user
 * sees — no new backend data, purely a client-side rollup of the same `wf.suggestions` list.
 * Matches the redesign doc's framing: "sees a confidence banner, fixes anything flagged, clicks
 * Approve" (conxa-builder-workflow-redesign.md line 227).
 */
export function ConfidenceBanner({ suggestions, totalSteps, onReviewFlagged }: Props) {
  const errorCount = suggestions.filter((s) => s.severity === 'error').length
  const warnCount = suggestions.filter((s) => s.severity === 'warn').length

  if (errorCount > 0) {
    return (
      <div className="border-status-error/30 bg-status-error/10 flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-status-error size-4 shrink-0" aria-hidden />
          <p className="text-status-error text-sm font-semibold">
            Fix {plural(errorCount, 'blocking issue')} before Approve
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onReviewFlagged}>
          Review
        </Button>
      </div>
    )
  }

  if (warnCount > 0) {
    return (
      <div className="border-status-warn/30 bg-status-warn/10 flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertCircle className="text-status-warn size-4 shrink-0" aria-hidden />
          <p className="text-status-warn text-sm font-medium">Review {plural(warnCount, 'flagged step')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onReviewFlagged}>
          Review
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('border-status-ok/20 bg-status-ok/5 flex items-center gap-2 border-b px-4 py-2.5')}>
      <CheckCircle2 className="text-status-ok size-4 shrink-0" aria-hidden />
      <p className="text-status-ok text-sm font-medium">Looks solid — {plural(totalSteps, 'step')} reviewed</p>
    </div>
  )
}
