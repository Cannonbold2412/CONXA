import { useState, type DragEvent, type KeyboardEvent } from 'react'
import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { makeCandidateId } from '@/store/retargetStore'
import type { EditableCandidate, PickQuality } from '@/api/workflowApi'
import { BADGE_LABEL_CLASS, ConfidenceReadout, EngineBadge, OrthogonalityBadge, SourceBadge } from './identityBadges'

// Same gradient-fill + ring depth treatment as StepConfigForm's PANEL_CARD_CLASS, so the
// selector list reads as one continuous panel chrome with the "Action" card above it.
const PANEL_CARD_CLASS =
  'bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] ring-white/10'

function UniquenessBadge({ candidate }: { candidate: EditableCandidate }) {
  // Prefer the explicit verified status (set from the compile-time uniqueness check); fall back
  // to inferring it from match_count for any candidate that predates that field.
  const verified =
    candidate.verified ??
    (candidate.match_count === 1 ? 'unique' : candidate.match_count < 0 ? 'unverified' : 'not_unique')

  if (verified === 'unique') {
    return <Badge variant="success" className={BADGE_LABEL_CLASS}>Unique match</Badge>
  }
  if (verified === 'unverified') {
    return <Badge variant="secondary" className={BADGE_LABEL_CLASS}>Checked at run time</Badge>
  }
  return (
    <Badge variant="destructive" className={BADGE_LABEL_CLASS}>
      {candidate.match_count > 1 ? `Matches ${candidate.match_count} elements` : 'Not unique'}
    </Badge>
  )
}

function newBlankCandidate(): EditableCandidate {
  return {
    id: makeCandidateId(),
    selector: '',
    engine: 'manual',
    durability: 0,
    orthogonality_class: '',
    source: 'user',
    match_count: -1,
    unique: false,
    verified: 'unverified',
    descriptor: 'Manual selector',
  }
}

type Props = {
  pickQuality: PickQuality
  candidates: EditableCandidate[]
  onCandidatesChange: (next: EditableCandidate[]) => void
  onBack: () => void
  onContinue: () => void
  /** Step-level identity-signal-quality rollup (0-1); null when there's no identity_bundle. */
  compileConfidence?: number | null
}

export function RetargetPhaseSelectors({
  pickQuality,
  candidates,
  onCandidatesChange,
  onBack,
  onContinue,
  compileConfidence,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const canContinue = Boolean(candidates[0]?.selector.trim())

  const startEdit = (c: EditableCandidate) => {
    setEditingId(c.id)
    setDraftValue(c.selector)
  }

  const commitEdit = () => {
    if (!editingId) return
    const trimmed = draftValue.trim()
    if (trimmed) {
      onCandidatesChange(
        candidates.map((c) =>
          c.id === editingId
            ? {
                ...c,
                selector: trimmed,
                verified: 'unverified',
                match_count: -1,
                source: 'user',
                descriptor: c.engine === 'manual' ? c.descriptor : 'Edited selector',
              }
            : c,
        ),
      )
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

  const moveCandidate = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const fromIndex = candidates.findIndex((c) => c.id === fromId)
    const toIndex = candidates.findIndex((c) => c.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    const next = candidates.slice()
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onCandidatesChange(next)
  }

  const onRowDragOver = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onRowDrop = (e: DragEvent<HTMLLIElement>, targetId: string) => {
    e.preventDefault()
    if (draggingId) moveCandidate(draggingId, targetId)
    setDraggingId(null)
  }

  const removeCandidate = (id: string) => {
    onCandidatesChange(candidates.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const addCandidate = () => {
    const row = newBlankCandidate()
    onCandidatesChange([...candidates, row])
    startEdit(row)
  }

  return (
    <div className="space-y-3">
      {pickQuality === 'ambiguous' ? (
        <div className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-lg border p-3 text-sm">
          None of the generated selectors look durable for this element. You can pick one anyway, edit it,
          try a different region, or add one manually below.
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onBack}>
              ← Re-pick element
            </Button>
          </div>
        </div>
      ) : null}
      {pickQuality === 'none' ? (
        <div className="border-status-error/30 bg-status-error/10 text-status-error rounded-lg border p-3 text-sm">
          No usable selector could be generated for this region.
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onBack}>
              ← Re-pick element
            </Button>
          </div>
        </div>
      ) : null}

      <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 p-2.5 pb-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Selectors</CardTitle>
            <CardDescription className="text-xs">Drag to reorder — top is primary</CardDescription>
          </div>
          <ConfidenceReadout confidence={compileConfidence} />
        </CardHeader>
        <CardContent className="space-y-2.5 p-2.5 pt-0">
          <ol className="divide-border/60 overflow-hidden rounded-lg border border-border/60 divide-y">
            {candidates.map((c, i) => {
              const isPrimary = i === 0
              const isEditing = editingId === c.id
              return (
                <li
                  key={c.id}
                  draggable
                  onDragStart={() => setDraggingId(c.id)}
                  onDragOver={onRowDragOver}
                  onDrop={(e) => onRowDrop(e, c.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className={cn(
                    'border-l-2 border-l-transparent px-3 py-2.5 text-sm transition-colors',
                    isPrimary ? 'border-l-brand bg-brand-subtle/60' : 'hover:bg-white/[0.03]',
                    draggingId === c.id && 'opacity-60',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex shrink-0 cursor-grab items-center gap-1.5 text-zinc-600 opacity-60 transition-opacity hover:opacity-100"
                      aria-hidden
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums',
                        isPrimary ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground',
                      )}
                      aria-hidden
                    >
                      {i + 1}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isPrimary ? (
                          <Badge variant="outline" className={cn(BADGE_LABEL_CLASS, 'border-brand/50 bg-brand/15 text-brand')}>
                            Primary
                          </Badge>
                        ) : null}
                        <EngineBadge engine={c.engine} />
                        <UniquenessBadge candidate={c} />
                        {c.orthogonality_class ? <OrthogonalityBadge orthogonalityClass={c.orthogonality_class} /> : null}
                        {c.source ? <SourceBadge source={c.source} /> : null}
                        <span className="truncate text-xs font-medium text-zinc-400">{c.descriptor}</span>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={onEditKeyDown}
                            onBlur={commitEdit}
                            placeholder='e.g. [data-testid="submit-btn"]'
                            className="h-7 font-mono text-xs"
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="shrink-0 text-status-ok"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={commitEdit}
                              >
                                <Check className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="shrink-0 text-muted-foreground"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={cancelEdit}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="block w-full break-all rounded-md border border-border/40 bg-black/20 px-2 py-1.5 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/15 hover:bg-black/30"
                          title="Click to edit this selector"
                        >
                          {c.selector || <span className="text-muted-foreground italic">Empty — click to enter a selector</span>}
                        </button>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="bg-brand h-full rounded-full"
                            style={{ width: `${Math.round(c.durability * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[0.65rem] whitespace-nowrap text-zinc-500 tabular-nums">
                          {Math.round(c.durability * 100)}%
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            className="text-status-error hover:text-status-error"
                            onClick={() => removeCandidate(c.id)}
                            aria-label="Remove this selector"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Remove</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed text-muted-foreground" onClick={addCandidate}>
            <Plus className="size-3.5" />
            Add selector
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-1">
        <Button variant="outline" onClick={onBack}>
          ← Re-pick element
        </Button>
        <Button onClick={onContinue} disabled={!canContinue}>
          Continue →
        </Button>
      </div>
    </div>
  )
}
