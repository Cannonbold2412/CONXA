import type { DragEvent, KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { StepEditorDTO } from '@/types/workflow'
import { RECORDING_SCREENSHOT_DRAG_MIME } from '@/api/workflowApi'
import { BoxSelect, GripVertical, Trash2 } from 'lucide-react'
import { compactStepLabel, handleRecordingScreenshotDrop, visualBboxState, type BboxState } from '@/lib/workflowViewerHelpers'

type WorkflowStepItemProps = {
  step: StepEditorDTO
  isSelected: boolean
  isDirty: boolean
  isDragging: boolean
  recordingShotDragActive?: boolean
  draggingIndex: number | null
  onSelect: (index: number) => void
  onDeleteRequest: (index: number) => void
  onDragStart: (index: number) => void
  onDragEnd: () => void
  onMove: (from: number, to: number) => void
  onDroppedRecordingScreenshot?: (stepIndex: number, eventIndex: number) => void
  onClearStepVisual?: (stepIndex: number) => void
}

export function WorkflowStepItem({
  step,
  isSelected,
  isDirty,
  isDragging,
  recordingShotDragActive,
  draggingIndex,
  onSelect,
  onDeleteRequest,
  onDragStart,
  onDragEnd,
  onMove,
  onDroppedRecordingScreenshot,
  onClearStepVisual,
}: WorkflowStepItemProps) {
  const bboxState = visualBboxState(step)

  const selectStep = () => onSelect(step.step_index)
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectStep()
  }

  const onDragOver = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect =
      recordingShotDragActive || event.dataTransfer.types.includes(RECORDING_SCREENSHOT_DRAG_MIME) ? 'copy' : 'move'
  }

  const onDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData(RECORDING_SCREENSHOT_DRAG_MIME).trim()
    if (raw && (onClearStepVisual || onDroppedRecordingScreenshot)) {
      handleRecordingScreenshotDrop(raw, step.step_index, onDroppedRecordingScreenshot, onClearStepVisual)
      return
    }
    if (draggingIndex === null) return
    onMove(draggingIndex, step.step_index)
    onDragEnd()
  }

  return (
    <li
      className="w-full space-y-1.5"
      draggable
      onDragStart={() => onDragStart(step.step_index)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={selectStep}
        onKeyDown={onRowKeyDown}
        className={cn(
          'border-border bg-background hover:bg-muted/50 relative flex w-full min-w-0 items-start gap-2 overflow-hidden rounded-lg border p-2.5 text-left text-sm transition-colors',
          'focus-visible:ring-brand-ring focus-visible:ring-2 focus-visible:outline-none',
          isSelected &&
            'border-brand/40 bg-brand-subtle before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand',
          isDragging && 'opacity-70',
        )}
      >
        <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
          <GripVertical className="size-4" />
        </span>
        <span
          className="bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-medium"
          aria-hidden
        >
          {step.step_index + 1}
        </span>
        <span className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere]">
          <span className="block">{compactStepLabel(step.human_readable_description)}</span>
          {bboxState ? <VisualBboxBadge state={bboxState} /> : null}
        </span>
        <StepBadges step={step} isDirty={isDirty} onDeleteRequest={onDeleteRequest} />
      </div>
    </li>
  )
}

function VisualBboxBadge({ state }: { state: BboxState }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'mt-1 inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem] leading-none',
            state.usable ? 'border-sky-400/25 bg-sky-400/10 text-sky-300' : 'border-white/10 bg-white/[0.03] text-zinc-500',
          )}
        >
          <BoxSelect className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">bbox {state.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{state.title}</TooltipContent>
    </Tooltip>
  )
}

function StepBadges({
  step,
  isDirty,
  onDeleteRequest,
}: {
  step: StepEditorDTO
  isDirty: boolean
  onDeleteRequest: (index: number) => void
}) {
  return (
    <span className="flex shrink-0 items-start gap-1">
      {isDirty ? (
        <Badge variant="secondary" className="text-[0.65rem]">
          edited
        </Badge>
      ) : null}
      {step.flags.is_destructive ? (
        <Badge variant="destructive" className="text-[0.65rem]">
          destructive
        </Badge>
      ) : null}
      {step.flags.generic_intent ? (
        <Badge variant="outline" className="text-[0.65rem]">
          intent
        </Badge>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive -mr-1 h-7 w-7"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteRequest(step.step_index)
            }}
            aria-label="Remove step"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Remove step</TooltipContent>
      </Tooltip>
    </span>
  )
}
