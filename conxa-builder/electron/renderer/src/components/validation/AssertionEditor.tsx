import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { InfoHint } from '@/components/ui/info-hint'
import { editorHelp } from '@/lib/editorHelp'
import { fieldSelectClass } from '@/lib/fieldStyles'
import { cn } from '@/lib/utils'
import type { StepEditorDTO } from '@/types/workflow'

/** Runtime-recognized assertion types (see runtime/run.js verifyStep), grouped by what they
 *  observe. Groups are rendered as <optgroup>s in the order declared here. */
export const ASSERTION_TYPE_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: 'URL',
    options: [
      { value: 'url_changed', label: 'URL changes' },
      { value: 'url_pattern', label: 'URL matches pattern' },
    ],
  },
  {
    label: 'Element on page',
    options: [
      { value: 'selector_present', label: 'Element appears' },
      { value: 'selector_absent', label: 'Element disappears' },
    ],
  },
  {
    label: 'Text on page',
    options: [
      { value: 'text_present', label: 'Text appears' },
      { value: 'text_absent', label: 'Text disappears' },
    ],
  },
  {
    label: 'Field value',
    options: [{ value: 'value_equals', label: 'Field holds value' }],
  },
  {
    label: 'Page state',
    options: [{ value: 'state_changed', label: 'Page changed (no-op guard)' }],
  },
]

export const ASSERTION_TYPES = ASSERTION_TYPE_GROUPS.flatMap((g) => g.options)

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

/** A check with a blank target (or blank expected value, for value_equals) never verifies
 *  anything at runtime — it silently no-ops. state_changed is the only type with no target. */
export function isAssertionValid(a: AssertionDraft): boolean {
  if (a.type !== 'state_changed' && !(a.target ?? '').trim()) return false
  if (a.type === 'value_equals' && !(a.expected ?? '').trim()) return false
  return true
}

export function hasInvalidAssertions(assertions: AssertionDraft[]): boolean {
  return assertions.some((a) => !isAssertionValid(a))
}

// Same gradient-fill + ring depth treatment as StepConfigForm's PANEL_CARD_CLASS (each panel
// file keeps its own copy of this small const rather than sharing one export — see
// RetargetPhaseSelectors.tsx for the same convention).
const PANEL_CARD_CLASS =
  'bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] ring-white/10'

/** Read-only "what confirms this step worked" summary — shown regardless of which re-target
 *  wizard phase is open (InlineRetargetFlow), so a user reviewing a step doesn't have to click
 *  all the way to the Validation phase just to see whether a check exists at all. Editing stays
 *  exclusively in that phase's own AssertionEditorRows / the Human Edit form's Validation panel
 *  — this never writes anything, so there's no risk of it fighting either of those save paths. */
export function ExpectedOutcomeSummary({ step }: { step: StepEditorDTO }) {
  const assertions = (step.validation?.assertions ?? []) as Record<string, unknown>[]
  return (
    <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          Expected outcome
          <InfoHint {...editorHelp.toolValidation} size="md" side="bottom" align="start" />
        </CardTitle>
        <CardDescription className="text-xs">{describeWaitFor(step.validation?.wait_for || {})}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 p-2.5 pt-0">
        {assertions.length ? (
          <ul className="space-y-1">
            {assertions.map((a, i) => (
              <li key={i} className={cn('text-sm', isAssertionRequired(a) ? 'text-zinc-100' : 'text-zinc-400')}>
                {isAssertionRequired(a) ? '' : '(informational) '}
                {describeAssertion(a)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-md border px-2.5 py-1.5 text-xs">
            No check configured for this step — its success isn&apos;t independently verified.
          </p>
        )}
      </CardContent>
    </Card>
  )
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
      <p className="text-muted-foreground text-xs leading-snug">
        Turn on <span className="text-foreground font-medium">Blocks step</span> for a check that must
        pass — the step fails if it doesn&apos;t. Checks left off are informational only and never fail
        the step.
      </p>

      {!hasRequired ? (
        <p className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-md border px-2.5 py-1.5 text-xs">
          No check is set to block — this step will pass even if the action had no effect. Turn on
          &quot;Blocks step&quot; for one check, or add one below.
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {assertions.map((a, i) => {
          const missingTarget = a.type !== 'state_changed' && !(a.target ?? '').trim()
          const missingExpected = a.type === 'value_equals' && !(a.expected ?? '').trim()
          return (
          <li key={i} className="border-border/50 bg-muted/15 hover:border-border rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="bg-muted text-muted-foreground mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-medium">
                  {i + 1}
                </span>
                <p className={cn('text-sm', isAssertionRequired(a) ? 'text-zinc-100' : 'text-zinc-400')}>
                  {isAssertionRequired(a) ? '' : '(informational) '}
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
                  <Label className="text-foreground text-xs" htmlFor={`assertion-type-${i}`}>
                    Check
                  </Label>
                  <select
                    id={`assertion-type-${i}`}
                    className={cn(fieldSelectClass, 'h-8 px-2 text-xs')}
                    value={a.type}
                    aria-describedby={`assertion-type-help-${i}`}
                    onChange={(e) => updateRow(i, { type: e.target.value })}
                  >
                    {ASSERTION_TYPE_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {a.type !== 'state_changed' ? (
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-foreground text-xs">{TARGET_LABEL[a.type] ?? 'Target'}</Label>
                    <Input
                      className={cn('h-8 text-xs', missingTarget && 'border-destructive focus-visible:ring-destructive/40')}
                      value={a.target ?? ''}
                      aria-invalid={missingTarget}
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
                  Blocks step
                </label>
              </div>
              <p id={`assertion-type-help-${i}`} className="text-muted-foreground text-xs leading-snug">
                {ASSERTION_TYPE_HELP[a.type] ?? ''}
              </p>
              {a.type === 'value_equals' ? (
                <div className="max-w-xs space-y-1">
                  <Label className="text-foreground text-xs">Expected value</Label>
                  <Input
                    className={cn('h-8 text-xs', missingExpected && 'border-destructive focus-visible:ring-destructive/40')}
                    value={a.expected ?? ''}
                    aria-invalid={missingExpected}
                    onChange={(e) => updateRow(i, { expected: e.target.value })}
                  />
                </div>
              ) : null}
              {missingTarget || missingExpected ? (
                <p className="text-destructive text-xs">
                  {missingTarget && missingExpected
                    ? 'Add a target and an expected value — an empty check never verifies anything.'
                    : missingTarget
                      ? 'Add a target for this check — an empty check never verifies anything.'
                      : 'Add an expected value — this check needs something to compare against.'}
                </p>
              ) : null}
            </div>
          </li>
          )
        })}
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
