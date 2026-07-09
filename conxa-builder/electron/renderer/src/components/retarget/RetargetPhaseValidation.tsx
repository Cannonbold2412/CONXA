import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2, ListChecks } from 'lucide-react'
import type { RetargetPreviewResponse } from '@/api/workflowApi'
import {
  AssertionEditorRows,
  describeWaitFor,
  type AssertionDraft,
} from '@/components/validation/AssertionEditor'

export type { AssertionDraft } from '@/components/validation/AssertionEditor'

type Props = {
  preview: RetargetPreviewResponse
  keepValidation: boolean
  onKeepValidationChange: (value: boolean) => void
  /** Human edits to the assertion list, or null to use the current/proposed default. */
  editedAssertions: AssertionDraft[] | null
  onEditedAssertionsChange: (assertions: AssertionDraft[] | null) => void
  onBack: () => void
  onApply: () => void
  applying: boolean
}

export function RetargetPhaseValidation({
  preview,
  keepValidation,
  onKeepValidationChange,
  editedAssertions,
  onEditedAssertionsChange,
  onBack,
  onApply,
  applying,
}: Props) {
  const baseAssertions = (
    editedAssertions ?? ((preview.validation_changed && !keepValidation ? preview.proposed_assertions : preview.current_assertions) as AssertionDraft[])
  )
  const effectiveWaitFor = preview.validation_changed && !keepValidation ? preview.proposed_wait_for : preview.current_wait_for

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300">
          <ListChecks className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Outcome checks</p>
          <p className="text-xs text-zinc-500">What confirms this step succeeded</p>
        </div>
      </div>

      {preview.fast_finish ? (
        <div className="border-status-ok/25 bg-status-ok/8 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
          <CheckCircle2 className="text-status-ok mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-status-ok text-sm leading-snug">
            Selectors look strong and how this step is checked hasn&apos;t changed — no action needed, but
            you can still adjust the checks below.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
          <p className="text-foreground text-sm font-medium">This step is confirmed done when:</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{describeWaitFor(effectiveWaitFor)}</p>
        </div>
      )}

      <AssertionEditorRows assertions={baseAssertions} onChange={onEditedAssertionsChange} />

      {preview.validation_changed ? (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/[0.035]">
          <Checkbox
            checked={keepValidation}
            onCheckedChange={(checked) => {
              onKeepValidationChange(Boolean(checked))
              onEditedAssertionsChange(null) // switching base list — drop in-progress edits
            }}
          />
          Keep the existing wait condition instead of the proposed one
        </label>
      ) : null}

      <div className="border-border/60 flex justify-between border-t pt-3">
        <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08] hover:text-white" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="brand" onClick={onApply} disabled={applying}>
          {applying ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </div>
  )
}
