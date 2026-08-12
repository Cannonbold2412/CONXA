import { useQuery } from '@tanstack/react-query'
import { fetchSkillPack, fetchWorkflows, normalizeWorkflowList } from '@/api/workflowsApi'
import { WorkflowTestList, workflowTestSummary } from '@/components/WorkflowTests'
import { PageHeader } from '@/components/layout/PageHeader'

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

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {workflowsQ.isLoading || packQ.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : workflowsQ.isError || !workflowsQ.data ? (
          <p className="text-sm text-red-400">{(workflowsQ.error as Error)?.message ?? 'Failed to load workflows'}</p>
        ) : !pack?.build ? (
          <p className="text-sm text-zinc-500">
            Nothing built yet — sign off a compiled workflow in Human Edit to build the shared skill package, then come back here.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-white">{pack.company_name}</h3>
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
