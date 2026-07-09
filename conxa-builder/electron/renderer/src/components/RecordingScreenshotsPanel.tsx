import { Badge } from '@/components/ui/badge'
import { CheckCircle2, ImageOff, Loader2 } from 'lucide-react'
import type { FrameDTO } from '@/types/workflow'
import type { RecordingScreenshotItemDTO } from '@/api/workflowApi'
import { cn } from '@/lib/utils'

const FRAME_LABELS: Record<string, string> = {
  before_far: '−0.5 s',
  before_near: '−0.25 s',
  at: '0 s',
  after_near: '+0.25 s',
  after_far: '+0.5 s',
}

type Props = {
  frames: FrameDTO[]
  /** Label currently applied as the representative (from signals.visual.default_frame_label). */
  activeFrameLabel: string | null
  canClearVisual?: boolean
  onApplyFrame?: (label: string) => void | Promise<void>
  onClearVisual?: () => void | Promise<void>
  /** When true, show every screenshot captured across the whole recording instead of just
   *  this step's 5 timed frames. */
  showAllFrames?: boolean
  allItems?: RecordingScreenshotItemDTO[]
  isLoadingAllFrames?: boolean
  onSelectAllFrame?: (eventIndex: number, frameLabel: string) => void | Promise<void>
}

type FlatRecordingFrame = {
  eventIndex: number
  sequence: number
  label: string
  url: string
}

function flattenRecordingFrames(items: RecordingScreenshotItemDTO[]): FlatRecordingFrame[] {
  const out: FlatRecordingFrame[] = []
  for (const item of items) {
    const frames = item.frames ?? []
    if (frames.length > 0) {
      for (const frame of frames) {
        out.push({ eventIndex: item.event_index, sequence: item.sequence, label: frame.label, url: frame.url })
      }
    } else if (item.preview_url) {
      out.push({ eventIndex: item.event_index, sequence: item.sequence, label: 'at', url: item.preview_url })
    }
  }
  return out
}

function NoImageOption({ onSelect }: { onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.()}
      className="border-border bg-muted/25 group mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-dashed border-white/20 text-left outline-none transition-colors hover:border-white/35 focus-visible:ring-2 focus-visible:ring-brand-ring"
    >
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2.5 bg-black/20 transition-colors group-hover:bg-black/30">
        <ImageOff className="text-muted-foreground size-11 opacity-75" aria-hidden strokeWidth={1.5} />
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">No image</span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Clear screenshot</span>
        <span className="text-xs text-zinc-500">Removes the visual anchor for this step</span>
      </div>
    </button>
  )
}

function FrameOption({
  frame,
  isActive,
  isDefault,
  timeLabel,
  onSelect,
}: {
  frame: FrameDTO
  isActive: boolean
  isDefault: boolean
  timeLabel: string
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      disabled={!onSelect}
      onClick={() => onSelect?.()}
      className={cn(
        'group mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border text-left outline-none transition-all',
        'focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-70',
        isActive ? 'border-brand/50 ring-2 ring-brand/50' : 'border-border bg-muted/40 hover:border-white/25',
      )}
    >
      <div className="relative">
        {frame.url ? (
          <img
            src={frame.url}
            alt={`Frame at ${timeLabel}`}
            width={960}
            height={540}
            loading="lazy"
            className="aspect-video block w-full object-cover object-top"
          />
        ) : (
          <div className="aspect-video flex items-center justify-center bg-black/30">
            <span className="text-muted-foreground text-xs">no image</span>
          </div>
        )}
        {isActive && (
          <span className="bg-brand text-brand-foreground absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Selected
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-zinc-200">
          {timeLabel}
          {isDefault && (
            <Badge variant="outline" className="h-4.5 border-amber-500/30 px-1.5 text-[10px] font-medium text-amber-400">
              default
            </Badge>
          )}
        </span>
        {!isActive && onSelect && (
          <span className="text-xs text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100">
            Click to select
          </span>
        )}
      </div>
    </button>
  )
}

function AllScreenshotsGrid({
  items,
  isLoading,
  onSelect,
}: {
  items: RecordingScreenshotItemDTO[]
  isLoading?: boolean
  onSelect?: (eventIndex: number, frameLabel: string) => void
}) {
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-xs">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading every screenshot from this recording…
      </div>
    )
  }
  const flatFrames = flattenRecordingFrames(items)
  if (flatFrames.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-xs leading-relaxed">
        No screenshots found for the source recording session.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {flatFrames.map((frame) => {
        const timeLabel = FRAME_LABELS[frame.label] ?? frame.label
        return (
          <button
            type="button"
            key={`${frame.eventIndex}-${frame.label}`}
            disabled={!onSelect}
            onClick={() => onSelect?.(frame.eventIndex, frame.label)}
            className={cn(
              'group border-border bg-muted/40 mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border text-left outline-none transition-all',
              'hover:border-white/25 focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-70',
            )}
          >
            {frame.url ? (
              <img
                src={frame.url}
                alt={`Step ${frame.sequence} at ${timeLabel}`}
                width={960}
                height={540}
                loading="lazy"
                className="aspect-video block w-full object-cover object-top"
              />
            ) : (
              <div className="aspect-video flex items-center justify-center bg-black/30">
                <span className="text-muted-foreground text-xs">no image</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-zinc-200">
                Step #{frame.sequence}
                <Badge variant="outline" className="h-4.5 border-white/15 px-1.5 text-[10px] font-medium text-zinc-400">
                  {timeLabel}
                </Badge>
              </span>
              {onSelect && (
                <span className="text-xs text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100">
                  Click to select
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Scrollable, click-to-select list of the 5 frames captured around the currently-selected
 *  step — each shown at a large, clearly legible size. Selecting a frame sets it as the
 *  representative screenshot for that step. A toggle switches to every screenshot captured
 *  across the whole recording, so a step can borrow a frame from elsewhere in the flow. */
export function RecordingScreenshotsPanel({
  frames,
  activeFrameLabel,
  canClearVisual = true,
  onApplyFrame,
  onClearVisual,
  showAllFrames = false,
  allItems,
  isLoadingAllFrames,
  onSelectAllFrame,
}: Props) {
  const hasFrames = frames.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showAllFrames ? (
        <AllScreenshotsGrid
          items={allItems ?? []}
          isLoading={isLoadingAllFrames}
          onSelect={onSelectAllFrame}
        />
      ) : (
        <>
          {!hasFrames && (
            <p className="text-muted-foreground mb-4 text-center text-xs leading-relaxed">
              No video frames for this step. Compile the skill from a recording session to generate frames.
            </p>
          )}
          <div className="space-y-4">
            {canClearVisual && <NoImageOption onSelect={onClearVisual} />}
            {frames.map((frame) => {
              const isActive = frame.label === activeFrameLabel
              const isDefault = frame.label === 'before_near'
              const timeLabel = FRAME_LABELS[frame.label] ?? frame.label
              return (
                <FrameOption
                  key={frame.label}
                  frame={frame}
                  isActive={isActive}
                  isDefault={isDefault}
                  timeLabel={timeLabel}
                  onSelect={onApplyFrame ? () => onApplyFrame(frame.label) : undefined}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
