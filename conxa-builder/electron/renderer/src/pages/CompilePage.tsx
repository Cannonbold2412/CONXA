import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchPlugin } from '@/api/pluginApi'
import { PluginSwitcher, useSelectedPluginId } from '@/components/PluginSwitcher'
import { PageHeader } from '@/components/layout/PageHeader'
import { WorkflowStageBadge } from '@/components/StagePath'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ListChecks, Play, RefreshCw } from 'lucide-react'

export function CompilePage() {
  const navigate = useNavigate()
  const pluginId = useSelectedPluginId()

  const q = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: () => fetchPlugin(pluginId!),
    staleTime: 5_000,
    enabled: !!pluginId,
  })

  function goCompile(sessionId: string) {
    navigate(`/plugins/${encodeURIComponent(pluginId!)}/compile/${encodeURIComponent(sessionId)}`)
  }

  function goRecompile(sessionId: string) {
    navigate(`/plugins/${encodeURIComponent(pluginId!)}/compile/${encodeURIComponent(sessionId)}?mode=recompile`)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Compile" description="Turn a recording into a skill — you decide when to spend a compile credit." />
      <PluginSwitcher />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!pluginId || q.isLoading ? (
          <p className="px-6 py-6 text-sm text-zinc-500">{!pluginId ? 'Select an automation above to compile its workflows.' : 'Loading…'}</p>
        ) : q.isError || !q.data ? (
          <p className="px-6 py-6 text-sm text-red-400">{(q.error as Error)?.message ?? 'Not found'}</p>
        ) : q.data.plugin.workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ListChecks className="size-7 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">No workflows recorded yet</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/record')}>Go to Record</Button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            <div className="divide-y divide-white/6 rounded-xl border border-white/8 bg-white/[0.02]">
              {q.data.plugin.workflows.map((wf) => (
                <div key={wf.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{wf.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Recorded {new Date(wf.recorded_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <WorkflowStageBadge stage={wf.stage} />
                  {!wf.skill_id ? (
                    <Button size="sm" variant="outline" className="border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/10" onClick={() => goCompile(wf.session_id)}>
                      <Play className="size-3.5" /> Compile <span className="text-[10px] text-amber-400/70">(1 credit)</span>
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-300">
                          <RefreshCw className="size-3.5" /> Recompile
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">Recompile &ldquo;{wf.name}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription className="text-zinc-400">
                            This rebuilds the skill package from the original raw recording and uses the Human Edit pool, not a compile credit. Saved editor changes will be replaced.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-amber-600 text-white hover:bg-amber-700" onClick={() => goRecompile(wf.session_id)}>Recompile</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
