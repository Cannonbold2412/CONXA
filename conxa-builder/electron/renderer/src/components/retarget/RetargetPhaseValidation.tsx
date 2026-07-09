import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
      {preview.fast_finish ? (
        <p className="text-status-ok text-sm">
          Selectors look strong and how this step is checked hasn&apos;t changed — no action needed, but
          you can still adjust the checks below.
        </p>
      ) : (
        <div>
          <p className="text-foreground text-sm font-medium">This step is confirmed done when:</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{describeWaitFor(effectiveWaitFor)}</p>
        </div>
      )}

      <AssertionEditorRows assertions={baseAssertions} onChange={onEditedAssertionsChange} />

      {preview.validation_changed ? (
        <label className="flex items-center gap-2 text-sm text-zinc-300">
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

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onApply} disabled={applying}>
          {applying ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </div>
  )
}
