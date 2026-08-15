import { Check, Loader2, PackageCheck, Pencil, Play, PlayCircle, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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

type RailNodeSpec = {
  label: string
  icon: LucideIcon
  enabled: boolean
  disabledTitle?: string
  onClick: () => void
}

function RailNode({
  node,
  done,
  busy,
  current,
}: {
  node: RailNodeSpec
  done: boolean
  busy: boolean
  /** The one node worth acting on right now — the only place clay is spent
   * on this row (DESIGN.md §2, The One Accent Rule). */
  current: boolean
}) {
  const Icon = node.icon
  // `aria-disabled` rather than `disabled`: a disabled button takes no pointer
  // events and no focus, which would make the "why is this off?" tooltip
  // unreachable for both mouse and keyboard.
  const button = (
    <button
      type="button"
      onClick={node.enabled ? node.onClick : undefined}
      aria-disabled={!node.enabled}
      aria-current={current ? 'step' : undefined}
      className={cn(
        'group/node flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
        'focus-visible:ring-brand-ring focus-visible:outline-none focus-visible:ring-2',
        node.enabled ? 'hover:bg-white/[0.06] active:translate-y-px' : 'cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
          done
            ? 'border-status-ok-ring bg-status-ok-subtle text-status-ok'
            : busy
            ? 'border-sky-500/30 bg-sky-500/[0.12] text-sky-400'
            : current
            ? 'border-brand bg-brand-subtle text-brand'
            : node.enabled
            ? 'border-white/15 bg-white/[0.04] text-zinc-300'
            : 'border-white/8 bg-white/[0.02] text-zinc-600',
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-[0.6875rem] font-medium',
          done
            ? 'text-status-ok'
            : busy
            ? 'text-sky-400'
            : current
            ? 'text-brand'
            : node.enabled
            ? 'text-zinc-300'
            : 'text-zinc-600',
        )}
      >
        {node.label}
      </span>
    </button>
  )

  if (!node.enabled && node.disabledTitle) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{node.disabledTitle}</TooltipContent>
      </Tooltip>
    )
  }
  return button
}

/**
 * The interactive five-node lifecycle rail for a workflow row: Record → Compile
 * → Review → Test → Ready to Package. Replaces the read-only StagePath dots on
 * the group page — each node is the actual action button for that stage,
 * gated on the previous stage's completion (mirrors the old WorkflowPage's
 * scattered Compile/Recompile/Edit/Run-test buttons, now unified in one rail).
 */
export function WorkflowStageRail({
  stage,
  hasRecording,
  hasSkill,
  groupReady,
  packBuilt,
  stale,
  onRecord,
  onCompile,
  onReview,
  onToggleTest,
  onPackage,
}: {
  stage: WorkflowStage
  hasRecording: boolean
  hasSkill: boolean
  groupReady: boolean
  packBuilt: boolean
  stale: boolean
  onRecord: () => void
  onCompile: () => void
  onReview: () => void
  onToggleTest: () => void
  onPackage: () => void
}) {
  // nodesDone()'s first slot is hardcoded true — safe for the read-only
  // StagePath dots (only ever rendered once a recording exists) but wrong
  // here, where the rail renders for never-recorded workflows too. Use the
  // real recording flag for that node instead.
  const done = nodesDone(stage)
  const packageDone = stage === 'ready'
  const busyIndex = stage === 'queued' || stage === 'compiling' ? 1 : null

  const nodes: RailNodeSpec[] = [
    {
      label: 'Record',
      icon: Play,
      enabled: !hasRecording && groupReady,
      disabledTitle: hasRecording ? undefined : !groupReady ? "Authenticate every app in this workflow's group before recording" : undefined,
      onClick: onRecord,
    },
    {
      label: 'Compile',
      icon: Zap,
      enabled: hasRecording && busyIndex === null,
      disabledTitle: !hasRecording ? 'Record the workflow first' : busyIndex !== null ? 'Compiling…' : undefined,
      onClick: onCompile,
    },
    {
      label: 'Human Edit',
      icon: Pencil,
      enabled: hasSkill,
      disabledTitle: hasSkill ? undefined : 'Compile the workflow first',
      onClick: onReview,
    },
    {
      label: 'Test',
      icon: PlayCircle,
      enabled: hasSkill && packBuilt && !stale,
      disabledTitle: !hasSkill
        ? 'Compile the workflow first'
        : !packBuilt
        ? 'Build the skill package first'
        : stale
        ? 'Edited since last build — rebuild before testing'
        : undefined,
      onClick: onToggleTest,
    },
    {
      label: 'Ready to Package',
      icon: PackageCheck,
      enabled: stage === 'ready',
      disabledTitle: stage === 'ready' ? undefined : 'Pass a test run first',
      onClick: onPackage,
    },
  ]

  const doneFlags = [hasRecording, done[1], done[2], done[3], packageDone]

  // The leftmost node that's actionable and not yet finished — the single step
  // the operator should take next, and the only one that gets the clay accent.
  const currentIndex = nodes.findIndex((node, i) => node.enabled && !doneFlags[i] && i !== busyIndex)

  return (
    <div className="flex w-full items-center" role="group" aria-label="Workflow stages">
      {nodes.map((node, i) => (
        <div key={node.label} className={cn('flex items-center', i < nodes.length - 1 && 'min-w-0 flex-1')}>
          <RailNode node={node} done={doneFlags[i]} busy={i === busyIndex} current={i === currentIndex} />
          {i < nodes.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'mx-1.5 h-px min-w-3 flex-1 transition-colors',
                doneFlags[i] && doneFlags[i + 1]
                  ? 'bg-status-ok/50'
                  : doneFlags[i]
                  ? 'bg-status-ok/25'
                  : 'bg-white/8',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
