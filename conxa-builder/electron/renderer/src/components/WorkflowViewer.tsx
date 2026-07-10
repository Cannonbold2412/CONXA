import { Fragment, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { StepEditorDTO } from '../types/workflow'
import { useEditorStore } from '../store/editorStore'
import { ListPlus, Plus } from 'lucide-react'
import type { AddActionKind } from '@/lib/workflowViewerHelpers'
import { WorkflowHeader } from '@/components/workflowViewer/WorkflowHeader'
import { WorkflowStepItem } from '@/components/workflowViewer/WorkflowStepItem'
import { DeleteStepDialog } from '@/components/workflowViewer/DeleteStepDialog'
import { BranchSubList } from '@/components/workflowViewer/BranchSubList'

type Props = {
  steps: StepEditorDTO[]
  onReorder: (newOrder: number[]) => void
  onDelete: (index: number) => void
  /** Human confirms a recorder-flagged optional interstitial should become a real try_dismiss
   * branch (recording-next-steps.md Priority 2). See StepEditorDTO.optional_hint. */
  onConfirmOptionalHint: (index: number) => void
  onAddAction: (actionKind: AddActionKind) => void
  /** Drop a recording screenshot (custom drag payload) onto a step to swap visuals and refresh anchors. */
  onDroppedRecordingScreenshot?: (stepIndex: number, eventIndex: number) => void
  /** Drop “No image” payload to detach screenshot and clear anchors. */
  onClearStepVisual?: (stepIndex: number) => void
  recordingShotDragActive?: boolean
}

export function WorkflowViewer({
  steps,
  onReorder,
  onDelete,
  onConfirmOptionalHint,
  onAddAction,
  onDroppedRecordingScreenshot,
  onClearStepVisual,
  recordingShotDragActive,
}: Props) {
  const selected = useEditorStore((s) => s.selectedStepIndex)
  const dirty = useEditorStore((s) => s.dirtySteps)
  const setSel = useEditorStore((s) => s.setSelectedStepIndex)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return
    const order = steps.map((_, i) => i)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    onReorder(order)
  }

  return (
    <>
      {/* Same gradient-fill depth treatment as PanelChrome (components/ui/panel-chrome.tsx), applied
          inline rather than nested — this pane is flush against the grid's draggable resizer, so
          PanelChrome's rounded corners + outer shadow would clash with that boundary. */}
      <aside className="border-border relative z-10 flex min-h-0 min-w-0 flex-col border-b bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(7,10,16,0.95))] ring-1 ring-inset ring-white/[0.03] md:border-r md:border-b-0">
        <WorkflowHeader onAddAction={onAddAction} />
        <ScrollArea className="min-h-[12rem] w-full flex-1 md:min-h-0">
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400" aria-hidden>
                <ListPlus className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">No steps yet</p>
                <p className="text-xs text-zinc-500">Add your first action to start building this workflow.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onAddAction('click')}
              >
                <Plus className="size-3.5" />
                Add first action
              </Button>
            </div>
          ) : (
          <ol className="w-full space-y-1.5 p-2">
            {steps.map((step) => (
              <Fragment key={step.id}>
                <WorkflowStepItem
                  step={step}
                  isSelected={selected === step.step_index}
                  isDirty={dirty.has(step.step_index)}
                  isDragging={draggingIndex === step.step_index}
                  recordingShotDragActive={recordingShotDragActive}
                  draggingIndex={draggingIndex}
                  onSelect={setSel}
                  onDeleteRequest={setDeleteIndex}
                  onConfirmOptionalHint={onConfirmOptionalHint}
                  onDragStart={setDraggingIndex}
                  onDragEnd={() => setDraggingIndex(null)}
                  onMove={move}
                  onDroppedRecordingScreenshot={onDroppedRecordingScreenshot}
                  onClearStepVisual={onClearStepVisual}
                />
                <BranchSubList parentStepIndex={step.step_index} branchSteps={step.branch_steps} />
              </Fragment>
            ))}
          </ol>
          )}
        </ScrollArea>
      </aside>

      <DeleteStepDialog
        deleteIndex={deleteIndex}
        onOpenChange={(open) => !open && setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex === null) return
          onDelete(deleteIndex)
          setDeleteIndex(null)
        }}
      />
    </>
  )
}
