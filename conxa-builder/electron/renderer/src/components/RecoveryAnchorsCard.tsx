import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { patchStep, errorMessage } from '@/api/workflowApi'
import { editorHelp } from '@/lib/editorHelp'
import { anchorRowsFromObjects, parseAnchorRows } from '@/lib/anchors'
import type { WorkflowResponse } from '@/types/workflow'

type Props = {
  stepIndex: number
  skillId: string
  anchors: Record<string, unknown>[]
  onWorkflowUpdated: (wf: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
  disabled?: boolean
}

/**
 * Editable "recovery.anchors" — landmarks the AI fallback (Tier 3+) uses to relocate this
 * element once every selector has failed. Same relation:element format and save pattern as the
 * step's own signals.anchors editor, kept as a separate card since it patches a different key
 * and only matters once recovery is already underway. Deliberately does NOT expose
 * max_attempts/confidence_threshold/strategies — those stay policy-owned, not editable per step.
 */
export function RecoveryAnchorsCard({ stepIndex, skillId, anchors, onWorkflowUpdated, onHistoryUpdate, disabled }: Props) {
  const [rows, setRows] = useState<string[]>(() => {
    const initial = anchorRowsFromObjects(anchors)
    return initial.length > 0 ? initial : ['']
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const initial = anchorRowsFromObjects(anchors)
    setRows(initial.length > 0 ? initial : [''])
    setDirty(false)
  }, [stepIndex, anchors])

  const setRow = (index: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? value : r)))
    setDirty(true)
  }

  const addRow = () => {
    setRows((prev) => [...prev, ''])
    setDirty(true)
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await patchStep(skillId, stepIndex, { recovery: { anchors: parseAnchorRows(rows) } }, false)
      onWorkflowUpdated(res.workflow)
      if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
      setDirty(false)
      toast.success('Recovery search hints saved')
    } catch (e) {
      toast.error(errorMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-2 bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] py-3 ring-white/10">
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          Search hints for recovery
          <InfoHint {...editorHelp.recoverySearchHints} size="md" side="bottom" align="start" />
        </CardTitle>
        <CardDescription className="text-xs">
          Landmarks the AI fallback looks near if every selector above stops matching
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-2.5 pt-0">
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={row}
                onChange={(e) => setRow(index, e.target.value)}
                placeholder={index === 0 ? 'near:Sign in' : `Hint ${index + 1}`}
                disabled={disabled}
                className="h-7 text-xs"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                disabled={disabled || rows.length <= 1}
                onClick={() => removeRow(index)}
                aria-label={`Remove hint ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={addRow}>
            <Plus className="size-3.5" />
            Add hint
          </Button>
          <Button type="button" size="sm" disabled={disabled || !dirty || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save hints'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
