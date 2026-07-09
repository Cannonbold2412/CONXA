import { useQuery } from '@tanstack/react-query'
import { fetchPlugins, normalizePluginList } from '@/api/pluginApi'
import { PluginWorkflowTests, workflowTestSummary } from '@/components/PluginWorkflowTests'
import { PageHeader } from '@/components/layout/PageHeader'
import { PluginSwitcher, useSelectedPluginId } from '@/components/PluginSwitcher'

export function TestPluginPage() {
  const pluginsQ = useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
    staleTime: 30_000,
  })
  const pluginId = useSelectedPluginId()

  const plugins = normalizePluginList(pluginsQ.data)
  const selectedPlugin = plugins.find((p) => p.id === pluginId) ?? null

  function onTestComplete() {
    void pluginsQ.refetch()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Test Skill"
        description="Run each workflow end-to-end against the built bundle. Passing here means it's ready to publish."
      />
      <PluginSwitcher />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {pluginsQ.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : pluginsQ.isError || !pluginsQ.data ? (
          <p className="text-sm text-red-400">{(pluginsQ.error as Error)?.message ?? 'Failed to load plugins'}</p>
        ) : !selectedPlugin ? (
          <p className="text-sm text-zinc-500">Select an automation above to test its workflows.</p>
        ) : !selectedPlugin.build ? (
          <p className="text-sm text-zinc-500">
            {selectedPlugin.name} hasn&apos;t been built yet — approve a compiled workflow in Human Edit to build its package, then come back here.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-white">{selectedPlugin.name}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {selectedPlugin.workflows.length} workflow{selectedPlugin.workflows.length !== 1 ? 's' : ''}
                {' · '}
                {(() => {
                  const { passed, total } = workflowTestSummary(selectedPlugin)
                  return `${passed}/${total} passed`
                })()}
              </p>
            </div>
            <PluginWorkflowTests plugin={selectedPlugin} onComplete={onTestComplete} />
          </>
        )}
      </div>
    </div>
  )
}
