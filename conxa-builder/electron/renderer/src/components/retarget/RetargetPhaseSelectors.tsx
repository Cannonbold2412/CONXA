import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RetargetCandidate, RetargetPreviewResponse } from '@/api/workflowApi'

const ENGINE_LABELS: Record<string, string> = {
  testid: 'Test ID',
  role: 'Role',
  aria: 'Aria label',
  name: 'Name attribute',
  'css-id': 'CSS ID',
  text_based: 'Visible text',
  'css-structural': 'Structural CSS',
  xpath: 'XPath',
}

function UniquenessBadge({ candidate }: { candidate: RetargetCandidate }) {
  // Prefer the explicit verified status (set from the compile-time uniqueness check); fall back
  // to inferring it from match_count for any candidate that predates that field.
  const verified =
    candidate.verified ??
    (candidate.match_count === 1 ? 'unique' : candidate.match_count < 0 ? 'unverified' : 'not_unique')

  if (verified === 'unique') {
    return <Badge variant="success">Unique match</Badge>
  }
  if (verified === 'unverified') {
    return <Badge variant="secondary">Checked at run time</Badge>
  }
  return (
    <Badge variant="destructive">
      {candidate.match_count > 1 ? `Matches ${candidate.match_count} elements` : 'Not unique'}
    </Badge>
  )
}

type Props = {
  preview: RetargetPreviewResponse
  selectedIndex: number
  manualSelector: string
  onSelect: (index: number) => void
  onManualSelectorChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}

export function RetargetPhaseSelectors({
  preview,
  selectedIndex,
  manualSelector,
  onSelect,
  onManualSelectorChange,
  onBack,
  onContinue,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasManual = manualSelector.trim().length > 0
  const canContinue = hasManual || preview.candidates.length > 0

  return (
    <div className="space-y-3">
      {preview.pick_quality === 'ambiguous' ? (
        <div className="border-status-warn/30 bg-status-warn/10 text-status-warn rounded-lg border p-3 text-sm">
          None of the generated selectors look durable for this element. You can pick one anyway, try a
          different region, or enter a selector manually below.
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onBack}>
              ← Re-pick element
            </Button>
          </div>
        </div>
      ) : null}
      {preview.pick_quality === 'none' ? (
        <div className="border-status-error/30 bg-status-error/10 text-status-error rounded-lg border p-3 text-sm">
          No usable selector could be generated for this region.
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onBack}>
              ← Re-pick element
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {preview.candidates.map((c, i) => (
          <label
            key={`${c.selector}-${i}`}
            className={cn(
              'flex cursor-pointer flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm',
              selectedIndex === i && !hasManual
                ? 'border-brand/40 bg-brand-subtle'
                : 'border-border/60 bg-background/30 hover:bg-background/50',
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="retarget-candidate"
                checked={selectedIndex === i && !hasManual}
                onChange={() => {
                  onSelect(i)
                  onManualSelectorChange('')
                }}
              />
              <span className="font-medium text-zinc-200">{c.descriptor}</span>
              <Badge variant="secondary">{ENGINE_LABELS[c.engine] ?? c.engine}</Badge>
              <UniquenessBadge candidate={c} />
            </div>
            <code className="ml-6 block break-all font-mono text-xs text-zinc-300">{c.selector}</code>
            <div className="ml-6 flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${Math.round(c.durability * 100)}%` }}
                />
              </div>
              <span className="text-[0.65rem] text-zinc-500">{Math.round(c.durability * 100)}% durable</span>
            </div>
          </label>
        ))}
      </div>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {showAdvanced ? 'Hide' : 'Show'} manual selector override
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs">Manual selector override</label>
            <Input
              value={manualSelector}
              onChange={(e) => onManualSelectorChange(e.target.value)}
              placeholder='e.g. [data-testid="submit-btn"]'
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Re-pick element
        </Button>
        <Button onClick={onContinue} disabled={!canContinue}>
          Continue →
        </Button>
      </div>
    </div>
  )
}
