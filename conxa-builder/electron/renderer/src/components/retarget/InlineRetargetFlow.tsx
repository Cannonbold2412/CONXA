import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { CmdError } from '@/lib/ipc'
import { errorMessage, retargetApply, retargetPreview, type Bbox } from '@/api/workflowApi'
import type { StepEditorDTO, WorkflowResponse } from '@/types/workflow'
import { StepConfigForm, type StepConfigFormHandle } from '../StepConfigForm'
import { RetargetPhasePick } from './RetargetPhasePick'
import { RetargetPhaseSelectors } from './RetargetPhaseSelectors'
import { RetargetPhaseValidation } from './RetargetPhaseValidation'
import { BranchBodyEditor } from '@/components/branch/BranchBodyEditor'
import { RecoveryAnchorsCard } from '@/components/RecoveryAnchorsCard'
import { BuildPipelineStepper, type PipelineStep } from '@/components/build/BuildPipelineStepper'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { makeCandidateId, useRetargetStore } from '@/store/retargetStore'
import { cn } from '@/lib/utils'

const PHASE_LABELS = ['Pick element', 'Review selectors', 'Validation'] as const
type Phase = 1 | 2 | 3

type Props = {
  step: StepEditorDTO | null
  skillId: string
  onWorkflowUpdated: (wf: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
  /** Opens the Recording Screenshots dialog (lives in HumanEditPage — reused from there so its
   *  fetch/apply/clear state doesn't need duplicating here). Surfaced as a button in the Pick
   *  Element phase rather than the page's top bar, since it's a per-step "borrow a frame" tool. */
  onOpenScreenshots?: () => void
  screenshotCount?: number | string
}

export type InlineRetargetFlowHandle = {
  /** Saves the open step's config fields if dirty. Returns whether save succeeded or was not needed. */
  submitIfDirty: () => Promise<boolean>
}

// Same gradient-fill depth treatment as WorkflowViewer's aside / PanelChrome (components/ui/
// panel-chrome.tsx) — this is the flush middle grid column (draggable resizers on both sides),
// so no rounded corners/outer shadow here; see WorkflowViewer.tsx for the same reasoning.
const PANEL_CLASS =
  'border-border/60 relative z-0 flex min-h-0 min-w-0 flex-col overflow-hidden border-t bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.95))] ring-1 ring-inset ring-white/[0.03] md:border-t-0 md:border-l'

/**
 * Replaces the old center "step editor" panel. For steps with an element to target, this
 * embeds the 3-phase re-target wizard (previously a separate full-screen route) directly next
 * to the steps list: Pick element on the screenshot -> review generated selectors (and edit the
 * step's other config fields alongside them) -> confirm & apply the validation diff. Scroll
 * steps have no single element to re-target, so they just get the config form.
 */
export const InlineRetargetFlow = forwardRef<InlineRetargetFlowHandle, Props>(function InlineRetargetFlow(
  { step, skillId, onWorkflowUpdated, onHistoryUpdate, onOpenScreenshots, screenshotCount },
  ref,
) {
  const formRef = useRef<StepConfigFormHandle>(null)
  const [phase, setPhase] = useState<Phase>(1)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [sessionMissing, setSessionMissing] = useState(false)

  const bbox = useRetargetStore((s) => s.bbox)
  const setBbox = useRetargetStore((s) => s.setBbox)
  const preview = useRetargetStore((s) => s.preview)
  const setPreview = useRetargetStore((s) => s.setPreview)
  const candidates = useRetargetStore((s) => s.candidates)
  const setCandidates = useRetargetStore((s) => s.setCandidates)
  const keepValidation = useRetargetStore((s) => s.keepValidation)
  const setKeepValidation = useRetargetStore((s) => s.setKeepValidation)
  const editedAssertions = useRetargetStore((s) => s.editedAssertions)
  const setEditedAssertions = useRetargetStore((s) => s.setEditedAssertions)
  const reset = useRetargetStore((s) => s.reset)

  useImperativeHandle(
    ref,
    () => ({
      submitIfDirty: () => formRef.current?.submitIfDirty() ?? Promise.resolve(true),
    }),
    [],
  )

  const handleDrawn = useCallback(
    async (drawn: Bbox, regenerate: boolean) => {
      if (!step) return
      setBbox(drawn)
      setSessionMissing(false)
      setLoading(true)
      try {
        const result = await retargetPreview(skillId, step.step_index, drawn, regenerate)
        setPreview(result)
        const seeded = result.candidates.map((c) => ({ ...c, id: makeCandidateId() }))
        setCandidates(seeded)
        setKeepValidation(!result.validation_changed)
        setEditedAssertions(null)
        setPhase(2)
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
    [skillId, step, setBbox, setPreview, setCandidates, setKeepValidation, setEditedAssertions],
  )

  const handleApplyPositionOnly = useCallback(async () => {
    if (!step || !bbox) return
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
      onWorkflowUpdated(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      toast.success('Position updated')
      reset()
      setPhase(1)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the position'))
    } finally {
      setApplying(false)
    }
  }, [skillId, step, bbox, onWorkflowUpdated, onHistoryUpdate, reset])

  const handleCancelPick = useCallback(() => {
    reset()
  }, [reset])

  const handleContinueToConfirm = useCallback(async () => {
    if (!candidates[0]?.selector.trim()) {
      toast.error('Add or drag a selector to the top (primary) before continuing.')
      return
    }
    const savedOk = await (formRef.current?.submitIfDirty() ?? Promise.resolve(true))
    if (!savedOk) {
      toast.error('Could not save the step details — fix errors before continuing.')
      return
    }
    setPhase(3)
  }, [candidates])

  const handleApply = useCallback(async () => {
    if (!step || !bbox || !preview) return
    const primary = candidates[0]?.selector.trim() || ''
    if (!primary) {
      toast.error('Add or drag a selector to the top (primary) before applying.')
      return
    }
    const fallbacks = candidates
      .slice(1)
      .map((c) => c.selector.trim())
      .filter(Boolean)
    setApplying(true)
    try {
      const res = await retargetApply(skillId, step.step_index, {
        bbox,
        primary_selector: primary,
        fallback_selectors: fallbacks,
        keep_validation: keepValidation,
        proposed_wait_for: preview.proposed_wait_for,
        proposed_assertions: preview.proposed_assertions,
        // Only sent when the human actually touched the Validation phase's assertion editor —
        // otherwise the backend falls back to keep_validation/proposed_assertions as before.
        edited_assertions: editedAssertions ?? undefined,
      })
      onWorkflowUpdated(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      toast.success('Re-target applied')
      reset()
      setPhase(1)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not apply the re-target'))
    } finally {
      setApplying(false)
    }
  }, [skillId, step, bbox, preview, candidates, keepValidation, editedAssertions, onWorkflowUpdated, onHistoryUpdate, reset])

  if (!step) {
    return (
      <div className={cn(PANEL_CLASS, 'text-muted-foreground items-center justify-center border-x p-4 text-sm')}>
        Select a step to edit
      </div>
    )
  }

  if (step.flags.is_scroll) {
    return (
      <div className={PANEL_CLASS}>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            <StepConfigForm
              ref={formRef}
              step={step}
              skillId={skillId}
              onWorkflowUpdated={onWorkflowUpdated}
              onHistoryUpdate={onHistoryUpdate}
            />
            <RecoveryAnchorsCard
              stepIndex={step.step_index}
              skillId={skillId}
              anchors={step.anchors_recovery}
              onWorkflowUpdated={onWorkflowUpdated}
              onHistoryUpdate={onHistoryUpdate}
            />
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Branch steps (if_present/try_dismiss/wait_for_one_of — EXEC-1) skip the 3-phase re-target
  // wizard: its bbox-driven "one primary + fallbacks" model doesn't map onto try_dismiss's
  // ordered candidate list or wait_for_one_of's set of alternative options, and if_present's own
  // probe selector is still editable through the normal selector fields in StepConfigForm below.
  // Only if_present gets a dedicated nested-body editor this pass — try_dismiss's `candidates`
  // and wait_for_one_of's `options` are readable (see BranchSummaryBadge in WorkflowStepItem.tsx)
  // but have no authoring UI yet; see TODO.md follow-up.
  if (step.branch_summary) {
    return (
      <div className={PANEL_CLASS}>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            <StepConfigForm
              ref={formRef}
              step={step}
              skillId={skillId}
              onWorkflowUpdated={onWorkflowUpdated}
              onHistoryUpdate={onHistoryUpdate}
            />
            {step.branch_summary.kind === 'if_present' ? (
              <BranchBodyEditor
                step={step}
                skillId={skillId}
                onWorkflowUpdated={onWorkflowUpdated}
                onHistoryUpdate={onHistoryUpdate}
              />
            ) : null}
            <RecoveryAnchorsCard
              stepIndex={step.step_index}
              skillId={skillId}
              anchors={step.anchors_recovery}
              onWorkflowUpdated={onWorkflowUpdated}
              onHistoryUpdate={onHistoryUpdate}
            />
          </div>
        </ScrollArea>
      </div>
    )
  }

  const pipelineSteps: PipelineStep[] = PHASE_LABELS.map((label, i) => {
    const idx = i + 1
    return { label, state: idx < phase ? 'done' : idx === phase ? 'active' : 'pending' }
  })

  return (
    <div className={PANEL_CLASS}>
      {/* Fixed-height header (matches WorkflowHeader's h-14 on the left pane) so the two panes'
          border-bottoms line up in the same row instead of this stepper scrolling with the content. */}
      <div className="border-border/80 flex h-14 items-center justify-center border-b bg-muted/5 px-3">
        <div className="mx-auto w-full max-w-md">
          <BuildPipelineStepper steps={pipelineSteps} />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3.5 p-3">
          {phase === 1 ? (
            <RetargetPhasePick
              step={step}
              loading={loading || applying}
              sessionMissing={sessionMissing}
              onDrawn={handleDrawn}
              onApplyPositionOnly={handleApplyPositionOnly}
              onCancel={handleCancelPick}
              onOpenScreenshots={onOpenScreenshots}
              screenshotCount={screenshotCount}
            />
          ) : null}
          {/* Kept mounted (just hidden) across phases so in-progress edits and the ref survive
              phase changes instead of being lost on unmount. Visible during phase 2 only, per
              the "review selectors doubles as the step editor" design. hideSelectorTools also
              suppresses the form's own Validation panel — that's the job of phase 3
              (RetargetPhaseValidation) here, and showing both would let a user save assertions
              via two different, inconsistent paths (instant patchStep vs. staged retargetApply).
              hideSubmitButton: the wizard's own Continue button already calls submitIfDirty(),
              so a second manual "Save step" button here would be redundant. */}
          <div className={phase === 2 ? '' : 'hidden'}>
            <StepConfigForm
              ref={formRef}
              step={step}
              skillId={skillId}
              onWorkflowUpdated={onWorkflowUpdated}
              onHistoryUpdate={onHistoryUpdate}
              hideSelectorTools
              hideSubmitButton
            />
          </div>
          {phase === 2 && preview ? (
            <RetargetPhaseSelectors
              pickQuality={preview.pick_quality}
              candidates={candidates}
              onCandidatesChange={setCandidates}
              onBack={() => setPhase(1)}
              compileConfidence={preview.compile_confidence}
            />
          ) : null}
          {phase === 2 ? (
            <>
              <RecoveryAnchorsCard
                stepIndex={step.step_index}
                skillId={skillId}
                anchors={step.anchors_recovery}
                onWorkflowUpdated={onWorkflowUpdated}
                onHistoryUpdate={onHistoryUpdate}
              />
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setPhase(1)} className="gap-1.5">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Re-pick element
                </Button>
                <div className="flex items-center gap-2.5">
                  {!candidates[0]?.selector.trim() ? (
                    <span className="text-muted-foreground text-xs">Add a primary selector to continue</span>
                  ) : null}
                  <Button
                    onClick={() => void handleContinueToConfirm()}
                    disabled={!candidates[0]?.selector.trim()}
                    className="gap-1.5"
                  >
                    Continue
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
          {phase === 3 && preview ? (
            <RetargetPhaseValidation
              step={step}
              preview={preview}
              keepValidation={keepValidation}
              onKeepValidationChange={setKeepValidation}
              editedAssertions={editedAssertions}
              onEditedAssertionsChange={setEditedAssertions}
              onBack={() => setPhase(2)}
              onApply={() => void handleApply()}
              applying={applying}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
})
