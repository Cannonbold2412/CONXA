import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteWorkflow, fetchPlugin, type Plugin } from '@/api/pluginApi'
import { fetchEntitlements } from '@/api/usageApi'
import { useSelectionStore } from '@/store/selectionStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { StagePath, WorkflowStageBadge } from '@/components/StagePath'
import { InspectorDrawer } from '@/components/inspector/InspectorDrawer'
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
import {
  ChevronRight,
  ExternalLink,
  FolderKanban,
  KeyRound,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'

// ─────────────────────────────────────────────────
// Workflow row
// ─────────────────────────────────────────────────

function WorkflowRow({
  workflow,
  pluginId,
  onDelete,
}: {
  workflow: Plugin['workflows'][number]
  pluginId: string
  onDelete: () => void
}) {
  const navigate = useNavigate()

  const deleteMut = useMutation({
    mutationFn: () => deleteWorkflow(pluginId, workflow.id),
    onSuccess: onDelete,
  })

  const handleCompile = () => {
    navigate(`/plugins/${encodeURIComponent(pluginId)}/compile/${encodeURIComponent(workflow.session_id)}`)
  }

  const handleRecompile = () => {
    if (!workflow.skill_id) return
    navigate(`/plugins/${encodeURIComponent(pluginId)}/compile/${encodeURIComponent(workflow.session_id)}?mode=recompile`)
  }

  const isCompiled = workflow.status === 'compiled' && !!workflow.skill_id

  return (
    <div className="group border-t border-white/6 px-5 py-4 first:border-t-0 transition-colors hover:bg-white/[0.02]">
      {/* Top row */}
      <div className="flex items-center gap-4">
        <div className={cn('size-2 shrink-0 rounded-full', isCompiled ? 'bg-emerald-400' : 'bg-zinc-600')} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-snug text-white">{workflow.name}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Recorded{' '}
            {new Date(workflow.recorded_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <WorkflowStageBadge stage={workflow.stage} />
        <div className="flex shrink-0 items-center gap-1.5">
          {!workflow.skill_id ? (
            <Button size="sm" variant="outline" className="border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/10" onClick={handleCompile}>
              <Play className="size-3.5" /> Compile
            </Button>
          ) : (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-300">
                    <RefreshCw className="size-3.5" /> Recompile
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Recompile &ldquo;{workflow.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                      This rebuilds the skill package from the original raw recording and uses the Human Edit pool. Saved editor changes will be replaced.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-amber-600 text-white hover:bg-amber-700" onClick={handleRecompile}>Recompile</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white" onClick={() => navigate(`/edit/${encodeURIComponent(workflow.skill_id!)}?from=/plugins/${encodeURIComponent(pluginId)}`)}>
                Edit
              </Button>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="text-zinc-600 hover:text-red-400">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Delete &ldquo;{workflow.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">This removes the workflow recording from this plugin.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteMut.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="ml-6 mt-3">
        <StagePath stage={workflow.stage} />
      </div>
    </div>
  )
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

// ─────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────

export function PluginDetailPage() {
  const { pluginId } = useParams<{ pluginId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const setSelectedPluginId = useSelectionStore((s) => s.setSelectedPluginId)

  // A deep link (or manual URL nav) into a plugin should update the shared
  // selection too, so every stage page picks up the same automation.
  useEffect(() => {
    if (pluginId) setSelectedPluginId(pluginId)
  }, [pluginId, setSelectedPluginId])

  const q = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: () => fetchPlugin(pluginId!),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: !!pluginId,
  })
  const entitlementsQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['plugin', pluginId] })

  if (q.isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Plugin" />
        <p className="px-6 py-6 text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (q.isError || !q.data) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Plugin" />
        <p className="px-6 py-6 text-sm text-red-400">{(q.error as Error)?.message ?? 'Not found'}</p>
      </div>
    )
  }

  const plugin = q.data.plugin
  const workflowCount = plugin.workflows.length
  const compiledCount = plugin.workflows.filter((wf) => wf.status === 'compiled' && wf.skill_id).length
  const compileMeter = entitlementsQ.data?.meters?.compile_credits
  const editMeter = entitlementsQ.data?.meters?.human_edit_tokens

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={plugin.name}
        description={
          <a
            href={plugin.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate font-mono text-xs text-sky-400 transition-colors hover:text-sky-300"
          >
            {plugin.target_url}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        }
        actions={
          <InspectorDrawer
            plugin={plugin}
            trigger={
              <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white">
                <FolderKanban className="size-3.5" /> Inspector
              </Button>
            }
          />
        }
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── 4 stat cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', plugin.auth ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : 'border-amber-500/20 bg-amber-500/[0.08]')}>
              <KeyRound className={cn('size-4', plugin.auth ? 'text-emerald-400' : 'text-amber-400')} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Auth</p>
              <p className={cn('text-xs font-semibold', plugin.auth ? 'text-emerald-300' : 'text-amber-300')}>{plugin.auth ? 'Connected' : 'Required'}</p>
              <p className="text-[10px] text-zinc-600">{plugin.auth ? `Recorded ${new Date(plugin.auth.captured_at * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Not recorded'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/[0.08]">
              <ListChecks className="size-4 text-sky-400" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Workflows</p>
              <p className="text-xs font-semibold text-sky-300">{compiledCount} / {workflowCount} compiled</p>
              <p className="text-[10px] text-zinc-600">Active workflows</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/[0.08]">
              <Zap className="size-4 text-violet-400" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Compile</p>
              <p className="text-xs font-semibold text-zinc-200">
                {compileMeter ? (compileMeter.unlimited ? `${compileMeter.used} used` : `${compileMeter.used} / ${compileMeter.limit}`) : '—'}
              </p>
              <p className="text-[10px] text-zinc-600">Compiles used</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/[0.08]">
              <Pencil className="size-4 text-rose-400" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Human Edit</p>
              <p className="text-xs font-semibold text-zinc-200">
                {editMeter ? (editMeter.unlimited ? `${fmtTokens(editMeter.used)} used` : `${fmtTokens(editMeter.used)} / ${editMeter.limit ? fmtTokens(editMeter.limit) : '∞'}`) : '—'}
              </p>
              <p className="text-[10px] text-zinc-600">Edits used</p>
            </div>
          </div>
        </div>

        {/* ── Action cards ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Record Login */}
          <button
            type="button"
            onClick={() => navigate('/record')}
            className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-5 text-left transition-all hover:border-white/15 hover:bg-white/[0.05]"
          >
            <span className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border',
              plugin.auth ? 'border-emerald-500/20 bg-emerald-500/[0.1]' : 'border-amber-500/20 bg-amber-500/[0.1]',
            )}>
              {plugin.auth ? <ShieldCheck className="size-5 text-emerald-400" /> : <KeyRound className="size-5 text-amber-400" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Record Login</p>
                <span className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                  plugin.auth ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300',
                )}>
                  {plugin.auth ? 'Session active' : 'Required'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">Record your login/authentication steps to connect to your application.</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-zinc-600" />
          </button>

          {/* Create Workflow */}
          <button
            type="button"
            onClick={() => navigate('/record')}
            className="flex w-full items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-5 text-left transition-all hover:border-white/15 hover:bg-white/[0.05]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.1]">
              <Plus className="size-5 text-violet-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Create Workflow</p>
              <p className="mt-0.5 text-xs text-zinc-500">Record and compile a new workflow to automate your tasks.</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-zinc-600" />
          </button>
        </div>

        {/* ── Workflows section ── */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Workflows</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Record and compile the automations this plugin exposes.</p>
            </div>
            <div className="flex items-center gap-2">
              {workflowCount > 0 && (
                <span className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-400">{workflowCount}</span>
              )}
              <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-200" onClick={() => navigate('/record')}>
                <Plus className="size-4" /> Create a Workflow
              </Button>
            </div>
          </div>

          {plugin.workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/8 py-16 text-center">
              <div className="rounded-full border border-white/8 bg-white/[0.03] p-4">
                <ListChecks className="size-7 text-zinc-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">No workflows yet</p>
                <p className="mt-1 max-w-xs text-xs text-zinc-600">
                  {plugin.status !== 'ready' ? 'Record login first, then add workflows.' : 'Create your first workflow to start automating.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/8 bg-white/[0.02]">
              {plugin.workflows.map((wf) => (
                <WorkflowRow key={wf.id} workflow={wf} pluginId={plugin.id} onDelete={refresh} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
