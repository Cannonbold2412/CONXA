import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  onOpenScreenshots?: () => void
  screenshotCount?: number | string
}

function currentBboxOf(step: StepEditorDTO): Bbox | null {
  const raw = (step.screenshot.bbox || {}) as Record<string, number>
  if (isWeakVisualBbox(raw, step.flags.is_scroll)) return null
  return { x: Number(raw.x ?? 0), y: Number(raw.y ?? 0), w: Number(raw.w ?? 0), h: Number(raw.h ?? 0) }
}

// Height cap for the full-width screenshot — leaves room for the heading, stepper, copy above
// and the action row below so the phase fits without scrolling (ScreenshotViewer's --shot-max-h).
const SHOT_MAX_H = 'clamp(300px, calc(100vh - 380px), 75vh)'

export function RetargetPhasePick({
  step,
  loading,
  sessionMissing,
  onDrawn,
  onApplyPositionOnly,
  onCancel,
  onOpenScreenshots,
  screenshotCount,
}: Props) {
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
    <div className="space-y-4">
      {/* Stacked, per the "Click" design board: copy, then the full-width screenshot, then one
          action row with the primary choice last on the right. */}
      <p className="-mt-2 text-[15px] leading-relaxed text-zinc-100">
        {hasDrawnNew
          ? 'This is the element the step will click. If it looks right, continue.'
          : 'This is the element the step currently targets. If it looks right, continue.'}
        {' '}Otherwise, draw a new box around the right one.
      </p>

      {/* Sizing only — ScreenshotViewer supplies its own border/rounded/background chrome. */}
      <div className="w-full" style={{ ['--shot-max-h' as string]: SHOT_MAX_H }}>
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
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Finding this element in the recorded page…</p> : null}

      {!sessionMissing || onOpenScreenshots ? (
        <div className="flex items-center gap-2.5">
          <span className="flex-1 whitespace-nowrap text-sm text-zinc-500">
            {pendingBbox ? `Box size ${pendingBbox.w} × ${pendingBbox.h}` : null}
          </span>
          {!sessionMissing && toolbarUi ? (
            <Button
              variant="outline"
              disabled={toolbarUi.saving}
              aria-pressed={toolbarUi.active}
              onClick={() => toolbarUi.onToggle()}
            >
              Draw a new box
            </Button>
          ) : null}
          {onOpenScreenshots ? (
            <Button variant="outline" onClick={onOpenScreenshots}>
              <ImageIcon className="size-3.5 shrink-0" aria-hidden />
              View recording screenshots{screenshotCount !== undefined ? ` (${screenshotCount})` : ''}
            </Button>
          ) : null}
          {!sessionMissing ? (
            <Button
              variant="brand"
              disabled={!pendingBbox || loading}
              onClick={() => pendingBbox && onDrawn(pendingBbox, hasDrawnNew)}
            >
              Yes, continue
            </Button>
          ) : null}
        </div>
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
