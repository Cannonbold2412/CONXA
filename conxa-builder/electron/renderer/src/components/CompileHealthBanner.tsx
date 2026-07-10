import { AlertTriangle, CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CompileHealth } from '@/types/workflow'
import { useEditorStore } from '@/store/editorStore'
import { cn } from '@/lib/utils'

type Props = {
  compileHealth: CompileHealth
  onOpenDiagnostics: () => void
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive'; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Compiled cleanly', variant: 'success', icon: CheckCircle2 },
  review_needed: { label: 'Review recommended', variant: 'warning', icon: AlertTriangle },
  failed: { label: 'Compile issues', variant: 'destructive', icon: XCircle },
}

/**
 * Workflow-level "is this trustworthy" summary, mounted between the page header and the editor
 * split pane — the first thing an approver sees. Surfaces compile_report.status/min_confidence
 * (previously computed at compile time but never shown) so "Approve" is an informed decision
 * rather than a leap of faith. See research-analysis/Human-Edit-vs-Skill-Package.md §4 item 5.
 */
export function CompileHealthBanner({ compileHealth, onOpenDiagnostics }: Props) {
  const setSelectedStepIndex = useEditorStore((s) => s.setSelectedStepIndex)
  if (!compileHealth.status) return null

  const meta = STATUS_META[compileHealth.status] ?? STATUS_META.review_needed
  const Icon = meta.icon
  const belowThreshold = compileHealth.steps_below_threshold ?? []
  const minConfidencePct =
    typeof compileHealth.min_confidence === 'number' ? Math.round(compileHealth.min_confidence * 100) : null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/8 bg-white/[0.02] px-4 py-2 text-xs sm:px-6',
      )}
    >
      <Badge variant={meta.variant} className="gap-1">
        <Icon className="size-3" aria-hidden />
        {meta.label}
      </Badge>
      {minConfidencePct !== null ? (
        <span className="text-zinc-400">
          Min. confidence <span className="font-medium text-zinc-200">{minConfidencePct}%</span>
        </span>
      ) : null}
      {belowThreshold.length > 0 ? (
        <span className="flex items-center gap-1 text-zinc-400">
          <span className="text-status-warn font-medium">{belowThreshold.length}</span> step
          {belowThreshold.length === 1 ? '' : 's'} below threshold:
          <span className="flex flex-wrap gap-1">
            {belowThreshold.map((idx) => (
              <button
                key={idx}
                type="button"
                className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[0.65rem] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                onClick={() => setSelectedStepIndex(idx)}
              >
                #{idx + 1}
              </button>
            ))}
          </span>
        </span>
      ) : null}
      {compileHealth.required_runtime ? (
        <span className="text-zinc-500">
          Requires runtime <span className="font-mono text-zinc-400">{compileHealth.required_runtime}</span>
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-6 gap-0.5 px-1.5 text-[0.7rem] text-zinc-400 hover:text-zinc-200"
        onClick={onOpenDiagnostics}
      >
        Details
        <ChevronRight className="size-3" aria-hidden />
      </Button>
    </div>
  )
}
