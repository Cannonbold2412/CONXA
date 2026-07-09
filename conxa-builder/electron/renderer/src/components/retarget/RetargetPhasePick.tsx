import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { BoxSelect } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Bbox } from '@/api/workflowApi'
import type { StepEditorDTO } from '@/types/workflow'
import { ScreenshotViewer, isWeakVisualBbox, type VisualBboxToolbarUi } from '../ScreenshotViewer'

type Props = {
  step: StepEditorDTO
  loading: boolean
  sessionMissing: boolean
  /** regenerate is true only when the user drew a new region — an unchanged element continues
   *  with the selectors compiled earlier, so no LLM regeneration is requested. */
  onDrawn: (bbox: Bbox, regenerate: boolean) => void | Promise<void>
  onApplyPositionOnly: () => void
  onCancel: () => void
}

function currentBboxOf(step: StepEditorDTO): Bbox | null {
  const raw = (step.screenshot.bbox || {}) as Record<string, number>
  if (isWeakVisualBbox(raw, step.flags.is_scroll)) return null
  return { x: Number(raw.x ?? 0), y: Number(raw.y ?? 0), w: Number(raw.w ?? 0), h: Number(raw.h ?? 0) }
}

export function RetargetPhasePick({ step, loading, sessionMissing, onDrawn, onApplyPositionOnly, onCancel }: Props) {
  // Default to the step's existing target so a user who's just reviewing (and doesn't need
  // to change anything) can click Continue immediately, without being forced to redraw.
  const [pendingBbox, setPendingBbox] = useState<Bbox | null>(() => currentBboxOf(step))
  const [hasDrawnNew, setHasDrawnNew] = useState(false)
  const [toolbarUi, setToolbarUi] = useState<VisualBboxToolbarUi | null>(null)

  const handleDrawn = useCallback((b: Bbox) => {
    setPendingBbox(b)
    setHasDrawnNew(true)
  }, [])

  const handleTooSmall = useCallback(() => {
    toast.error('That selection was too small — try drawing a bigger box.')
  }, [])

  // Scrolling isn't a single-element action — there's nothing to draw a box around, so the
  // draw surface would just silently do nothing. Send the user straight to the same
  // position-only fallback used when the recording session is gone, instead of rendering a
  // screenshot that looks interactive but isn't.
  if (step.flags.is_scroll) {
    return (
      <div className="space-y-3">
        <div className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-lg border p-3 text-sm">
          <p>
            This step scrolls the page — there&apos;s no single element to re-target. You can still
            move its recorded visual position without changing what it targets.
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
      </div>
    )
  }

  const displayScreenshot = pendingBbox ? { ...step.screenshot, bbox: pendingBbox } : step.screenshot

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          This is the element the step currently targets. Draw a new box only if you want to
          change it — otherwise just continue.
        </p>
        {toolbarUi ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={toolbarUi.active ? 'default' : 'outline'}
                disabled={toolbarUi.saving}
                className="shrink-0 gap-1"
                aria-pressed={toolbarUi.active}
                onClick={() => toolbarUi.onToggle()}
              >
                <BoxSelect className="size-3.5 shrink-0" aria-hidden />
                Visual bbox
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Draw a rectangle on the screenshot to save the visual region and recompute anchors
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <ScreenshotViewer
        screenshot={displayScreenshot}
        label={step.human_readable_description}
        stepIndex={step.step_index}
        isScrollStep={false}
        autoActivateDraw
        onSaveVisualBbox={handleDrawn}
        onDrawTooSmall={handleTooSmall}
        hideToolbar
        onToolbarUiChange={setToolbarUi}
      />
      {!sessionMissing ? (
        <div className="border-brand/30 bg-brand-subtle flex items-center justify-between gap-3 rounded-lg border p-3 text-sm text-zinc-100">
          <span>
            {hasDrawnNew && pendingBbox
              ? `Region selected (${pendingBbox.w}×${pendingBbox.h}px). Redraw to adjust, or continue.`
              : pendingBbox
                ? 'Using the current target — draw above to change it, or continue.'
                : 'Draw a box on the screenshot above to select the element.'}
          </span>
          <Button size="sm" disabled={!pendingBbox || loading} onClick={() => pendingBbox && onDrawn(pendingBbox, hasDrawnNew)}>
            Continue →
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p className="text-muted-foreground text-sm">Finding this element in the recorded page…</p>
      ) : null}
      {sessionMissing ? (
        <div className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-lg border p-3 text-sm">
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
