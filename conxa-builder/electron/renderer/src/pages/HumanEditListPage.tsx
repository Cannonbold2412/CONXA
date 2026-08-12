import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchWorkflows, normalizeWorkflowList, type Workflow } from '@/api/workflowsApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { WorkflowStageBadge, type WorkflowStage } from '@/components/StagePath'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Cpu, PencilLine } from 'lucide-react'

// Workflows waiting on a human decision surface first; already-approved ones sink down.
const STAGE_PRIORITY: Record<WorkflowStage, number> = {
  needs_review: 0,
  needs_test: 1,
  ready: 2,
  error: 3,
  compiling: 4,
  queued: 4,
  recording: 5,
  ready_to_compile: 5,
}

function confidenceLabel(wf: Workflow): string | null {
  if (wf.compile_min_confidence == null) return null
  const pct = Math.round(wf.compile_min_confidence * 100)
  if (wf.compile_status === 'ok') return `${pct}% confidence`
  if (wf.compile_status === 'review_needed') return `${pct}% confidence — review flagged steps`
  return `${pct}% confidence — low, review closely`
}

export function HumanEditListPage() {
  const navigate = useNavigate()

  const q = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    staleTime: 5_000,
  })

  const compiled = normalizeWorkflowList(q.data)
    .filter((wf) => wf.skill_id)
    .sort((a, b) => STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage])

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Human Edit" description="Confirm and repair what Conxa learned, then approve." />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <p className="px-6 py-6 text-sm text-zinc-500">Loading…</p>
        ) : q.isError || !q.data ? (
          <p className="px-6 py-6 text-sm text-red-400">{(q.error as Error)?.message ?? 'Not found'}</p>
        ) : compiled.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Cpu className="size-7 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">Nothing compiled yet</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/compile')}>Go to Compile</Button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            <div className="divide-y divide-white/6 rounded-xl border border-white/8 bg-white/[0.02]">
              {compiled.map((wf) => {
                const confidence = confidenceLabel(wf)
                return (
                  <div key={wf.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{wf.name}</p>
                      {confidence && (
                        <p className={cn(
                          'mt-0.5 text-xs',
                          wf.compile_status === 'ok' ? 'text-zinc-500' : wf.compile_status === 'review_needed' ? 'text-amber-400' : 'text-red-400',
                        )}>
                          {confidence}
                        </p>
                      )}
                    </div>
                    <WorkflowStageBadge stage={wf.stage} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white"
                      onClick={() => navigate(`/edit/${encodeURIComponent(wf.skill_id!)}?from=/human-edit`)}
                    >
                      <PencilLine className="size-3.5" /> Review
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
