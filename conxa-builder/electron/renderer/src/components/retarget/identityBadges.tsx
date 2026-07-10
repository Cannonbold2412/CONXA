import {
  Accessibility,
  Cpu,
  Hash,
  Layers,
  type LucideIcon,
  PencilLine,
  Quote,
  Route,
  Sparkles,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Shared badge styling + label/icon maps for the identity metadata surfaced from
 * identity_bundle signals (engine, orthogonality_class, source) — used by the Review Selectors
 * phase (RetargetPhaseSelectors). */

export const BADGE_LABEL_CLASS = 'text-[10px] font-semibold tracking-wide uppercase'

export const ENGINE_LABELS: Record<string, string> = {
  testid: 'Test ID',
  role: 'Role',
  aria: 'Aria label',
  name: 'Name attribute',
  'css-id': 'CSS ID',
  text_based: 'Visible text',
  'css-structural': 'Structural CSS',
  xpath: 'XPath',
  manual: 'Manual',
}

export const ENGINE_ICONS: Record<string, LucideIcon> = {
  testid: Hash,
  role: Accessibility,
  aria: Accessibility,
  name: PencilLine,
  'css-id': Hash,
  text_based: Quote,
  'css-structural': Layers,
  xpath: Route,
  manual: PencilLine,
}

export function EngineBadge({ engine }: { engine: string }) {
  const Icon = ENGINE_ICONS[engine] ?? Layers
  return (
    <Badge variant="secondary" className={cn(BADGE_LABEL_CLASS, 'gap-1')}>
      <Icon className="size-3" aria-hidden />
      {ENGINE_LABELS[engine] ?? engine}
    </Badge>
  )
}

// test-contract | semantic-aria | visible-text | spatial-anchor | structural — see
// compiler/selector_score.py's _ENGINE_ORTHOGONALITY. Signals in different classes are
// independent axes of identity; a step with >=2 classes represented is more resilient to a
// single kind of UI change than one relying on several signals from the same class.
export const ORTHOGONALITY_LABELS: Record<string, string> = {
  'test-contract': 'Test contract',
  'semantic-aria': 'Semantic / ARIA',
  'visible-text': 'Visible text',
  'spatial-anchor': 'Spatial anchor',
  structural: 'Structural',
}

export const ORTHOGONALITY_ICONS: Record<string, LucideIcon> = {
  'test-contract': Hash,
  'semantic-aria': Accessibility,
  'visible-text': Quote,
  'spatial-anchor': Route,
  structural: Layers,
}

export function OrthogonalityBadge({ orthogonalityClass }: { orthogonalityClass: string }) {
  if (!orthogonalityClass) return null
  const Icon = ORTHOGONALITY_ICONS[orthogonalityClass] ?? Layers
  return (
    <Badge variant="outline" className={cn(BADGE_LABEL_CLASS, 'gap-1')}>
      <Icon className="size-3" aria-hidden />
      {ORTHOGONALITY_LABELS[orthogonalityClass] ?? orthogonalityClass}
    </Badge>
  )
}

// compiler | llm | input_bound | user — where this selector's text came from (see
// IdentitySignal.source in packages/conxa-core).
export const SOURCE_LABELS: Record<string, string> = {
  compiler: 'Compiler',
  llm: 'AI-assisted',
  input_bound: 'Input-bound',
  user: 'Manual edit',
}

export const SOURCE_ICONS: Record<string, LucideIcon> = {
  compiler: Cpu,
  llm: Sparkles,
  input_bound: PencilLine,
  user: User,
}

export function SourceBadge({ source }: { source: string }) {
  if (!source) return null
  const Icon = SOURCE_ICONS[source] ?? Cpu
  return (
    <Badge variant="outline" className={cn(BADGE_LABEL_CLASS, 'gap-1 text-zinc-400')}>
      <Icon className="size-3" aria-hidden />
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  )
}

/** Compact "N%" read-out for a step's compile_confidence rollup (0-1, or null/undefined when
 * there's no identity_bundle to derive it from). */
export function ConfidenceReadout({ confidence }: { confidence: number | null | undefined }) {
  if (confidence === null || confidence === undefined) return null
  const pct = Math.round(confidence * 100)
  const tone = pct >= 80 ? 'text-status-ok' : pct >= 50 ? 'text-status-warn' : 'text-status-error'
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      Compile confidence
      <span className={cn('font-semibold tabular-nums', tone)}>{pct}%</span>
    </span>
  )
}
