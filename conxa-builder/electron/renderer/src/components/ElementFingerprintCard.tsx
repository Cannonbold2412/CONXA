import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoHint } from '@/components/ui/info-hint'
import { editorHelp } from '@/lib/editorHelp'
import type { FingerprintView } from '@/types/workflow'

type Props = {
  fingerprint: FingerprintView | Record<string, never>
}

const FIELD_LABELS: [keyof FingerprintView, string][] = [
  ['role', 'Role'],
  ['tag', 'Tag'],
  ['inner_text', 'Visible text'],
  ['aria_label', 'ARIA label'],
  ['name', 'Name attribute'],
  ['placeholder', 'Placeholder'],
  ['label_text', 'Label text'],
  ['data_testid', 'Test ID'],
  ['input_type', 'Input type'],
]

/**
 * Read-only "what was recorded" card — a subset of identity_bundle.fingerprint, the resolver's
 * scoring oracle, previously invisible outside the compiler/runtime. Turns "the selector looks
 * weird" support tickets into self-service. See
 * research-analysis/Human-Edit-vs-Skill-Package.md §4 item 4.
 */
export function ElementFingerprintCard({ fingerprint }: Props) {
  if (!('role' in fingerprint)) return null
  const fp = fingerprint as FingerprintView
  const fields = FIELD_LABELS.filter(([key]) => String(fp[key] ?? '').trim())

  if (fields.length === 0 && fp.frame_depth === 0 && fp.shadow_depth === 0) return null

  return (
    <Card className="gap-2 bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] py-3 ring-white/10">
      <CardHeader className="p-2.5 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          What was recorded
          <InfoHint {...editorHelp.elementFingerprint} side="bottom" align="start" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-2.5 pt-0">
        {fields.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <div key={key} className="flex items-baseline justify-between gap-2 text-sm">
                <dt className="text-muted-foreground shrink-0">{label}</dt>
                <dd className="text-foreground min-w-0 truncate text-right">{String(fp[key])}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {(fp.frame_depth > 0 || fp.shadow_depth > 0) && (
          <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
            {fp.frame_depth > 0 ? (
              <Badge variant="outline" className="text-[0.65rem]">
                {fp.frame_depth} iframe{fp.frame_depth === 1 ? '' : 's'} deep
              </Badge>
            ) : null}
            {fp.shadow_depth > 0 ? (
              <Badge variant="outline" className="text-[0.65rem]">
                {fp.shadow_depth} shadow host{fp.shadow_depth === 1 ? '' : 's'} deep
              </Badge>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
