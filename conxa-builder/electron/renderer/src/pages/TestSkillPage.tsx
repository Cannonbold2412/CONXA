import { useQuery } from '@tanstack/react-query'
import { fetchSkillPack, fetchWorkflows, normalizeWorkflowList } from '@/api/workflowsApi'
import { WorkflowTestList, workflowTestSummary } from '@/components/WorkflowTests'
import { PageHeader } from '@/components/layout/PageHeader'
import { FlaskConical, Loader2, XCircle } from 'lucide-react'

export function TestSkillPage() {
  const workflowsQ = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    staleTime: 30_000,
  })
  const packQ = useQuery({
    queryKey: ['skill-pack'],
    queryFn: fetchSkillPack,
    staleTime: 10_000,
  })

  const workflows = normalizeWorkflowList(workflowsQ.data)
  const pack = packQ.data?.skill_pack ?? null

  function onTestComplete() {
    void workflowsQ.refetch()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Test Skill"
        description="Run each workflow end-to-end against the built bundle. Passing here means it's ready to publish."
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {workflowsQ.isLoading || packQ.isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : workflowsQ.isError || !workflowsQ.data ? (
          <div className="mx-auto mt-6 flex max-w-2xl items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{(workflowsQ.error as Error)?.message ?? 'Failed to load workflows'}</p>
          </div>
        ) : !pack?.build ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="rounded-full border border-white/8 bg-white/[0.03] p-5">
              <FlaskConical className="size-9 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-400">Nothing built yet</p>
              <p className="mt-1 max-w-xs text-xs text-zinc-600">
                Sign off a compiled workflow in Human Edit to build the shared skill package, then
                come back here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-white">{pack.display_name}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
                {' · '}
                {(() => {
                  const { passed, total } = workflowTestSummary(workflows)
                  return `${passed}/${total} passed`
                })()}
              </p>
            </div>
            <WorkflowTestList workflows={workflows} skillPackBuild={pack.build} onComplete={onTestComplete} />
          </>
        )}
      </div>
    </div>
  )
}
