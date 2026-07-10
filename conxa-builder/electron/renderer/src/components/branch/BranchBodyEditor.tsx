import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, GitBranch, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InfoHint } from '@/components/ui/info-hint'
import { editorHelp } from '@/lib/editorHelp'
import { ADD_ACTION_OPTIONS } from '@/lib/workflowViewerHelpers'
import { cn } from '@/lib/utils'
import { deleteBranchStep, errorMessage, patchStep, postInsertBranchStep, postReorderBranchSteps } from '@/api/workflowApi'
import type { StepEditorDTO, WorkflowResponse } from '@/types/workflow'
import { useEditorStore } from '@/store/editorStore'

type Props = {
  /** The parent if_present step (branch_summary.kind === 'if_present'). */
  step: StepEditorDTO
  skillId: string
  onWorkflowUpdated: (wf: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
}

// Branch bodies are one level deep only (patch_gate.py's path addressing supports
// "branch.steps[N]", not nested branches-within-branches) — exclude the conditional kinds from
// the add-action menu here so a user can't create a state the backend would reject.
const BRANCH_BODY_ADD_OPTIONS = ADD_ACTION_OPTIONS.filter((o) => o.category !== 'Conditional')

/**
 * Add/remove/reorder + per-step editing for an if_present step's nested body — closes the audit's
 * P0 finding that branch bodies were compiled and stored but had no editor authoring path
 * (EXEC-1's remaining gap). Deliberately NOT built on StepConfigForm: that form's patchStep calls
 * are hardcoded to the top-level step_index across several call sites, and its dirty-tracking is
 * keyed by step_index only — threading a nested `path` through it would risk the primary editing
 * surface for a secondary flow. This is a focused, path-aware editor instead, visually consistent
 * with StepConfigForm's card idiom.
 */
export function BranchBodyEditor({ step, skillId, onWorkflowUpdated, onHistoryUpdate }: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const focusedBranchIndex = useEditorStore((s) => s.focusedBranchIndex)
  const setFocusedBranchIndex = useEditorStore((s) => s.setFocusedBranchIndex)

  const nested = step.branch_steps
  const probeSelector = String(step.target.primary_selector ?? '').trim()

  const refresh = (res: { workflow: WorkflowResponse; can_undo?: boolean; can_redo?: boolean }) => {
    onWorkflowUpdated(res.workflow)
    if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
  }

  const handleAdd = async (actionKind: string, insertAfter: number | null) => {
    setAddMenuOpen(false)
    try {
      const res = await postInsertBranchStep(skillId, step.step_index, { action_kind: actionKind, insert_after: insertAfter })
      refresh(res)
      const nextIndex = insertAfter === null ? res.workflow.steps[step.step_index].branch_steps.length - 1 : insertAfter + 1
      setFocusedBranchIndex(nextIndex)
      toast.success('Step added to condition')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add step'))
    }
  }

  const handleDelete = async (nestedIndex: number) => {
    setBusyIndex(nestedIndex)
    try {
      const res = await deleteBranchStep(skillId, step.step_index, nestedIndex)
      refresh(res)
      if (focusedBranchIndex === nestedIndex) setFocusedBranchIndex(null)
      toast.success('Step removed')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove step'))
    } finally {
      setBusyIndex(null)
    }
  }

  const handleMove = async (from: number, to: number) => {
    if (to < 0 || to >= nested.length || from === to) return
    const order = nested.map((_, i) => i)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    setBusyIndex(from)
    try {
      const res = await postReorderBranchSteps(skillId, step.step_index, order)
      refresh(res)
      if (focusedBranchIndex === from) setFocusedBranchIndex(to)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not reorder steps'))
    } finally {
      setBusyIndex(null)
    }
  }

  return (
    <Card className="gap-2 bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] py-3 ring-white/10">
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="size-4 text-violet-300" aria-hidden />
          If present, run these steps
          <InfoHint {...editorHelp.branchBody} side="bottom" align="start" />
        </CardTitle>
        <CardDescription className="text-xs">
          {probeSelector
            ? <>Runs only when <span className="font-mono text-zinc-400">{probeSelector}</span> is found on the page.</>
            : "Runs only when this step's own selector is found on the page."}
          {' '}Best-effort — a failure here never stops the run or triggers paid AI recovery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-2.5 pt-0">
        {nested.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-500">
            No steps yet — add one to define what happens when this condition is met.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {nested.map((n, i) => (
              <BranchBodyStepRow
                key={n.id}
                nestedStep={n}
                nestedIndex={i}
                isFirst={i === 0}
                isLast={i === nested.length - 1}
                isFocused={focusedBranchIndex === i}
                busy={busyIndex === i}
                skillId={skillId}
                parentStepIndex={step.step_index}
                onWorkflowUpdated={onWorkflowUpdated}
                onHistoryUpdate={onHistoryUpdate}
                onFocus={() => setFocusedBranchIndex(i)}
                onMoveUp={() => void handleMove(i, i - 1)}
                onMoveDown={() => void handleMove(i, i + 1)}
                onDelete={() => void handleDelete(i)}
              />
            ))}
          </ol>
        )}

        <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              Add step to condition
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="max-h-96 w-52 overflow-y-auto p-1">
            {BRANCH_BODY_ADD_OPTIONS.map((option, index) => {
              const prev = BRANCH_BODY_ADD_OPTIONS[index - 1]
              const showCategory = !prev || prev.category !== option.category
              return (
                <div key={option.value}>
                  {showCategory ? (
                    <div className="px-2 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground first:pt-1">
                      {option.category}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="hover:bg-white/[0.07] focus-visible:bg-white/[0.07] flex h-8 w-full items-center rounded-sm px-2 text-left text-xs text-zinc-200 outline-none"
                    onClick={() => void handleAdd(option.value, nested.length - 1)}
                  >
                    {option.label}
                  </button>
                </div>
              )
            })}
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  )
}

type RowProps = {
  nestedStep: StepEditorDTO
  nestedIndex: number
  isFirst: boolean
  isLast: boolean
  isFocused: boolean
  busy: boolean
  skillId: string
  parentStepIndex: number
  onWorkflowUpdated: (wf: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
  onFocus: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

function BranchBodyStepRow({
  nestedStep,
  nestedIndex,
  isFirst,
  isLast,
  isFocused,
  busy,
  skillId,
  parentStepIndex,
  onWorkflowUpdated,
  onHistoryUpdate,
  onFocus,
  onMoveUp,
  onMoveDown,
  onDelete,
}: RowProps) {
  const [expanded, setExpanded] = useState(isFocused)
  const [intent, setIntent] = useState(nestedStep.intent)
  const [primarySelector, setPrimarySelector] = useState(String(nestedStep.target.primary_selector ?? ''))
  const [value, setValue] = useState(typeof nestedStep.value === 'string' ? nestedStep.value : '')
  const [saving, setSaving] = useState(false)

  const path = `branch.steps[${nestedIndex}]`
  const hasValue = nestedStep.action_spec?.value === true

  const onExpand = () => {
    setExpanded(true)
    onFocus()
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      if (intent.trim() !== nestedStep.intent) patch.intent = intent.trim()
      if (primarySelector.trim() !== String(nestedStep.target.primary_selector ?? '')) {
        patch.target = { primary_selector: primarySelector.trim(), fallback_selectors: nestedStep.target.fallback_selectors ?? [] }
      }
      if (hasValue && value !== (typeof nestedStep.value === 'string' ? nestedStep.value : '')) patch.value = value
      if (Object.keys(patch).length === 0) {
        setExpanded(false)
        return
      }
      const res = await patchStep(skillId, parentStepIndex, patch, false, path)
      onWorkflowUpdated(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      toast.success('Step saved')
      setExpanded(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this step'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      className={cn(
        'rounded-lg border border-white/8 bg-black/20 p-2 text-sm',
        isFocused && 'border-brand/40 bg-brand-subtle',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[0.65rem] text-zinc-500">
          {nestedIndex + 1}
        </span>
        <button type="button" className="min-w-0 flex-1 truncate text-left text-zinc-200" onClick={onExpand}>
          {nestedStep.human_readable_description}
        </button>
        <Badge variant="outline" className="shrink-0 text-[0.6rem]">
          {nestedStep.action_type}
        </Badge>
        <Button type="button" size="icon-sm" variant="ghost" disabled={isFirst || busy} onClick={onMoveUp} aria-label="Move up">
          <ChevronUp className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" disabled={isLast || busy} onClick={onMoveDown} aria-label="Move down">
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          aria-label="Remove step"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-white/5 pt-2">
          <div className="grid gap-1">
            <Label htmlFor={`branch-intent-${nestedIndex}`} className="text-xs">Intent</Label>
            <Input
              id={`branch-intent-${nestedIndex}`}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`branch-selector-${nestedIndex}`} className="text-xs">Primary selector</Label>
            <Input
              id={`branch-selector-${nestedIndex}`}
              value={primarySelector}
              onChange={(e) => setPrimarySelector(e.target.value)}
              placeholder="text=Accept"
              className="h-8 font-mono text-xs"
            />
          </div>
          {hasValue ? (
            <div className="grid gap-1">
              <Label htmlFor={`branch-value-${nestedIndex}`} className="text-xs">Value</Label>
              <Input
                id={`branch-value-${nestedIndex}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
