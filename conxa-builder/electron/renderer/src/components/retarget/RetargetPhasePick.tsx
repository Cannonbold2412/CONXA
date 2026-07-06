import { Button } from '@/components/ui/button'
import type { Bbox } from '@/api/workflowApi'
import type { StepEditorDTO } from '@/types/workflow'
import { ScreenshotViewer } from '../ScreenshotViewer'

type Props = {
  step: StepEditorDTO
  loading: boolean
  sessionMissing: boolean
  onDrawn: (bbox: Bbox) => void | Promise<void>
  onApplyPositionOnly: () => void
  onCancel: () => void
}

export function RetargetPhasePick({ step, loading, sessionMissing, onDrawn, onApplyPositionOnly, onCancel }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Draw a box around the element this step should target now.
      </p>
      <ScreenshotViewer
        screenshot={step.screenshot}
        label={step.human_readable_description}
        stepIndex={step.step_index}
        isScrollStep={step.flags.is_scroll}
        autoActivateDraw
        onSaveVisualBbox={onDrawn}
      />
      {loading ? (
        <p className="text-muted-foreground text-sm">Finding this element in the recorded page…</p>
      ) : null}
      {sessionMissing ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p>
            The original recording session for this step is no longer available, so we can&apos;t look up
            a fresh selector. You can still move the visual target without changing what it targets.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={onApplyPositionOnly}>
              Apply position only
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
