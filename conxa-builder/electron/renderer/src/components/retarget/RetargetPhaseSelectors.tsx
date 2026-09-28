import { useState, type DragEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowLeft, Check, GripVertical, Pencil, Trash2, X, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorHelp } from '@/lib/editorHelp'
import { cn } from '@/lib/utils'
import { makeCandidateId } from '@/store/retargetStore'
import type { EditableCandidate, PickQuality } from '@/api/workflowApi'
import { BADGE_LABEL_CLASS, ConfidenceReadout, ENGINE_LABELS, ORTHOGONALITY_LABELS, SourceBadge } from './identityBadges'

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
  /** Step-level identity-signal-quality rollup (0-1); null when there's no identity_bundle. */
  compileConfidence?: number | null
}

export function RetargetPhaseSelectors({
  pickQuality,
  candidates,
  onCandidatesChange,
  onBack,
  compileConfidence,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Every candidate targets the same recorded element, so its descriptor is identical across
  // rows — show it once here instead of repeating it on every row.
  const targetDescriptor = candidates.find((c) => c.descriptor?.trim())?.descriptor?.trim()

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
      {pickQuality !== 'ambiguous' && pickQuality !== 'none' ? (
        <div className="border-status-ok/25 bg-status-ok/[0.08] flex items-center gap-3 rounded-lg border px-4 py-3">
          <span className="size-2 shrink-0 rounded-full bg-status-ok" aria-hidden />
          <p className="text-sm text-zinc-100">
            {candidates.length > 1
              ? `${candidates.length} independent signals agree on this element. It should survive most page changes.`
              : 'This selector was generated for the element you picked.'}
          </p>
        </div>
      ) : null}
      {pickQuality === 'ambiguous' ? (
        <div className="border-status-warn/25 bg-status-warn/[0.06] rounded-xl border p-3.5">
          <div className="flex gap-2.5">
            <AlertTriangle className="text-status-warn mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-2">
              <p className="text-status-warn text-sm font-medium leading-snug">
                None of the generated selectors look durable for this element
              </p>
              <p className="text-muted-foreground text-sm leading-snug">
                You can pick one anyway, edit it below, try a different region, or add one manually.
              </p>
              <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5">
                <ArrowLeft className="size-3.5" aria-hidden />
                Re-pick element
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {pickQuality === 'none' ? (
        <div className="border-status-error/25 bg-status-error/[0.06] rounded-xl border p-3.5">
          <div className="flex gap-2.5">
            <XCircle className="text-status-error mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-2">
              <p className="text-status-error text-sm font-medium leading-snug">
                No usable selector could be generated for this region
              </p>
              <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5">
                <ArrowLeft className="size-3.5" aria-hidden />
                Re-pick element
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">
              {targetDescriptor ? `Targeting ${targetDescriptor}. ` : ''}Click a row to make it the primary.
            </span>
            <InfoHint {...editorHelp.reviewSelectors} size="md" side="bottom" align="start" />
          </span>
          <ConfidenceReadout confidence={compileConfidence} />
        </div>
        {candidates.length === 0 ? (
          <div className="text-muted-foreground rounded-[10px] border border-dashed border-white/10 px-3 py-6 text-center text-sm">
            No selectors yet — add one manually below.
          </div>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {candidates.map((c, i) => {
              const isPrimary = i === 0
              const isEditing = editingId === c.id
              const kind = ENGINE_LABELS[c.engine] ?? ORTHOGONALITY_LABELS[c.orthogonality_class ?? ''] ?? c.engine
              return (
                <li
                  key={c.id}
                  draggable={!isEditing}
                  tabIndex={0}
                  aria-label={`${isPrimary ? 'Primary' : `Fallback ${i}`} selector, position ${i + 1} of ${candidates.length}. Press Enter to make it primary, Arrow Up or Arrow Down to reorder.`}
                  onClick={() => !isEditing && moveCandidate(c.id, candidates[0].id)}
                  onDragStart={() => setDraggingId(c.id)}
                  onDragOver={onRowDragOver}
                  onDrop={(e) => onRowDrop(e, c.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if ((e.key === 'Enter' || e.key === ' ') && !isPrimary) {
                      e.preventDefault()
                      moveCandidate(c.id, candidates[0].id)
                    } else if (e.key === 'ArrowUp' && i > 0) {
                      e.preventDefault()
                      moveCandidate(c.id, candidates[i - 1].id)
                    } else if (e.key === 'ArrowDown' && i < candidates.length - 1) {
                      e.preventDefault()
                      moveCandidate(c.id, candidates[i + 1].id)
                    }
                  }}
                  className={cn(
                    'group flex items-center gap-3.5 rounded-[10px] border px-4 py-3.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:outline-none',
                    isPrimary ? 'border-brand bg-white/[0.04]' : 'cursor-pointer border-white/12 hover:bg-white/[0.03]',
                    draggingId === c.id && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      isPrimary ? 'bg-brand text-brand-foreground' : 'border-[1.5px] border-white/15',
                    )}
                    aria-hidden
                  >
                    {isPrimary ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs tracking-wide text-zinc-500 uppercase">
                      <GripVertical className="-ml-1 size-3.5 cursor-grab opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
                      {isPrimary ? 'Primary' : 'Fallback'} · {kind}
                    </div>
                    {isEditing ? (
                      <div className="mt-1 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input
                          autoFocus
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onKeyDown={onEditKeyDown}
                          onBlur={commitEdit}
                          placeholder='e.g. [data-testid="submit-btn"]'
                          className="h-8 font-mono text-sm"
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-status-ok shrink-0"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={commitEdit}
                          aria-label="Save selector"
                        >
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground shrink-0"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={cancelEdit}
                          aria-label="Cancel edit"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-1 truncate font-mono text-sm text-zinc-100" title={c.selector}>
                        {c.selector || <span className="text-muted-foreground italic">Empty — edit to enter a selector</span>}
                      </div>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-zinc-400 hover:text-zinc-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(c)
                        }}
                        aria-label="Edit this selector"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-status-error hover:text-status-error"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeCandidate(c.id)
                        }}
                        aria-label="Remove this selector"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        className="flex shrink-0 items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:outline-none"
                      >
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            c.durability >= 0.9 ? 'bg-status-ok' : c.durability >= 0.7 ? 'bg-status-warn' : 'bg-status-error',
                          )}
                          aria-hidden
                        />
                        <span className="w-9 text-right text-sm text-zinc-500 tabular-nums">
                          {Math.round(c.durability * 100)}%
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs space-y-1.5">
                      <p>Durability — how likely this selector survives a UI change.</p>
                      <div className="flex flex-wrap gap-1">
                        <UniquenessBadge candidate={c} />
                        {c.source ? <SourceBadge source={c.source} /> : null}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ol>
        )}

        <div>
          <button type="button" className="text-brand text-sm font-medium hover:underline" onClick={addCandidate}>
            + Add selector
          </button>
        </div>
      </div>
    </div>
  )
}
