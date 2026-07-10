import { useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Crosshair,
  GripVertical,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorHelp } from '@/lib/editorHelp'
import { cn } from '@/lib/utils'
import { makeCandidateId } from '@/store/retargetStore'
import type { EditableCandidate, PickQuality } from '@/api/workflowApi'
import { BADGE_LABEL_CLASS, ConfidenceReadout, SourceBadge } from './identityBadges'

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

      <Card className={cn('gap-0 py-0', PANEL_CARD_CLASS)}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06]">
              <Crosshair className="size-3.5" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                Selector candidates
                <Badge variant="outline" className="text-muted-foreground border-white/10 px-1.5 text-[0.65rem] font-normal">
                  {candidates.length}
                </Badge>
                <InfoHint {...editorHelp.reviewSelectors} size="md" side="bottom" align="start" />
              </CardTitle>
              <CardDescription className="text-xs">
                {targetDescriptor ? `Targeting ${targetDescriptor} — top row is primary` : 'Top row is primary — the rest are fallbacks'}
              </CardDescription>
            </div>
          </div>
          <ConfidenceReadout confidence={compileConfidence} />
        </CardHeader>
        <CardContent className="space-y-2.5 p-3.5">
          {candidates.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm">
              No selectors yet — add one manually below.
            </div>
          ) : (
            <ol className="divide-border/60 overflow-hidden rounded-lg border border-border/60 divide-y">
              {candidates.map((c, i) => {
                const isPrimary = i === 0
                const isEditing = editingId === c.id
                return (
                  <li
                    key={c.id}
                    draggable
                    tabIndex={0}
                    aria-label={`${isPrimary ? 'Primary' : `Fallback ${i}`} selector, position ${i + 1} of ${candidates.length}. Press Arrow Up or Arrow Down to reorder.`}
                    onDragStart={() => setDraggingId(c.id)}
                    onDragOver={onRowDragOver}
                    onDrop={(e) => onRowDrop(e, c.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' && i > 0) {
                        e.preventDefault()
                        moveCandidate(c.id, candidates[i - 1].id)
                      } else if (e.key === 'ArrowDown' && i < candidates.length - 1) {
                        e.preventDefault()
                        moveCandidate(c.id, candidates[i + 1].id)
                      }
                    }}
                    className={cn(
                      'px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring',
                      isPrimary ? 'bg-brand-subtle/60' : 'hover:bg-white/[0.03]',
                      draggingId === c.id && 'opacity-60',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="text-muted-foreground mt-0.5 flex shrink-0 cursor-grab items-center gap-1.5 opacity-60 transition-opacity hover:opacity-100"
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
                          ) : (
                            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">Fallback {i}</span>
                          )}
                          <UniquenessBadge candidate={c} />
                          {c.source ? <SourceBadge source={c.source} /> : null}
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
                                  aria-label="Save selector"
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
                                  aria-label="Cancel edit"
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
                            className="text-foreground block w-full break-all rounded-md border border-border/40 bg-black/20 px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:border-white/15 hover:bg-black/30 focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:outline-none"
                            title="Click to edit this selector"
                          >
                            {c.selector || <span className="text-muted-foreground italic">Empty — click to enter a selector</span>}
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              tabIndex={0}
                              className="flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
                            >
                              <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="bg-brand h-full rounded-full"
                                  style={{ width: `${Math.round(c.durability * 100)}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground w-8 shrink-0 text-right text-[0.65rem] whitespace-nowrap tabular-nums">
                                {Math.round(c.durability * 100)}%
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left">Durability — how likely this selector survives a UI change</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
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
          )}

          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed text-muted-foreground" onClick={addCandidate}>
            <Plus className="size-3.5" />
            Add selector
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
