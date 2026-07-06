import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { RetargetPreviewResponse } from '@/api/workflowApi'

function describeWaitFor(wf: Record<string, unknown>): string {
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

function describeAssertions(assertions: Record<string, unknown>[]): string[] {
  return assertions.map((a) => {
    const type = String(a.type ?? '')
    const target = String(a.target ?? '')
    const required = a.required !== false
    const prefix = required ? '' : '(optional) '
    switch (type) {
      case 'url_changed':
        return `${prefix}The page address changes.`
      case 'selector_present':
        return `${prefix}"${target}" is present on the page.`
      case 'text_present':
        return `${prefix}The text "${target}" appears on the page.`
      default:
        return `${prefix}${type}: ${target}`
    }
  })
}

type Props = {
  preview: RetargetPreviewResponse
  keepValidation: boolean
  onKeepValidationChange: (value: boolean) => void
  onBack: () => void
  onApply: () => void
  applying: boolean
}

export function RetargetPhaseValidation({
  preview,
  keepValidation,
  onKeepValidationChange,
  onBack,
  onApply,
  applying,
}: Props) {
  if (preview.fast_finish) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-emerald-300">
          Selectors look strong and how this step is checked hasn&apos;t changed.
        </p>
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <Button onClick={onApply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        How this step confirms it worked may need to change for the new element.
      </p>

      {preview.validation_changed ? (
        <div className="space-y-3">
          <div className="border-border/60 bg-background/30 rounded-lg border p-3 text-sm">
            <p className="font-medium text-zinc-300">Currently</p>
            <p className="text-zinc-400">{describeWaitFor(preview.current_wait_for)}</p>
            {describeAssertions(preview.current_assertions).map((line, i) => (
              <p key={i} className="text-zinc-500">
                – {line}
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
            <p className="font-medium text-sky-200">Proposed</p>
            <p className="text-sky-100/90">{describeWaitFor(preview.proposed_wait_for)}</p>
            {describeAssertions(preview.proposed_assertions).map((line, i) => (
              <p key={i} className="text-sky-100/70">
                + {line}
              </p>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox
              checked={keepValidation}
              onCheckedChange={(checked) => onKeepValidationChange(Boolean(checked))}
            />
            Keep the existing check instead of the proposed one
          </label>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">{describeWaitFor(preview.current_wait_for)}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onApply} disabled={applying}>
          {applying ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </div>
  )
}
