import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CheckCircle2, ListChecks } from 'lucide-react'
import type { RetargetPreviewResponse } from '@/api/workflowApi'
import type { StepEditorDTO } from '@/types/workflow'
import {
  AssertionEditorRows,
  ExpectedOutcomeSummary,
  describeWaitFor,
  hasInvalidAssertions,
  type AssertionDraft,
} from '@/components/validation/AssertionEditor'

export type { AssertionDraft } from '@/components/validation/AssertionEditor'

type Props = {
  step: StepEditorDTO
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
  step,
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
  const invalid = hasInvalidAssertions(baseAssertions)

  // Toggling "keep existing" swaps which assertion list is authoritative, which would silently
  // drop any in-progress edits — confirm first instead of discarding them without warning.
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null)

  const applyKeepValidation = (checked: boolean) => {
    onKeepValidationChange(checked)
    onEditedAssertionsChange(null)
  }

  const handleKeepValidationToggle = (checked: boolean) => {
    if (editedAssertions !== null) {
      setPendingToggle(checked)
      return
    }
    applyKeepValidation(checked)
  }

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
            onCheckedChange={(checked) => handleKeepValidationToggle(Boolean(checked))}
          />
          Keep the existing wait condition instead of the proposed one
        </label>
      ) : null}

      {/* Read-only recap of the step's currently-COMPILED expected outcome (as it stands right
          now, separate from whatever's being proposed/edited above) — so it's visible without
          leaving this phase. Never writes anything, so it can't conflict with the editable
          checks above it. */}
      <ExpectedOutcomeSummary step={step} />

      <div className="border-border/60 flex items-center justify-between gap-3 border-t pt-3">
        <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08] hover:text-white" onClick={onBack}>
          ← Back
        </Button>
        <div className="flex items-center gap-2.5">
          {invalid ? <p className="text-destructive text-xs">Fill in the missing checks above before applying.</p> : null}
          <Button variant="brand" onClick={onApply} disabled={applying || invalid}>
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </div>

      <AlertDialog open={pendingToggle !== null} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your edits to the outcome checks?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching to {pendingToggle ? 'the existing' : 'the proposed'} wait condition replaces the checks
              above with that version&apos;s defaults. The changes you just made here will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingToggle(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingToggle !== null) applyKeepValidation(pendingToggle)
                setPendingToggle(null)
              }}
            >
              Discard edits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
