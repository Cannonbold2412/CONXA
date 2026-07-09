import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fieldSelectClass } from '@/lib/fieldStyles'
import { cn } from '@/lib/utils'

/** Runtime-recognized assertion types (see runtime/run.js verifyStep). */
export const ASSERTION_TYPES = [
  { value: 'url_changed', label: 'URL changes' },
  { value: 'url_pattern', label: 'URL matches pattern' },
  { value: 'selector_present', label: 'Element appears' },
  { value: 'selector_absent', label: 'Element disappears' },
  { value: 'text_present', label: 'Text appears' },
  { value: 'text_absent', label: 'Text disappears' },
  { value: 'value_equals', label: 'Field holds value' },
  { value: 'state_changed', label: 'Page changed (no-op guard)' },
] as const

export const ASSERTION_TYPE_HELP: Record<string, string> = {
  url_changed: 'The page address must differ from what it was before the action.',
  url_pattern: 'The page address must match a regular expression.',
  selector_present: 'A selector must be present on the page.',
  selector_absent: 'A selector must no longer be present on the page.',
  text_present: 'Visible text must appear on the page.',
  text_absent: 'Visible text must no longer appear on the page.',
  value_equals: "The field's value must match (normalized, with a contains fallback).",
  state_changed: 'The page must show SOME observable change (URL, layout, or text) — catches a click that silently does nothing.',
}

// Types that take a selector/pattern/text in `target`. state_changed needs no target.
const TARGET_LABEL: Record<string, string> = {
  url_changed: 'URL prefix (blank = must just differ)',
  url_pattern: 'Regular expression',
  selector_present: 'Selector',
  selector_absent: 'Selector',
  text_present: 'Text',
  text_absent: 'Text',
  value_equals: 'Selector',
}

export type AssertionDraft = {
  type: string
  target?: string
  expected?: string
  timeout_ms?: number
  required?: boolean
}

export function describeWaitFor(wf: Record<string, unknown>): string {
  const type = String(wf.type ?? 'none')
  switch (type) {
    case 'none':
      return 'No wait — the step completes immediately.'
    case 'url_change':
      return 'Wait for the page address to change.'
    case 'element_appear': {
      const target = String(wf.target ?? '')
      return target ? `Wait for "${target}" to appear on the page.` : 'Wait for an element to appear on the page.'
    }
    case 'intent_outcome':
      return "Wait for the step's outcome to be confirmed."
    default:
      return `Wait condition: ${type}.`
  }
}

export function describeAssertion(a: Record<string, unknown>): string {
  const type = String(a.type ?? '')
  const target = String(a.target ?? '')
  const expected = String(a.expected ?? '')
  switch (type) {
    case 'url_changed':
      return 'The page address changes.'
    case 'url_pattern':
      return `The page address matches "${target}".`
    case 'selector_present':
      return `"${target}" is present on the page.`
    case 'selector_absent':
      return `"${target}" is no longer present on the page.`
    case 'text_present':
      return `The text "${target}" appears on the page.`
    case 'text_absent':
      return `The text "${target}" is no longer on the page.`
    case 'value_equals':
      return `"${target}" holds the value "${expected}".`
    case 'state_changed':
      return 'The page shows some observable change (nothing silently no-ops).'
    default:
      return `${type}: ${target}`
  }
}

export function isAssertionRequired(a: Record<string, unknown>): boolean {
  return a.required !== false
}

type RowsProps = {
  assertions: AssertionDraft[]
  onChange: (next: AssertionDraft[]) => void
}

/** Editable list of post-condition assertion rows — shared by the re-target wizard's
 *  Validation phase and the Human Edit screen's per-step Validation panel. */
export function AssertionEditorRows({ assertions, onChange }: RowsProps) {
  const hasRequired = assertions.some(isAssertionRequired)

  const updateRow = (index: number, patch: Partial<AssertionDraft>) => {
    onChange(assertions.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }
  const removeRow = (index: number) => {
    onChange(assertions.filter((_, i) => i !== index))
  }
  const addRow = () => {
    onChange([...assertions, { type: 'selector_present', target: '', timeout_ms: 5000, required: false }])
  }

  return (
    <div className="space-y-2">
      {!hasRequired ? (
        <p className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-md border px-2.5 py-1.5 text-xs">
          No enforced check — this step will pass even if the action had no effect. Mark one check
          &quot;Required&quot; or add one below.
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {assertions.map((a, i) => (
          <li key={i} className="border-border/50 bg-muted/15 hover:border-border rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="bg-muted text-muted-foreground mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-medium">
                  {i + 1}
                </span>
                <p className={cn('text-sm', isAssertionRequired(a) ? 'text-zinc-100' : 'text-zinc-400')}>
                  {isAssertionRequired(a) ? '' : '(optional) '}
                  {describeAssertion(a as Record<string, unknown>)}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive h-6 shrink-0 px-2" onClick={() => removeRow(i)}>
                Remove
              </Button>
            </div>
            <div className="mt-2.5 space-y-2.5 pl-7">
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="w-full space-y-1 sm:w-44">
                  <Label className="text-foreground text-xs">Check</Label>
                  <select
                    className={cn(fieldSelectClass, 'h-8 px-2 text-xs')}
                    value={a.type}
                    title={ASSERTION_TYPE_HELP[a.type] ?? ''}
                    onChange={(e) => updateRow(i, { type: e.target.value })}
                  >
                    {ASSERTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                {a.type !== 'state_changed' ? (
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-foreground text-xs">{TARGET_LABEL[a.type] ?? 'Target'}</Label>
                    <Input
                      className="h-8 text-xs"
                      value={a.target ?? ''}
                      onChange={(e) => updateRow(i, { target: e.target.value })}
                    />
                  </div>
                ) : null}
                <div className="w-32 shrink-0 space-y-1">
                  <Label className="text-foreground text-xs">Timeout (ms)</Label>
                  <Input
                    type="number"
                    className="h-8 tabular-nums text-xs"
                    min={0}
                    step={100}
                    value={a.timeout_ms ?? 5000}
                    onChange={(e) => updateRow(i, { timeout_ms: Number(e.target.value) || 0 })}
                  />
                </div>
                <label className="flex shrink-0 items-center gap-1.5 pb-1.5 text-xs text-zinc-300">
                  <Checkbox checked={isAssertionRequired(a)} onCheckedChange={(checked) => updateRow(i, { required: Boolean(checked) })} />
                  Required
                </label>
              </div>
              {a.type === 'value_equals' ? (
                <div className="max-w-xs space-y-1">
                  <Label className="text-foreground text-xs">Expected value</Label>
                  <Input
                    className="h-8 text-xs"
                    value={a.expected ?? ''}
                    onChange={(e) => updateRow(i, { expected: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full border-dashed border-white/15 bg-transparent text-zinc-300 hover:border-white/25 hover:bg-white/[0.04]"
        onClick={addRow}
      >
        + Add check
      </Button>
    </div>
  )
}
