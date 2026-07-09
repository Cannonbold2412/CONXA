import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StepEditorDTO } from '@/types/workflow'
import { BADGE_LABEL_CLASS, ConfidenceReadout, EngineBadge, OrthogonalityBadge, SourceBadge } from './identityBadges'

type Props = {
  step: StepEditorDTO
}

/**
 * Read-only "what the runtime currently trusts" view, shown in Phase 1 (Pick element) before
 * the reviewer decides whether to re-target anything. Built entirely from `step.identity_engines`
 * + `step.compile_confidence` — data already fetched for the page, so this costs no extra
 * backend call. Complements Phase 2 (Review selectors), which shows the same badge language for
 * the (possibly re-picked) candidates being applied.
 *
 * Note: this list is unpruned (every identity_bundle signal the compiler kept), unlike Phase 2's
 * candidate list, which drops non-unique / low-durability signals so only offerable selectors
 * are shown there — see `_prune_review_candidates` in `editor/retarget.py`.
 */
export function StepIdentitySummary({ step }: Props) {
  const signals = step.identity_engines ?? []

  if (signals.length === 0) {
    return null
  }

  return (
    <Card className="gap-2 bg-[linear-gradient(180deg,rgba(17,24,39,0.85),rgba(7,10,16,0.92))] py-3 ring-white/10">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 p-2.5 pb-1">
        <CardTitle className="text-sm font-semibold">Current identity</CardTitle>
        <ConfidenceReadout confidence={step.compile_confidence} />
      </CardHeader>
      <CardContent className="space-y-2.5 p-2.5 pt-0">
        <ol className="divide-border/60 overflow-hidden rounded-lg border border-border/60 divide-y">
          {signals.map((sig, i) => (
            <li key={`${sig.selector}-${i}`} className="px-3 py-2 text-sm">
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold tabular-nums text-muted-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EngineBadge engine={sig.engine} />
                    {sig.orthogonality_class ? <OrthogonalityBadge orthogonalityClass={sig.orthogonality_class} /> : null}
                    {sig.unique_at_compile ? (
                      <Badge variant="success" className={BADGE_LABEL_CLASS}>
                        Unique at compile
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className={BADGE_LABEL_CLASS}>
                        Not verified unique
                      </Badge>
                    )}
                    {sig.source ? <SourceBadge source={sig.source} /> : null}
                  </div>
                  <p className="block w-full break-all rounded-md border border-border/40 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-zinc-300">
                    {sig.selector}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="bg-brand h-full rounded-full"
                      style={{ width: `${Math.round(sig.durability * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[0.65rem] whitespace-nowrap text-zinc-500 tabular-nums">
                    {Math.round(sig.durability * 100)}%
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
