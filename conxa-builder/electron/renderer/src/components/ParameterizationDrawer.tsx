import { useMemo, useRef, useState } from 'react'
import { Sparkles, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { WorkflowResponse } from '../types/workflow'
import { fetchWorkflow, patchSkillInputs, postWorkflowReplaceLiterals } from '../api/workflowApi'
import { Button } from '@/components/ui/button'
import { fieldTextareaClass } from '@/lib/fieldStyles'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { InfoHint } from '@/components/ui/info-hint'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  addSpottedToRows,
  collectVariableIdsFromSteps,
  isEffectivelyOptional,
  labelFromId,
  missingSpottedIds,
  newEmptyRow,
  normalizeVariablePlaceholder,
  type VariableFormRow,
  rowsFromServerInputs,
  rowsToServerPayload,
  unusedRowIds,
} from '@/lib/skillInputVariables'

type Props = {
  workflow: WorkflowResponse
  onSaved: (w: WorkflowResponse) => void
  onClose: () => void
}

// grid-cols shared by the header and every body row so columns stay aligned.
const ROW_GRID = 'grid grid-cols-[minmax(160px,1.3fr)_minmax(160px,1.3fr)_128px_minmax(140px,1fr)_90px_90px_36px] items-center gap-2.5'

/** The product's own `{{id}}` syntax, worn by the input itself. A pasted `{{name}}` is
 * unwrapped on the way in so the field never ends up displaying doubled braces. */
function VariableNameField({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="text-brand/70 pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 font-mono text-sm select-none"
      >
        {'{{'}
      </span>
      <Input
        id={id}
        aria-label={ariaLabel}
        className="h-8 px-6.5 font-mono text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          const unwrapped = /^\{\{.*\}\}$/.test(raw.trim())
            ? raw.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
            : raw
          onChange(unwrapped)
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <span
        aria-hidden
        className="text-brand/70 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-sm select-none"
      >
        {'}}'}
      </span>
    </div>
  )
}

