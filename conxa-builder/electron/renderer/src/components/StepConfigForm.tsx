import { forwardRef, memo, useCallback, useEffect, useImperativeHandle } from 'react'
import { FormProvider, useForm, useFormState, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { StepEditorDTO, WorkflowResponse } from '../types/workflow'
import { patchStep, errorMessage } from '../api/workflowApi'
import { useEditorStore } from '../store/editorStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { InfoHint } from '@/components/ui/info-hint'
import { editorHelp } from '@/lib/editorHelp'
import { fieldSelectClass } from '@/lib/fieldStyles'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { AssertionEditorRows, describeWaitFor, hasInvalidAssertions, type AssertionDraft } from '@/components/validation/AssertionEditor'
import { ElementFingerprintCard } from '@/components/ElementFingerprintCard'
import { anchorRowsFromObjects, parseAnchorRows } from '@/lib/anchors'

// Same gradient-fill + ring depth treatment as PanelChrome (components/ui/panel-chrome.tsx),
// layered onto Card's className rather than swapping the component itself — Card's
// data-size-scaled CardHeader/CardContent padding relies on the group/card + data-[size] wiring
// that a plain PanelChrome div wrapper doesn't provide.
const PANEL_CARD_CLASS =
  'bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] ring-white/10'

type FormValues = {
  intent: string
  url: string
  scroll_mode: 'scroll_only' | 'scroll_to_locate'
  scroll_amount: string
  scroll_selector: string
  selectors: string[]
  value: string
  css: string
  aria: string
  text_based: string
  xpath: string
  anchors: string[]
  check_kind: string
  check_pattern: string
  check_threshold: string
  check_selector: string
  check_text: string
  assertions: AssertionDraft[]
}

const emptyForm: FormValues = {
  intent: '',
  url: '',
  scroll_mode: 'scroll_only',
  scroll_amount: '',
  scroll_selector: '',
  selectors: [''],
  value: '',
  css: '',
  aria: '',
  text_based: '',
  xpath: '',
  anchors: [''],
  check_kind: 'url',
  check_pattern: '',
  check_threshold: '0.9',
  check_selector: '',
  check_text: '',
  assertions: [],
}

const URL_CHECK_KINDS = new Set(['url', 'url_exact', 'url_must_be'])
const EXACT_URL_CHECK_KINDS = new Set(['url_exact', 'url_must_be'])

function frameChainFromStep(step: StepEditorDTO): Record<string, unknown>[] {
  const frame = step.frame || {}
  const chain = Array.isArray(frame.chain) ? frame.chain : []
  return chain.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function defaultsFromStep(step: StepEditorDTO): FormValues {
  const tgt = step.target as { primary_selector?: string; fallback_selectors?: string[] }
  const sel = step.selectors as { css?: string; aria?: string; text_based?: string; xpath?: string }
  const compiledSelectors = Array.isArray(step.compiled_selectors)
    ? step.compiled_selectors.map((selector) => String(selector || '').trim()).filter(Boolean)
    : []
  const targetSelectors = [String(tgt.primary_selector || ''), ...(tgt.fallback_selectors || [])].filter(
    (selector, index, arr) => index === 0 || Boolean(selector) || arr.length === 1,
  )
  const actionPayload = step.action_payload || {}
  const anc = anchorRowsFromObjects(step.anchors_signals || [])
  return {
    intent: step.intent || step.final_intent,
    url: step.url || '',
    scroll_mode: step.scroll_mode === 'scroll_to_locate' ? 'scroll_to_locate' : 'scroll_only',
    scroll_amount: step.scroll_amount === null || step.scroll_amount === undefined ? '' : String(step.scroll_amount),
    scroll_selector: String(step.scroll_selector || ''),
    selectors: targetSelectors.some(Boolean) ? targetSelectors : (compiledSelectors.length > 0 ? compiledSelectors : ['']),
    value:
      typeof step.value === 'string'
        ? step.value
        : typeof actionPayload.value === 'string'
          ? actionPayload.value
          : actionPayload.ms !== undefined && actionPayload.ms !== null
            ? String(actionPayload.ms)
            : step.value !== undefined && step.value !== null
              ? String(step.value)
              : '',
    css: String(sel.css || ''),
    aria: String(sel.aria || ''),
    text_based: String(sel.text_based || ''),
    xpath: String(sel.xpath || ''),
    anchors: anc.length > 0 ? anc : [''],
    check_kind: String(step.check_kind || 'url'),
    check_pattern: String(step.check_pattern || ''),
    check_threshold: String(step.check_threshold ?? 0.9),
    check_selector: String(step.check_selector || ''),
    check_text: String(step.check_text || ''),
    assertions: (step.validation.assertions || []) as AssertionDraft[],
  }
}

type Props = {
  step: StepEditorDTO | null
  skillId: string
  onWorkflowUpdated: (wf: WorkflowResponse) => void
  onHistoryUpdate?: (canUndo: boolean, canRedo: boolean) => void
  /** Hide the free-text selector list / CSS-ARIA-XPath channel cards / anchors, and the
   *  Validation panel — used when the re-target flow's own phases own selector picking and
   *  validation editing instead. */
  hideSelectorTools?: boolean
  /** Hide the "Save step" submit button — used when an outer flow already calls
   *  `submitIfDirty()` itself (e.g. the re-target wizard's Continue button), so a second,
   *  redundant manual save action isn't shown alongside it. */
  hideSubmitButton?: boolean
}

export type StepConfigFormHandle = {
  /** Saves the open step form if dirty. Returns whether save succeeded or was not needed. */
  submitIfDirty: () => Promise<boolean>
}

function humanizeAction(action: string): string {
  const cleaned = action.trim().replace(/[_-]+/g, ' ')
  if (!cleaned) return 'Action'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function stepActionKind(step: StepEditorDTO): string {
  return step.action_type.trim().toLowerCase().replace(/-/g, '_')
}

function actionSpecFlag(step: StepEditorDTO, key: string): boolean {
  return Boolean((step.action_spec || {})[key])
}

function actionValueLabel(step: StepEditorDTO): string {
  const raw = (step.action_spec || {}).value_label
  return typeof raw === 'string' && raw.trim() ? raw : 'Value'
}

function parseScrollAmount(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Scroll amount is required')
  if (!/^-?\d+$/.test(trimmed)) throw new Error('Scroll amount must be a whole number')
  return Number.parseInt(trimmed, 10)
}

function DirtySync({ stepIndex }: { stepIndex: number }) {
  const { isDirty } = useFormState()
  const markDirty = useEditorStore((s) => s.markStepDirty)
  const clearDirty = useEditorStore((s) => s.clearStepDirty)
  useEffect(() => {
    if (isDirty) markDirty(stepIndex)
    else clearDirty(stepIndex)
  }, [isDirty, stepIndex, markDirty, clearDirty])
  return null
}

type StepValidationPanelProps = {
  step: StepEditorDTO
  assertions: AssertionDraft[]
  onChange: (next: AssertionDraft[]) => void
}

/** Shows what confirms this step actually worked, and lets a human edit that check by hand
 *  (`docs/TRD.md` §10.2a VERIFY). Edits live in the same form state as the rest of the step —
 *  one "Save step" action saves both, instead of a second independent save control. */
function StepValidationPanel({ step, assertions, onChange }: StepValidationPanelProps) {
  return (
    <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          Validation
          <InfoHint {...editorHelp.toolValidation} size="md" side="bottom" align="start" />
        </CardTitle>
        <CardDescription className="text-xs">{describeWaitFor(step.validation.wait_for || {})}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-2.5 pt-0">
        <AssertionEditorRows assertions={assertions} onChange={onChange} />
      </CardContent>
    </Card>
  )
}

// memo: this stays mounted across all three re-target wizard phases (see InlineRetargetFlow's
// "kept mounted" comment) and that parent re-renders on every candidate edit/reorder in the
// Review Selectors phase — memo stops this form (react-hook-form + several child cards) from
// re-rendering on candidate changes that don't touch any of its own props.
export const StepConfigForm = memo(forwardRef<StepConfigFormHandle, Props>(
  function StepConfigForm({ step, skillId, onWorkflowUpdated, onHistoryUpdate, hideSelectorTools, hideSubmitButton }, ref) {
  const methods = useForm<FormValues>({ defaultValues: step ? defaultsFromStep(step) : emptyForm })

  useEffect(() => {
    if (step) {
      methods.reset(defaultsFromStep(step))
    }
  }, [step, methods])

  const persistStepValues = useCallback(
    async (values: FormValues, options?: { silentToast?: boolean }) => {
      if (!step) return
      const silent = options?.silentToast ?? false
      const editable = step.editable_fields
      const canEditField = (key: string) => editable[key] !== false
      const actionKind = stepActionKind(step)
      const isMarkerStep = actionSpecFlag(step, 'marker')
      const isCheckStep = actionKind === 'check' || actionKind === 'assert'
      const isNavigateStep = actionKind === 'navigate'
      if (isMarkerStep) return
      if (isNavigateStep) {
        const url = values.url.trim()
        if (!/^https?:\/\//i.test(url)) {
          const err = new Error('Navigate URL must start with http:// or https://')
          methods.setError('url', { message: err.message })
          if (!silent) toast.error(err.message)
          throw err
        }
        const patch: Record<string, unknown> = {
          intent: values.intent,
          url,
          action: {
            action: 'navigate',
            url,
          },
          validation: {
            wait_for: { type: 'url_change', target: url, timeout: 15000 },
            success_conditions: { url },
          },
        }
        if (canEditField('validation')) {
          patch.validation = { ...(patch.validation as Record<string, unknown>), assertions: values.assertions }
        }
        try {
          const res = await patchStep(skillId, step.step_index, patch, false)
          onWorkflowUpdated(res.workflow)
          if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
          const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
          if (next) methods.reset(defaultsFromStep(next))
          if (!silent) toast.success('Step saved')
          return
        } catch (e) {
          const msg = errorMessage(e, 'Save failed')
          methods.setError('root', { message: msg })
          if (!silent) toast.error(msg)
          throw e
        }
      }
      if (actionKind === 'wait') {
        const rawMs = values.value.trim() || '1000'
        if (!/^\d+$/.test(rawMs)) {
          const err = new Error('Wait milliseconds must be a non-negative whole number')
          methods.setError('value', { message: err.message })
          if (!silent) toast.error(err.message)
          throw err
        }
        const ms = Number.parseInt(rawMs, 10)
        const patch: Record<string, unknown> = {
          intent: values.intent,
          value: String(ms),
          action: {
            action: 'wait',
            ms,
            value: String(ms),
          },
        }
        if (canEditField('validation')) patch.validation = { assertions: values.assertions }
        try {
          const res = await patchStep(skillId, step.step_index, patch, false)
          onWorkflowUpdated(res.workflow)
          if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
          const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
          if (next) methods.reset(defaultsFromStep(next))
          if (!silent) toast.success('Step saved')
          return
        } catch (e) {
          const msg = errorMessage(e, 'Save failed')
          methods.setError('root', { message: msg })
          if (!silent) toast.error(msg)
          throw e
        }
      }
      if (actionKind === 'screenshot') {
        const patch: Record<string, unknown> = {
          intent: values.intent,
          action: {
            action: 'screenshot',
          },
        }
        if (canEditField('validation')) patch.validation = { assertions: values.assertions }
        try {
          const res = await patchStep(skillId, step.step_index, patch, false)
          onWorkflowUpdated(res.workflow)
          if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
          const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
          if (next) methods.reset(defaultsFromStep(next))
          if (!silent) toast.success('Step saved')
          return
        } catch (e) {
          const msg = errorMessage(e, 'Save failed')
          methods.setError('root', { message: msg })
          if (!silent) toast.error(msg)
          throw e
        }
      }
      if (isCheckStep) {
        const patch: Record<string, unknown> = {
          intent: values.intent,
          action: {
            action: actionKind,
          },
          check_kind: values.check_kind,
        }
        if (URL_CHECK_KINDS.has(values.check_kind)) {
          patch.check_pattern = values.check_pattern
          patch.signals = { anchors: [] }
          patch.recovery = { anchors: [] }
        }
        else if (values.check_kind === 'snapshot') patch.check_threshold = Number(values.check_threshold)
        else if (values.check_kind === 'selector') patch.check_selector = values.check_selector
        else if (values.check_kind === 'text') patch.check_text = values.check_text
        if (canEditField('validation')) patch.validation = { assertions: values.assertions }
        try {
          const res = await patchStep(skillId, step.step_index, patch, false)
          onWorkflowUpdated(res.workflow)
          if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
          const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
          if (next) methods.reset(defaultsFromStep(next))
          if (!silent) toast.success('Step saved')
          return
        } catch (e) {
          const msg = errorMessage(e, 'Save failed')
          methods.setError('root', { message: msg })
          if (!silent) toast.error(msg)
          throw e
        }
      }
      if (step.flags.is_scroll) {
        const patch: Record<string, unknown> = {
          intent: values.intent,
          action: {
            action: 'scroll',
          },
        }
        if (values.scroll_mode === 'scroll_to_locate') {
          const selector = values.scroll_selector.trim()
          if (!selector) {
            const err = new Error('Scroll target selector is required')
            methods.setError('scroll_selector', { message: err.message })
            if (!silent) toast.error(err.message)
            throw err
          }
          patch.action = {
            action: 'scroll',
            selector,
          }
        } else {
          const scrollAmount = parseScrollAmount(values.scroll_amount)
          patch.action = {
            action: 'scroll',
            delta: scrollAmount,
          }
        }
        if (canEditField('validation')) patch.validation = { assertions: values.assertions }
        try {
          const res = await patchStep(skillId, step.step_index, patch, false)
          onWorkflowUpdated(res.workflow)
          if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
          const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
          if (next) methods.reset(defaultsFromStep(next))
          if (!silent) toast.success('Step saved')
          return
        } catch (e) {
          const msg = errorMessage(e, 'Save failed')
          methods.setError('root', { message: msg })
          if (!silent) toast.error(msg)
          throw e
        }
      }
      const selectors = values.selectors
        .map((s) => s.trim())
        .filter(Boolean)
      const primarySelector = selectors[0] || ''
      const fallbackSelectors = selectors.slice(1)
      const anchors = parseAnchorRows(values.anchors)
      const patch: Record<string, unknown> = {
        intent: values.intent,
        action: {
          action: actionKind,
        },
        target: {
          primary_selector: primarySelector,
          fallback_selectors: fallbackSelectors,
        },
        signals: {
          selectors: {
            css: values.css || primarySelector,
            aria: values.aria,
            text_based: values.text_based,
            xpath: values.xpath,
          },
          anchors,
        },
      }
      if (canEditField('value')) {
        patch.value = values.value
        patch.action = {
          action: actionKind,
          value: values.value,
        }
      }
      if (canEditField('validation')) patch.validation = { assertions: values.assertions }
      try {
        const res = await patchStep(skillId, step.step_index, patch, false)
        onWorkflowUpdated(res.workflow)
        if (res.can_undo !== undefined) onHistoryUpdate?.(res.can_undo, res.can_redo ?? false)
        const next = res.workflow.steps.find((s) => s.step_index === step.step_index)
        if (next) methods.reset(defaultsFromStep(next))
        if (!silent) toast.success('Step saved')
      } catch (e) {
        const msg = errorMessage(e, 'Save failed')
        methods.setError('root', { message: msg })
        if (!silent) toast.error(msg)
        throw e
      }
    },
    [methods, onHistoryUpdate, onWorkflowUpdated, skillId, step],
  )

  useImperativeHandle(
    ref,
    () => ({
      submitIfDirty: async () => {
        if (!step) return true
        if (!methods.formState.isDirty) return true
        return await new Promise<boolean>((resolve) => {
          void methods.handleSubmit(
            async (values) => {
              try {
                await persistStepValues(values, { silentToast: true })
                resolve(true)
              } catch {
                resolve(false)
              }
            },
            () => resolve(false),
          )()
        })
      },
    }),
    [methods, persistStepValues, step],
  )

  const selectors = useWatch({ control: methods.control, name: 'selectors' }) || ['']
  const anchors = useWatch({ control: methods.control, name: 'anchors' }) || ['']
  const checkKind = useWatch({ control: methods.control, name: 'check_kind' }) || 'url'
  const scrollMode = useWatch({ control: methods.control, name: 'scroll_mode' }) || 'scroll_only'
  const assertions = useWatch({ control: methods.control, name: 'assertions' }) || []

  if (!step) {
    return (
      <div className="text-muted-foreground flex min-h-0 min-w-0 items-center justify-center p-4 text-sm">
        Select a step to edit
      </div>
    )
  }

  const editable = step.editable_fields
  const canEdit = (key: string) => editable[key] !== false
  const actionKind = stepActionKind(step)
  const isMarkerStep = actionSpecFlag(step, 'marker')
  const actionHasSelectors = actionSpecFlag(step, 'selectors')
  const actionHasValue = actionSpecFlag(step, 'value')
  const isCheckStep = actionKind === 'check' || actionKind === 'assert'
  const isNavigateStep = actionKind === 'navigate'
  const isScrollStep = step.flags.is_scroll || actionKind === 'scroll'
  const isWaitStep = actionKind === 'wait'
  const isScreenshotStep = actionKind === 'screenshot'
  const showSelectorAndAnchorTools =
    !hideSelectorTools &&
    actionHasSelectors && !isScrollStep && !isNavigateStep && !isMarkerStep && !(isCheckStep && URL_CHECK_KINDS.has(checkKind))
  const frameChain = frameChainFromStep(step)
  const assertionsInvalid = !hideSelectorTools && canEdit('validation') && hasInvalidAssertions(assertions)

  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      await persistStepValues(values, { silentToast: false })
    } catch {
      /* persistStepValues surfaces toast/error state */
    }
  })

  return (
    <FormProvider {...methods}>
      <DirtySync stepIndex={step.step_index} />
      <form onSubmit={onSubmit} className="space-y-2">
      <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Action: {humanizeAction(step.action_type)}
            <InfoHint {...editorHelp.actionStep} size="md" side="bottom" align="start" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-2.5 pt-0">
          <div className="grid gap-2">
            <Label htmlFor="intent">Intent</Label>
            <Input
              id="intent"
              type="text"
              disabled={!canEdit('intent')}
              {...methods.register('intent')}
            />
          </div>
          {isCheckStep ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="check_kind">Check type</Label>
                <select
                  id="check_kind"
                  className={fieldSelectClass}
                  {...methods.register('check_kind')}
                >
                  <option value="url">URL contains pattern</option>
                  <option value="url_exact">URL must be (exact)</option>
                  <option value="url_must_be">URL must be (exact match)</option>
                  <option value="snapshot">Snapshot similarity (≥ threshold)</option>
                  <option value="selector">Element present</option>
                  <option value="text">Text appears on page</option>
                </select>
              </div>
              {URL_CHECK_KINDS.has(checkKind) && (
                <div className="grid gap-2">
                  <Label htmlFor="check_pattern">
                    {EXACT_URL_CHECK_KINDS.has(checkKind) ? 'Expected URL' : 'URL pattern (substring)'}
                  </Label>
                  <Input
                    id="check_pattern"
                    type="text"
                    placeholder={EXACT_URL_CHECK_KINDS.has(checkKind) ? 'https://example.com/dashboard' : 'e.g., /dashboard'}
                    {...methods.register('check_pattern')}
                  />
                </div>
              )}
              {checkKind === 'snapshot' && (
                <div className="grid gap-2">
                  <Label htmlFor="check_threshold" className="flex items-center gap-1.5">
                    Similarity threshold (0.0 - 1.0)
                    <InfoHint {...editorHelp.matchThreshold} side="top" align="start" />
                  </Label>
                  <Input
                    id="check_threshold"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    defaultValue="0.9"
                    {...methods.register('check_threshold')}
                  />
                  <p className="text-muted-foreground text-xs">Default: 0.9 (90% match)</p>
                </div>
              )}
              {checkKind === 'selector' && (
                <div className="grid gap-2">
                  <Label htmlFor="check_selector">CSS selector</Label>
                  <Input
                    id="check_selector"
                    type="text"
                    placeholder="e.g., .success-message"
                    {...methods.register('check_selector')}
                  />
                </div>
              )}
              {checkKind === 'text' && (
                <div className="grid gap-2">
                  <Label htmlFor="check_text">Expected text</Label>
                  <Input
                    id="check_text"
                    type="text"
                    placeholder="e.g., Success"
                    {...methods.register('check_text')}
                  />
                </div>
              )}
            </>
          ) : null}
          {isNavigateStep ? (
            <div className="grid gap-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                disabled={!canEdit('url')}
                {...methods.register('url')}
              />
              {methods.formState.errors.url ? (
                <p className="text-destructive text-xs">{methods.formState.errors.url.message}</p>
              ) : null}
            </div>
          ) : null}
          {isScrollStep ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="scroll_mode">Scroll mode</Label>
                <select id="scroll_mode" className={fieldSelectClass} {...methods.register('scroll_mode')}>
                  <option value="scroll_only">Scroll only</option>
                  <option value="scroll_to_locate">Scroll to locate</option>
                </select>
              </div>
              {scrollMode === 'scroll_to_locate' ? (
                <div className="grid gap-2">
                  <Label htmlFor="scroll_selector">Target selector</Label>
                  <Input
                    id="scroll_selector"
                    type="text"
                    placeholder="text=Load more"
                    {...methods.register('scroll_selector')}
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="scroll_amount">Scroll amount</Label>
                  <Input
                    id="scroll_amount"
                    type="number"
                    inputMode="numeric"
                    placeholder="150"
                    {...methods.register('scroll_amount')}
                  />
                  <p className="text-muted-foreground text-xs">Use a signed number. Positive scrolls down; negative scrolls up.</p>
                </div>
              )}
            </>
          ) : null}
          {isMarkerStep ? (
            <div className="grid gap-2">
              <Label>Recorded marker</Label>
              <pre className="border-border/60 bg-muted/20 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-5 text-muted-foreground">
                {JSON.stringify(step.action_payload || {}, null, 2)}
              </pre>
            </div>
          ) : null}
          {actionHasSelectors && !hideSelectorTools ? (
            <>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="selector_0">Selectors</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit('selectors')}
                    onClick={() => methods.setValue('selectors', [...selectors, ''], { shouldDirty: true })}
                  >
                    Add selector
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Top selector is primary. Selectors below are fallbacks.
                </p>
                <div className="space-y-2">
                  {selectors.map((_, index) => (
                    <div key={`selector-${index}`} className="flex items-center gap-2">
                      <Input
                        id={`selector_${index}`}
                        type="text"
                        placeholder={index === 0 ? 'Primary selector' : `Fallback selector ${index}`}
                        disabled={!canEdit('selectors')}
                        {...methods.register(`selectors.${index}` as const)}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-7 w-7"
                        disabled={!canEdit('selectors') || selectors.length <= 1}
                        onClick={() =>
                          methods.setValue(
                            'selectors',
                            selectors.filter((_, i) => i !== index),
                            { shouldDirty: true },
                          )
                        }
                        aria-label={`Remove selector ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {!isMarkerStep && actionHasValue ? (
            <div className="grid gap-2">
              <Label htmlFor="value">{actionValueLabel(step)}</Label>
              <Input
                id="value"
                type={isWaitStep ? 'number' : 'text'}
                inputMode={isWaitStep ? 'numeric' : undefined}
                disabled={!canEdit('value')}
                placeholder={isWaitStep ? '1000' : isScreenshotStep ? '' : undefined}
                {...methods.register('value')}
              />
              {methods.formState.errors.value ? (
                <p className="text-destructive text-xs">{methods.formState.errors.value.message}</p>
              ) : null}
            </div>
          ) : null}
      </CardContent>
      </Card>

      {!hideSelectorTools && canEdit('validation') ? (
        <StepValidationPanel
          step={step}
          assertions={assertions}
          onChange={(next) => methods.setValue('assertions', next, { shouldDirty: true })}
        />
      ) : null}

      {showSelectorAndAnchorTools ? (
      <>
      <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-base font-semibold">Selector channels</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 p-2.5 pt-0">
          <div className="grid gap-1.5">
            <Label htmlFor="css">CSS</Label>
            <Input id="css" disabled={!canEdit('selectors')} {...methods.register('css')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aria">ARIA</Label>
            <Input
              id="aria"
              disabled={!canEdit('selectors')}
              {...methods.register('aria')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="text_based">Text-based</Label>
            <Input
              id="text_based"
              disabled={!canEdit('selectors')}
              {...methods.register('text_based')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="xpath">XPath</Label>
            <Input
              id="xpath"
              disabled={!canEdit('selectors')}
              {...methods.register('xpath')}
            />
          </div>
        </CardContent>
      </Card>

      {frameChain.length > 0 ? (
        <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
          <CardHeader className="p-2.5 pb-1">
            <CardTitle className="text-base font-semibold">Frame context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-2.5 pt-0">
            {frameChain.map((frame, index) => (
              <div key={`frame-${index}`} className="border-border/60 bg-muted/20 rounded-md border p-2">
                <p className="truncate font-mono text-[11px]">{String(frame.selector || '')}</p>
                {Array.isArray(frame.fallback_selectors) && frame.fallback_selectors.length > 0 ? (
                  <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
                    {frame.fallback_selectors.map((item) => String(item)).join(' | ')}
                  </p>
                ) : null}
                {frame.url_pattern ? (
                  <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
                    {String(frame.url_pattern)}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className={cn('gap-2 py-3', PANEL_CARD_CLASS)}>
        <CardHeader className="p-2.5 pb-1">
          <CardTitle className="text-base font-semibold">Anchors</CardTitle>
          <CardDescription className="text-xs">Use format `relation:element`; above/below describes the target relative to that anchor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 p-2.5 pt-0">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="anchor_0">Anchors</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit('anchors')}
              onClick={() => methods.setValue('anchors', [...anchors, ''], { shouldDirty: true })}
            >
              Add anchor
            </Button>
          </div>
          <div className="space-y-1.5">
            {anchors.map((_, index) => (
              <div key={`anchor-${index}`} className="flex items-center gap-1.5">
                <Input
                  id={`anchor_${index}`}
                  type="text"
                  placeholder={index === 0 ? 'near:Sign in' : `Anchor ${index + 1}`}
                  disabled={!canEdit('anchors')}
                  {...methods.register(`anchors.${index}` as const)}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 w-7"
                  disabled={!canEdit('anchors') || anchors.length <= 1}
                  onClick={() =>
                    methods.setValue(
                      'anchors',
                      anchors.filter((_, i) => i !== index),
                      { shouldDirty: true },
                    )
                  }
                  aria-label={`Remove anchor ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </>
      ) : null}

      {!isMarkerStep ? <ElementFingerprintCard fingerprint={step.fingerprint} /> : null}

      {!hideSubmitButton ? (
        <>
          <Separator />
          <div className="flex items-center justify-end gap-2.5">
            {assertionsInvalid ? (
              <p className="text-destructive text-xs">Fill in the missing checks above before saving.</p>
            ) : null}
            <Button type="submit" size="default" disabled={methods.formState.isSubmitting || isMarkerStep || assertionsInvalid}>
              {methods.formState.isSubmitting ? 'Saving…' : 'Save step'}
            </Button>
          </div>
        </>
      ) : null}
      {methods.formState.errors.root ? (
        <p className="text-destructive text-sm">{(methods.formState.errors.root as { message?: string }).message}</p>
      ) : null}
        </form>
      </FormProvider>
  )
}))
