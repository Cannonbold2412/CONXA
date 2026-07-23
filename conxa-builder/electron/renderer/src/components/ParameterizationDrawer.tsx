import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { WorkflowResponse } from '../types/workflow'
import { fetchWorkflow, patchSkillInputs, postWorkflowReplaceLiterals } from '../api/workflowApi'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fieldSelectClass, fieldTextareaClass } from '@/lib/fieldStyles'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  addSpottedToRows,
  collectVariableIdsFromSteps,
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
  open: boolean
  onClose: () => void
  workflow: WorkflowResponse
  onSaved: (w: WorkflowResponse) => void
}

type FormProps = {
  open: boolean
  workflow: WorkflowResponse
  onClose: () => void
  onSaved: (w: WorkflowResponse) => void
  inline?: boolean
}

function VariableRow({
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  row: VariableFormRow
  onChange: (r: VariableFormRow) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div
      className="border-border/70 bg-card/20 grid gap-2.5 rounded-lg border p-2.5 sm:grid-cols-2 lg:grid-cols-12"
      data-slot="var-row"
    >
      <div className="space-y-1.5 lg:col-span-4">
        <Label className="text-xs" htmlFor={`var-id-${row.key}`}>
          Variable name
        </Label>
        <Input
          id={`var-id-${row.key}`}
          className="h-8 font-mono text-sm"
          placeholder="email"
          value={row.id}
          onChange={(e) => {
            const id = e.target.value
            const next: VariableFormRow = { ...row, id }
            if (!row.label.trim() || row.label === labelFromId(row.id) || !row.id) {
              next.label = labelFromId(id)
            }
            onChange(next)
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <p className="text-muted-foreground overflow-hidden text-[0.65rem] leading-none whitespace-nowrap text-ellipsis">
          <code className="bg-muted/80 rounded px-0.5">{'{{' + (row.id || 'id') + '}}'}</code>
        </p>
      </div>
      <div className="space-y-1.5 lg:col-span-4">
        <Label className="text-xs" htmlFor={`var-label-${row.key}`}>
          Display label
        </Label>
        <Input
          id={`var-label-${row.key}`}
          className="h-8 text-sm"
          placeholder="Work email"
          value={row.label}
          onChange={(e) => onChange({ ...row, label: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 lg:col-span-4">
        <Label className="text-xs" htmlFor={`var-type-${row.key}`}>
          Type
        </Label>
        <select
          id={`var-type-${row.key}`}
          className={cn(fieldSelectClass, 'h-8 w-full min-w-0 text-sm')}
          value={row.varType}
          onChange={(e) => {
            const v = e.target.value === 'select' ? 'select' : 'text'
            onChange({ ...row, varType: v })
          }}
        >
          <option value="text">Text</option>
          <option value="select">Choice list</option>
        </select>
      </div>
      {row.varType === 'select' ? (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-12">
          <Label className="text-xs" htmlFor={`var-opt-${row.key}`}>
            Options (comma-separated)
          </Label>
          <Input
            id={`var-opt-${row.key}`}
            className="h-8 text-sm"
            placeholder="small, medium, large"
            value={row.optionsText}
            onChange={(e) => onChange({ ...row, optionsText: e.target.value })}
          />
        </div>
      ) : null}
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-8">
        <Label className="text-xs" htmlFor={`var-default-${row.key}`}>
          Default (optional)
        </Label>
        <Input
          id={`var-default-${row.key}`}
          className="h-8 text-sm"
          placeholder={row.varType === 'select' ? 'must match one option' : 'used when not provided'}
          value={row.defaultValue}
          onChange={(e) => onChange({ ...row, defaultValue: e.target.value })}
        />
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <label className="text-muted-foreground flex items-center gap-1.5 pb-1.5 text-xs">
          <input
            type="checkbox"
            checked={row.sensitive}
            onChange={(e) => onChange({ ...row, sensitive: e.target.checked })}
          />
          Sensitive (mask value)
        </label>
      </div>
      <div className="flex items-end justify-end sm:col-span-2 lg:col-span-12">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 gap-1 px-2"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
          Remove
        </Button>
      </div>
    </div>
  )
}

function ParameterizationForm({ open, workflow, onClose, onSaved, inline = false }: FormProps) {
  const [rows, setRows] = useState<VariableFormRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonErr, setJsonErr] = useState<string | null>(null)
  const [replaceFind, setReplaceFind] = useState('')
  const [replaceVariable, setReplaceVariable] = useState('')
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [replaceErr, setReplaceErr] = useState<string | null>(null)
  const [replaceInfo, setReplaceInfo] = useState<string | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      const fromServer = rowsFromServerInputs(workflow.inputs)
      const spotted = collectVariableIdsFromSteps(workflow.steps)
      if (fromServer.length === 0 && spotted.length > 0) {
        const withSpotted = addSpottedToRows([], spotted)
        setRows(withSpotted)
        const payload = rowsToServerPayload(withSpotted)
        setJsonDraft(
          JSON.stringify(
            payload.ok ? payload.data : [],
            null,
            2,
          ),
        )
      } else {
        setRows(fromServer)
        setJsonDraft(JSON.stringify(workflow.inputs, null, 2))
      }
      setErr(null)
      setJsonErr(null)
      setReplaceFind('')
      setReplaceVariable('')
      setReplaceErr(null)
      setReplaceInfo(null)
      setAdvancedOpen(false)
    }
    wasOpen.current = open
  }, [open, workflow])

  const spottedIds = useMemo(
    () => collectVariableIdsFromSteps(workflow.steps),
    [workflow.steps],
  )
  const missing = useMemo(() => missingSpottedIds(spottedIds, rows), [spottedIds, rows])
  const unused = useMemo(() => unusedRowIds(spottedIds, rows), [spottedIds, rows])

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
    setRows(
      rowsFromServerInputs(
        (parsed as Record<string, unknown>[]).map((o) => (typeof o === 'object' && o ? o : {})),
      ),
    )
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
    postWorkflowReplaceLiterals(workflow.skill_id, {
      find,
      replace_with: ph.value,
    })
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea
        className={cn(
          'min-h-0 pr-1',
          inline
            ? 'h-full flex-1'
            : 'max-h-[min(480px,calc(100dvh-11rem))] sm:max-h-[min(560px,calc(100dvh-10rem))]',
        )}
      >
        <div className={cn('pb-3', inline ? 'space-y-3 pt-2' : 'space-y-4 px-4')}>
          {spottedIds.length > 0 ? (
            <div
              className={cn(
                'border-border/70 rounded-lg border p-3',
                inline ? 'bg-white/[0.02]' : 'border-dashed bg-gradient-to-br from-primary/6 to-muted/5',
              )}
              data-slot="spotted"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Sparkles className="text-primary size-4 shrink-0" aria-hidden />
                <p className="text-foreground/90 text-sm font-medium">Found in your workflow</p>
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
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={() => setRows((r) => addSpottedToRows(r, missing))}
                  >
                    <Plus className="size-3.5" />
                    Add {missing.length === 1 ? `{{${missing[0]}}}` : `${missing.length} variables`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Type <code className="bg-muted/60 rounded px-0.5">{'{{name}}'}</code> in any step field to create a
              variable.
            </p>
          )}

          <div className={cn('border-border/70 space-y-2.5 rounded-lg border p-3', inline ? 'bg-white/[0.02]' : '')}>
            <h3 className="text-foreground/95 text-sm font-medium">Find &amp; replace</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Replace a recorded value inside typed step values only — selectors and other
              identity signals are left untouched.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="param-replace-find">
                  Find
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
                  Replace with
                </Label>
                <Input
                  id="param-replace-var"
                  className="h-8 font-mono text-sm"
                  value={replaceVariable}
                  onChange={(e) => {
                    setReplaceVariable(e.target.value)
                    setReplaceErr(null)
                  }}
                  spellCheck={false}
                  placeholder="db_name or {{db_name}}"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            </div>
            {replaceErr ? <p className="text-destructive text-sm">{replaceErr}</p> : null}
            {replaceInfo ? <p className="text-muted-foreground text-sm">{replaceInfo}</p> : null}
            <div className="flex justify-start">
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={replaceBusy}
                onClick={() => void replaceLiteralInWorkflow()}
              >
                {replaceBusy ? 'Replacing…' : 'Replace everywhere'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-foreground/95 text-sm font-medium">Variables</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5"
                onClick={() => setRows((r) => [...r, newEmptyRow()])}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
            {unused.length > 0 ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Not used in any step: {unused.map((id) => `{{${id}}}`).join(', ')}.
              </p>
            ) : null}
            {rows.length === 0 ? (
              <p className="text-muted-foreground border-border/50 rounded-lg border border-dashed p-3 text-center text-sm">
                No variables yet.
              </p>
            ) : (
              <div className={cn(inline ? 'space-y-2.5' : 'space-y-3')}>
                {rows.map((row, i) => (
                  <VariableRow
                    key={row.key}
                    row={row}
                    onChange={(next) => {
                      setRows((prev) => {
                        const c = [...prev]
                        c[i] = next
                        return c
                      })
                    }}
                    onRemove={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    canRemove
                  />
                ))}
              </div>
            )}
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
              type="button"
            >
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={applyJsonToForm}
                  >
                    Apply JSON to form
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={copyFormToJson}
                  >
                    Load form into JSON
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
      {err ? <p className={cn('text-destructive border-border/50 shrink-0 text-sm', !inline && 'mx-4')}>{err}</p> : null}
      <div className={cn('border-border/50 mt-2 flex shrink-0 flex-col-reverse gap-2 border-t pb-3 pt-3 sm:flex-row sm:justify-end', !inline && 'px-4')}>
        {!inline ? (
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save variables'}
        </Button>
      </div>
    </div>
  )
}

export function ParameterizationDrawer({ open, onClose, workflow, onSaved }: Props) {
  // Keyed on skill_id only — NOT package_meta.version. The version bumps on every save
  // (including "Replace everywhere"), and remounting on that would blow away any unsaved
  // row edits sitting in the form (audit finding H3). ParameterizationForm's own open-edge
  // effect already reloads from the server when appropriate; it doesn't need a remount too.
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        className="flex w-full min-w-0 min-h-0 flex-col overflow-hidden p-0 sm:max-w-lg"
        side="right"
      >
        <SheetHeader className="p-4 pb-2 text-left">
          <SheetTitle id="param-drawer-title">Variables</SheetTitle>
          <SheetDescription>
            Set names and labels for values you use as{' '}
            <code className="bg-muted rounded px-1">{'{{id}}'}</code> in your steps. Names you type in
            steps appear automatically in &quot;Found in your workflow&quot; above.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ParameterizationForm
            key={workflow.skill_id}
            open={open}
            workflow={workflow}
            onClose={onClose}
            onSaved={onSaved}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ParameterizationInlinePanel({ workflow, onSaved }: Omit<Props, 'open' | 'onClose'>) {
  return (
    <ParameterizationForm
      key={`${workflow.skill_id}-inline`}
      open
      workflow={workflow}
      onClose={() => {}}
      onSaved={onSaved}
      inline
    />
  )
}