function VariableRow({
  row,
  isUnused,
  onChange,
  onRemove,
}: {
  row: VariableFormRow
  isUnused: boolean
  onChange: (r: VariableFormRow) => void
  onRemove: () => void
}) {
  const optionalLocked = row.defaultValue.trim() !== ''
  const optionalChecked = isEffectivelyOptional(row)
  return (
    <div className="border-border/70 bg-white/[0.02] space-y-1.5 rounded-lg border p-2.5" data-slot="var-row">
      <div className={ROW_GRID}>
        <VariableNameField
          ariaLabel="Variable name"
          placeholder="email"
          value={row.id}
          onChange={(id) => {
            const next: VariableFormRow = { ...row, id }
            if (!row.label.trim() || row.label === labelFromId(row.id) || !row.id) {
              next.label = labelFromId(id)
            }
            onChange(next)
          }}
        />
        <Input
          aria-label="Display label"
          className="h-8 text-sm"
          placeholder="Work email"
          value={row.label}
          onChange={(e) => onChange({ ...row, label: e.target.value })}
        />
        <Select
          value={row.varType}
          onValueChange={(v) => onChange({ ...row, varType: v === 'select' ? 'select' : 'text' })}
        >
          <SelectTrigger size="sm" className="h-8 w-full text-sm" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="select">Choice list</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="Default value"
          className="h-8 text-sm"
          placeholder={row.varType === 'select' ? 'must match an option' : 'none'}
          value={row.defaultValue}
          onChange={(e) => onChange({ ...row, defaultValue: e.target.value })}
        />
        <div className="flex items-center justify-center gap-1">
          <Checkbox
            aria-label="Optional — the skill can run without this value"
            checked={optionalChecked}
            disabled={optionalLocked}
            onCheckedChange={(checked) => onChange({ ...row, optional: checked === true })}
          />
          {optionalLocked ? <span className="text-muted-foreground text-[0.65rem]">auto</span> : null}
        </div>
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Sensitive — mask this value in test history"
            checked={row.sensitive}
            onCheckedChange={(checked) => onChange({ ...row, sensitive: checked === true })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive justify-self-end"
          onClick={onRemove}
          aria-label={`Remove ${row.id || 'this variable'}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {row.varType === 'select' ? (
        <div className="flex items-center gap-2 pl-1">
          <Label className="text-muted-foreground shrink-0 text-xs">Options</Label>
          <Input
            className="h-7 text-sm"
            placeholder="small, medium, large"
            value={row.optionsText}
            onChange={(e) => onChange({ ...row, optionsText: e.target.value })}
          />
        </div>
      ) : null}
      {isUnused ? (
        <p className="text-status-warn flex items-center gap-1 pl-1 text-[0.7rem]">
          <span aria-hidden>▲</span> Not used in any step
        </p>
      ) : null}
    </div>
  )
}

export function ParameterizationInlinePanel({ workflow, onSaved, onClose }: Props) {
  // Computed once at mount from the server-loaded workflow, then never recomputed from props —
  // `workflow` can change under us after a successful "Replace everywhere" call (it re-fetches
  // and calls onSaved), and re-deriving rows from that would blow away any unsaved edits sitting
  // in the form (audit finding H3). A fresh ParameterizationInlinePanel mount (new skill_id, see
  // HumanEditPage's `key`) gets a fresh computation because it's a brand new component instance.
  const initial = useRef<{ rows: VariableFormRow[]; jsonDraft: string } | null>(null)
  if (initial.current === null) {
    const fromServer = rowsFromServerInputs(workflow.inputs)
    const spotted = collectVariableIdsFromSteps(workflow.steps)
    if (fromServer.length === 0 && spotted.length > 0) {
      const withSpotted = addSpottedToRows([], spotted)
      const payload = rowsToServerPayload(withSpotted)
      initial.current = { rows: withSpotted, jsonDraft: JSON.stringify(payload.ok ? payload.data : [], null, 2) }
    } else {
      initial.current = { rows: fromServer, jsonDraft: JSON.stringify(workflow.inputs, null, 2) }
    }
  }

  const [rows, setRows] = useState<VariableFormRow[]>(initial.current.rows)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonDraft, setJsonDraft] = useState(initial.current.jsonDraft)
  const [jsonErr, setJsonErr] = useState<string | null>(null)
  const [replaceFind, setReplaceFind] = useState('')
  const [replaceVariable, setReplaceVariable] = useState('')
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [replaceErr, setReplaceErr] = useState<string | null>(null)
  const [replaceInfo, setReplaceInfo] = useState<string | null>(null)

  const spottedIds = useMemo(() => collectVariableIdsFromSteps(workflow.steps), [workflow.steps])
  const missing = useMemo(() => missingSpottedIds(spottedIds, rows), [spottedIds, rows])
  const unused = useMemo(() => new Set(unusedRowIds(spottedIds, rows).map((id) => id.toLowerCase())), [spottedIds, rows])

  // Counts rows that differ from (or are missing from) what the server has saved, so the
  // footer can say something more useful than a bare "Save" prompt.
  const changedCount = useMemo(() => {
    const strip = ({ key: _key, ...rest }: VariableFormRow) => rest
    const saved = new Map(
      rowsFromServerInputs(workflow.inputs).map((r) => [r.id.trim().toLowerCase(), JSON.stringify(strip(r))]),
    )
    const seen = new Set<string>()
    let n = 0
    for (const r of rows) {
      const id = r.id.trim().toLowerCase()
      if (!id) continue
      seen.add(id)
      if (saved.get(id) !== JSON.stringify(strip(r))) n++
    }
    for (const id of saved.keys()) if (!seen.has(id)) n++
    return n
  }, [rows, workflow.inputs])

  const applyJsonToForm = () => {
    setJsonErr(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonDraft) as unknown
    } catch {
      setJsonErr('Not valid JSON')
      return
    }
    if (!Array.isArray(parsed)) {
      setJsonErr('JSON must be an array of variable objects')
      return
    }
    setRows(rowsFromServerInputs((parsed as Record<string, unknown>[]).map((o) => (typeof o === 'object' && o ? o : {}))))
  }

  const copyFormToJson = () => {
    const p = rowsToServerPayload(rows)
    if (p.ok) {
      setJsonDraft(JSON.stringify(p.data, null, 2))
      setJsonErr(null)
    } else {
      setJsonErr(p.error)
    }
  }

  const replaceLiteralInWorkflow = () => {
    setReplaceErr(null)
    setReplaceInfo(null)
    const find = replaceFind.trim()
    if (!find) {
      setReplaceErr('Enter the exact text to find (for example conxa-db).')
      return
    }
    const ph = normalizeVariablePlaceholder(replaceVariable)
    if (!ph.ok) {
      setReplaceErr(ph.error)
      return
    }
    setReplaceBusy(true)
    postWorkflowReplaceLiterals(workflow.skill_id, { find, replace_with: ph.value })
      .then(({ workflow: next, match_count }) => {
        onSaved(next)
        if (match_count > 0) {
          setReplaceInfo(`Replaced ${match_count} occurrence${match_count === 1 ? '' : 's'}.`)
          setReplaceFind('')
          setReplaceVariable('')
        } else {
          setReplaceInfo(`No matches for "${find}" in any step's typed value.`)
        }
      })
      .catch((e: Error) => setReplaceErr(e.message))
      .finally(() => setReplaceBusy(false))
  }

  const save = () => {
    setErr(null)
    const out = rowsToServerPayload(rows)
    if (!out.ok) {
      setErr(out.error)
      return
    }
    setSaving(true)
    patchSkillInputs(workflow.skill_id, { inputs: out.data })
      .then(() => fetchWorkflow(workflow.skill_id))
      .then((w: WorkflowResponse) => {
        onSaved(w)
        onClose()
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-3 p-5">
        {spottedIds.length > 0 ? (
          <div className="border-border/70 rounded-lg border bg-white/[0.02] p-3" data-slot="spotted">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Sparkles className="text-brand size-4 shrink-0" aria-hidden />
              <p className="text-foreground/90 text-sm font-medium">Used in your steps</p>
              {missing.length > 0 ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  {missing.length} new
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs font-normal">
                  All linked
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {spottedIds.map((id) => {
                // Case-insensitive to match the header "N new" count and dedup, which treat
                // {{Email}} and {{email}} as the same binding (audit finding L-4).
                const has = rows.some((r) => r.id.trim().toLowerCase() === id.toLowerCase())
                return (
                  <Badge
                    key={id}
                    variant={has ? 'outline' : 'default'}
                    className={cn('font-mono text-xs', has && 'text-muted-foreground font-normal')}
                  >
                    {`{{${id}}}`}
                  </Badge>
                )
              })}
            </div>
            {missing.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setRows((r) => addSpottedToRows(r, missing))}>
                  <Plus className="size-3.5" />
                  Add {missing.length === 1 ? `{{${missing[0]}}}` : `${missing.length} variables`}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Type <code className="bg-muted/60 rounded px-0.5">{'{{name}}'}</code> in any step field to create a variable.
          </p>
        )}

        <div className="space-y-2">
          {rows.length > 0 ? (
            <>
              <div className={cn(ROW_GRID, 'text-muted-foreground px-2.5 text-xs font-medium')}>
                <span>Name</span>
                <span>Label</span>
                <span>Type</span>
                <span>Default</span>
                <span className="flex items-center justify-center gap-1">
                  Optional
                  <InfoHint
                    size="sm"
                    label="Optional"
                    summary="The skill can run without this value. A variable with a default is always optional — the runtime fills the default in automatically."
                  />
                </span>
                <span className="flex items-center justify-center gap-1">
                  Sensitive
                  <InfoHint
                    size="sm"
                    label="Sensitive"
                    summary="Blanks this value out of saved test history, and helps pick the shipped bundle's authentication type from the variable's name."
                  />
                </span>
                <span />
              </div>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <VariableRow
                    key={row.key}
                    row={row}
                    isUnused={unused.has(row.id.trim().toLowerCase())}
                    onChange={(next) =>
                      setRows((prev) => {
                        const c = [...prev]
                        c[i] = next
                        return c
                      })
                    }
                    onRemove={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground py-2 text-center text-xs">No variables yet.</p>
          )}
          <button
            type="button"
            onClick={() => setRows((r) => [...r, newEmptyRow()])}
            className="border-border/50 text-muted-foreground hover:border-border hover:text-foreground flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-sm transition-colors"
          >
            <Plus className="size-3.5" />
            New variable
          </button>
        </div>

        <div className="border-border/70 space-y-2.5 rounded-lg border bg-white/[0.02] p-3">
          <h3 className="text-foreground/95 text-sm font-medium">Turn a recorded value into a variable</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Replaces a literal value inside typed step values only — selectors and other identity signals are left untouched.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="param-replace-find">
                Find this text in your steps
              </Label>
              <Input
                id="param-replace-find"
                className="h-8 font-mono text-sm"
                value={replaceFind}
                onChange={(e) => {
                  setReplaceFind(e.target.value)
                  setReplaceErr(null)
                }}
                spellCheck={false}
                placeholder="conxa-db"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="param-replace-var">
                Replace it with variable
              </Label>
              <VariableNameField
                id="param-replace-var"
                value={replaceVariable}
                onChange={(v) => {
                  setReplaceVariable(v)
                  setReplaceErr(null)
                }}
                placeholder="db_name"
              />
            </div>
          </div>
          {replaceErr ? <p className="text-destructive text-sm">{replaceErr}</p> : null}
          {replaceInfo ? <p className="text-muted-foreground text-sm">{replaceInfo}</p> : null}
          <div className="flex justify-start">
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={replaceBusy} onClick={() => void replaceLiteralInWorkflow()}>
              {replaceBusy ? 'Replacing…' : 'Replace everywhere'}
            </Button>
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium" type="button">
            {advancedOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Advanced: edit as JSON
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              <textarea
                className={cn(fieldTextareaClass, 'font-mono min-h-48 w-full text-xs')}
                value={jsonDraft}
                onChange={(e) => {
                  setJsonDraft(e.target.value)
                  setJsonErr(null)
                }}
                spellCheck={false}
                aria-label="Variables JSON"
              />
              {jsonErr ? <p className="text-destructive text-sm">{jsonErr}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={applyJsonToForm}>
                  Apply JSON to form
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={copyFormToJson}>
                  Load form into JSON
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      </ScrollArea>
      {err ? <p className="text-destructive shrink-0 px-5 pt-2 text-sm">{err}</p> : null}
      <div className="border-border/50 mx-5 mb-4 flex shrink-0 items-center justify-between gap-2 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          {changedCount > 0 ? `${changedCount} unsaved change${changedCount === 1 ? '' : 's'}` : 'All changes saved'}
        </p>
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save variables'}
        </Button>
      </div>
    </div>
  )
}
