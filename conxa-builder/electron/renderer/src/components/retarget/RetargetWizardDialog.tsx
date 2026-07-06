import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BuildPipelineStepper, type PipelineStep } from '@/components/build/BuildPipelineStepper'
import { errorMessage, retargetApply, retargetPreview, type Bbox, type RetargetPreviewResponse } from '@/api/workflowApi'
import { CmdError } from '@/lib/ipc'
import type { StepEditorDTO, WorkflowResponse } from '@/types/workflow'
import { RetargetPhasePick } from './RetargetPhasePick'
import { RetargetPhaseSelectors } from './RetargetPhaseSelectors'
import { RetargetPhaseValidation } from './RetargetPhaseValidation'

type Phase = 1 | 2 | 3

type Props = {
  open: boolean
  step: StepEditorDTO
  skillId: string
  onOpenChange: (open: boolean) => void
  onApplied: (workflow: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
}

const PHASE_LABELS = ['Pick element', 'Review selectors', 'Confirm & apply']

export function RetargetWizardDialog({ open, step, skillId, onOpenChange, onApplied, onHistoryUpdate }: Props) {
  const [phase, setPhase] = useState<Phase>(1)
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [preview, setPreview] = useState<RetargetPreviewResponse | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [manualSelector, setManualSelector] = useState('')
  const [keepValidation, setKeepValidation] = useState(true)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [sessionMissing, setSessionMissing] = useState(false)

  const reset = useCallback(() => {
    setPhase(1)
    setBbox(null)
    setPreview(null)
    setSelectedIndex(0)
    setManualSelector('')
    setKeepValidation(true)
    setLoading(false)
    setApplying(false)
    setSessionMissing(false)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset()
      onOpenChange(next)
    },
    [onOpenChange, reset],
  )

  const handleDrawn = useCallback(
    async (drawn: Bbox) => {
      setBbox(drawn)
      setSessionMissing(false)
      setLoading(true)
      try {
        const result = await retargetPreview(skillId, step.step_index, drawn)
        setPreview(result)
        setSelectedIndex(0)
        setManualSelector('')
        setKeepValidation(!result.validation_changed)
        setPhase(result.fast_finish ? 3 : 2)
      } catch (err) {
        if (err instanceof CmdError && err.code === 'session_artifacts_missing') {
          setSessionMissing(true)
        } else {
          toast.error(errorMessage(err, 'Could not find this element in the recorded page'))
        }
      } finally {
        setLoading(false)
      }
    },
    [skillId, step.step_index],
  )

  const handleApplyPositionOnly = useCallback(async () => {
    if (!bbox) return
    setApplying(true)
    try {
      const res = await retargetApply(skillId, step.step_index, {
        bbox,
        primary_selector: String(step.target.primary_selector ?? ''),
        fallback_selectors: Array.isArray(step.target.fallback_selectors)
          ? (step.target.fallback_selectors as string[])
          : [],
        keep_validation: true,
      })
      onApplied(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      toast.success('Position updated')
      handleOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the position'))
    } finally {
      setApplying(false)
    }
  }, [bbox, handleOpenChange, onApplied, onHistoryUpdate, skillId, step])

  const handleApply = useCallback(async () => {
    if (!bbox || !preview) return
    const manual = manualSelector.trim()
    const chosen = preview.candidates[selectedIndex]
    const primary = manual || chosen?.selector || ''
    if (!primary) {
      toast.error('Choose one of the generated selectors (or enter one manually) before applying.')
      return
    }
    const fallbacks = preview.candidates.map((c) => c.selector).filter((s) => s !== primary)
    setApplying(true)
    try {
      const res = await retargetApply(skillId, step.step_index, {
        bbox,
        primary_selector: primary,
        fallback_selectors: fallbacks,
        keep_validation: keepValidation,
        proposed_wait_for: preview.proposed_wait_for,
        proposed_assertions: preview.proposed_assertions,
      })
      onApplied(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      toast.success('Re-target applied')
      handleOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not apply the re-target'))
    } finally {
      setApplying(false)
    }
  }, [
    bbox,
    handleOpenChange,
    keepValidation,
    manualSelector,
    onApplied,
    onHistoryUpdate,
    preview,
    selectedIndex,
    skillId,
    step.step_index,
  ])

  const stepperSteps: PipelineStep[] = PHASE_LABELS.map((label, i) => {
    const idx = (i + 1) as Phase
    return { label, state: idx < phase ? 'done' : idx === phase ? 'active' : 'pending' }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Re-target element</DialogTitle>
          <DialogDescription>Fix a step that&apos;s targeting the wrong element on the page.</DialogDescription>
        </DialogHeader>
        <BuildPipelineStepper steps={stepperSteps} />
        {phase === 1 ? (
          <RetargetPhasePick
            step={step}
            loading={loading}
            sessionMissing={sessionMissing}
            onDrawn={handleDrawn}
            onApplyPositionOnly={handleApplyPositionOnly}
            onCancel={() => handleOpenChange(false)}
          />
        ) : null}
        {phase === 2 && preview ? (
          <RetargetPhaseSelectors
            preview={preview}
            selectedIndex={selectedIndex}
            manualSelector={manualSelector}
            onSelect={setSelectedIndex}
            onManualSelectorChange={setManualSelector}
            onBack={() => setPhase(1)}
            onContinue={() => setPhase(3)}
          />
        ) : null}
        {phase === 3 && preview ? (
          <RetargetPhaseValidation
            preview={preview}
            keepValidation={keepValidation}
            onKeepValidationChange={setKeepValidation}
            onBack={() => setPhase(preview.fast_finish ? 1 : 2)}
            onApply={handleApply}
            applying={applying}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
