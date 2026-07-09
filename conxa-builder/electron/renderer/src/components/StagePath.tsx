import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/** Mirrors handlers/status.py::derive_workflow_stage — the single source of
 * truth for a workflow's lifecycle stage, replacing the old status/last_test_status/
 * signed-off-inference vocabularies scattered across the renderer. */
export type WorkflowStage =
  | 'recording'
  | 'ready_to_compile'
  | 'queued'
  | 'compiling'
  | 'needs_review'
  | 'needs_test'
  | 'ready'
  | 'error'

const STAGE_LABEL: Record<WorkflowStage, string> = {
  recording: 'Recording…',
  ready_to_compile: 'Ready to compile',
  queued: 'Queued',
  compiling: 'Compiling…',
  needs_review: 'Needs review',
  needs_test: 'Needs test',
  ready: 'Ready',
  error: 'Error',
}

const STAGE_COLOR: Record<WorkflowStage, string> = {
  recording: 'border-white/10 bg-white/[0.04] text-zinc-400',
  ready_to_compile: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
  queued: 'border-sky-500/30 bg-sky-500/[0.08] text-sky-300',
  compiling: 'border-sky-500/30 bg-sky-500/[0.08] text-sky-300',
  needs_review: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
  needs_test: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
  ready: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300',
  error: 'border-red-500/30 bg-red-500/[0.08] text-red-300',
}

export function WorkflowStageBadge({ stage }: { stage: WorkflowStage }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 gap-1 text-[10px] font-medium', STAGE_COLOR[stage])}>
      {stage === 'compiling' && <Loader2 className="size-2.5 animate-spin" />}
      {STAGE_LABEL[stage]}
    </Badge>
  )
}

const PATH_NODES = ['Recorded', 'Compiled', 'Reviewed', 'Tested'] as const

/** Which path nodes are "done" for a given stage. Compile-in-progress states
 * (queued/compiling) render as not-yet-compiled with a busy indicator on the
 * Compiled node; `error` freezes the path at whatever was last known good. */
function nodesDone(stage: WorkflowStage): boolean[] {
  const compiled = stage === 'needs_review' || stage === 'needs_test' || stage === 'ready'
  const reviewed = stage === 'needs_test' || stage === 'ready'
  const tested = stage === 'ready'
  return [true, compiled, reviewed, tested]
}

export function StagePath({ stage }: { stage: WorkflowStage }) {
  const done = nodesDone(stage)
  const busyIndex = stage === 'queued' || stage === 'compiling' ? 1 : null

  return (
    <div className="flex items-center">
      {PATH_NODES.map((label, i) => (
        <div key={label} className="flex items-center" style={{ flex: i < PATH_NODES.length - 1 ? '1' : undefined }}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex size-3.5 shrink-0 items-center justify-center rounded-full',
                done[i]
                  ? 'bg-emerald-500'
                  : i === busyIndex
                  ? 'bg-sky-500/80'
                  : 'border border-white/20 bg-transparent',
              )}
            >
              {done[i] && <Check className="size-2 text-white" />}
              {!done[i] && i === busyIndex && <Loader2 className="size-2 animate-spin text-white" />}
            </div>
            <span
              className={cn(
                'whitespace-nowrap text-[10px] font-medium',
                done[i] ? 'text-emerald-400' : i === busyIndex ? 'text-sky-400' : 'text-zinc-600',
              )}
            >
              {label}
            </span>
          </div>
          {i < PATH_NODES.length - 1 && (
            <div
              className={cn(
                'mb-3.5 mx-2 h-px flex-1',
                done[i] && done[i + 1] ? 'bg-emerald-500/50' : done[i] ? 'bg-emerald-500/30' : 'bg-white/8',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
