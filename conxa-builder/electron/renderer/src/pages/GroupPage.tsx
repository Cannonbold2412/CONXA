import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGroupApp,
  checkGroupAppAuth,
  deleteGroup,
  fetchGroup,
  renameGroup,
  type GroupApp,
} from '@/api/groupsApi'
import { createWorkflow, fetchSkillPack, type SkillPackBuild, type Workflow } from '@/api/workflowsApi'
import { GroupAuthWizard } from '@/components/GroupAuthWizard'
import { RecordWorkflowDialog } from '@/components/RecordWorkflowDialog'
import { DeleteWorkflowButton } from '@/components/DeleteWorkflowButton'
import { InspectorDrawer } from '@/components/inspector/InspectorDrawer'
import { UsageCards } from '@/components/EntitlementMeters'
import { WorkflowTestRow } from '@/components/WorkflowTests'
import { PageHeader } from '@/components/layout/PageHeader'
import { WorkflowStageBadge, WorkflowStageRail } from '@/components/StagePath'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCompileBusy } from '@/store/compileStore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FolderKanban, Layers, Loader2, Plus, Trash2 } from 'lucide-react'

function AddAppDialog({ groupId }: { groupId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [successUrl, setSuccessUrl] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => addGroupApp(groupId, name, loginUrl, successUrl),
    onSuccess: () => {
      setOpen(false)
      setName('')
      setLoginUrl('')
      setSuccessUrl('')
      setError('')
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['group-auth-status', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="outline" title="Add application">
          <Plus className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Add application</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salesforce" className="border-white/10 bg-white/5 text-zinc-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Login URL</Label>
            <Input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://app.example.com/login" className="border-white/10 bg-white/5 text-zinc-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Success URL <span className="text-zinc-600">(optional)</span></Label>
            <Input value={successUrl} onChange={(e) => setSuccessUrl(e.target.value)} placeholder="https://app.example.com/dashboard" className="border-white/10 bg-white/5 text-zinc-100" />
            <p className="text-xs text-zinc-500">Reaching this page means login succeeded — the browser closes automatically.</p>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!name || !loginUrl || mutation.isPending}>
            {mutation.isPending ? 'Adding…' : 'Add application'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewWorkflowDialog({ groupId }: { groupId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => createWorkflow({ name, target_url: targetUrl, group_id: groupId }),
    onSuccess: () => {
      setOpen(false)
      setName('')
      setTargetUrl('')
      setError('')
      qc.invalidateQueries({ queryKey: ['group', groupId] })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">New Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Workflow name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Create a lead" className="border-white/10 bg-white/5 text-zinc-100" disabled={mutation.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Target URL</Label>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://app.example.com" className="border-white/10 bg-white/5 text-zinc-100" disabled={mutation.isPending} />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!name || !targetUrl || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Workflow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function fmtDate(epoch: number) {
  return new Date(epoch * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Which of the group's configured apps this workflow targets, matched by
 * hostname against its target/protected URL — replaces showing the raw URL
 * on the workflow row. */
function appsUsedBy(wf: Workflow, apps: GroupApp[]): GroupApp[] {
  const hosts = new Set([hostnameOf(wf.target_url), hostnameOf(wf.protected_url)].filter(Boolean))
  if (hosts.size === 0) return []
  return apps.filter((a) => hosts.has(hostnameOf(a.login_url)))
}

/** One workflow's whole lifecycle in a single row: name/status on the left,
 * the five-node Record → Compile → Review → Test → Ready to Package rail in
 * the middle, Inspector + Delete on the right. Replaces the old row that only
 * navigated to a separate per-workflow detail page — every action that page
 * used to own now lives here. */
function WorkflowRow({
  wf,
  groupId,
  groupReady,
  apps,
  skillPackBuild,
  onChanged,
}: {
  wf: Workflow
  groupId: string
  groupReady: boolean
  apps: GroupApp[]
  skillPackBuild: SkillPackBuild | null
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const compileBusy = useCompileBusy()
  const [recordOpen, setRecordOpen] = useState(false)
  const [recompileConfirmOpen, setRecompileConfirmOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const hasRecording = !!wf.session_id
  const hasSkill = !!wf.skill_id
  const packBuilt = !!skillPackBuild
  const stale = wf.edited_at != null && skillPackBuild != null && wf.edited_at > skillPackBuild.last_built_at
  const usedApps = appsUsedBy(wf, apps)

  function handleCompileClick() {
    if (!hasRecording) return
    // Compiles run one at a time (see compileStore) — say so here rather than
    // letting the user land on the compile page just to be told no.
    if (compileBusy) {
      toast.info('Another workflow is compiling. Try again once it finishes.')
      return
    }
    if (hasSkill) {
      setRecompileConfirmOpen(true)
      return
    }
    navigate(`/workflows/${encodeURIComponent(wf.id)}/compile/${encodeURIComponent(wf.session_id!)}`)
  }

  return (
    <div className="border-b border-white/6 last:border-b-0">
      {/* Two lines, deliberately: identity on the first, the lifecycle rail on
          its own line below. Sharing one line is what made the rail read as five
          loose buttons rather than a pipeline. */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white">{wf.name}</p>
              <WorkflowStageBadge stage={wf.stage} />
            </div>
            {usedApps.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {usedApps.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-400"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <InspectorDrawer
              workflow={wf}
              trigger={
                <Button size="icon-sm" variant="outline" title="Inspector" className="border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white">
                  <FolderKanban className="size-3.5" />
                </Button>
              }
            />
            <DeleteWorkflowButton workflow={wf} onDeleted={onChanged} iconOnly />
          </div>
        </div>

        <div className="mt-3.5">
          <WorkflowStageRail
            stage={wf.stage ?? 'ready_to_compile'}
            hasRecording={hasRecording}
            hasSkill={hasSkill}
            groupReady={groupReady}
            packBuilt={packBuilt}
            stale={stale}
            onRecord={() => setRecordOpen(true)}
            onCompile={handleCompileClick}
            onReview={() => navigate(`/edit/${encodeURIComponent(wf.skill_id!)}?from=${encodeURIComponent(`/groups/${groupId}`)}`)}
            onToggleTest={() => setTestOpen((v) => !v)}
            onPackage={() => navigate('/publish')}
          />
        </div>
      </div>

      {testOpen && (
        <div className="border-t border-white/8 bg-black/10 px-5 py-3">
          <WorkflowTestRow wf={wf} skillPackBuild={skillPackBuild} onComplete={onChanged} />
        </div>
      )}

      <RecordWorkflowDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        workflow={wf}
        onRecorded={() => {
          setRecordOpen(false)
          onChanged()
        }}
      />

      <AlertDialog open={recompileConfirmOpen} onOpenChange={setRecompileConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Recompile &ldquo;{wf.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This rebuilds the skill from the original raw recording and uses the Human Edit pool. Saved editor changes will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => navigate(`/workflows/${encodeURIComponent(wf.id)}/compile/${encodeURIComponent(wf.session_id!)}?mode=recompile`)}
            >
              Recompile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const q = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => fetchGroup(groupId!),
    enabled: !!groupId,
  })
  const packQ = useQuery({
    queryKey: ['skill-pack'],
    queryFn: fetchSkillPack,
    staleTime: 10_000,
  })

  const renameMut = useMutation({
    mutationFn: () => renameGroup(groupId!, renameValue),
    onSuccess: () => {
      setRenaming(false)
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const deleteGroupMut = useMutation({
    mutationFn: () => deleteGroup(groupId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate('/workflows')
    },
  })

  // Bounded probe of every captured app's session at once — "ready" (a session file
  // exists) and "verified" (a probe recently confirmed it works) can disagree; this is
  // how the whole group catches up to verified in one action instead of app-by-app.
  const checkAllMut = useMutation({
    mutationFn: () => checkGroupAppAuth(groupId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['group-auth-status', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  if (q.isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Group" />
        <p className="px-6 py-6 text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (q.isError || !q.data) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Group" />
        <p className="px-6 py-6 text-sm text-red-400">{(q.error as Error)?.message ?? 'Not found'}</p>
      </div>
    )
  }

  const { group, auth, workflows } = q.data
  const isDefault = group.name === 'Default'
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    qc.invalidateQueries({ queryKey: ['groups'] })
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={group.name}
        description={[
          `${auth.apps_authenticated} of ${auth.apps_total} app${auth.apps_total === 1 ? '' : 's'} connected`,
          `${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`,
          auth.ready ? null : 'sign in to start recording',
        ]
          .filter(Boolean)
          .join(' · ')}
        leading={<UsageCards />}
        actions={
          <>
            {!isDefault && (
              <Dialog open={renaming} onOpenChange={(v) => { setRenaming(v); if (v) setRenameValue(group.name) }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">Rename</Button>
                </DialogTrigger>
                <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
                  <DialogHeader><DialogTitle className="text-white">Rename group</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="border-white/10 bg-white/5 text-zinc-100" />
                    <Button className="w-full" onClick={() => renameMut.mutate()} disabled={!renameValue || renameMut.isPending}>Save</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {!isDefault && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400">
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Delete &ldquo;{group.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                      Workflows in this group move to Default. Captured app sessions are removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteGroupMut.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <NewWorkflowDialog groupId={group.id} />
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* ── Applications column ── */}
        <section className="shrink-0 self-start rounded-xl border border-white/8 bg-white/[0.02] lg:w-72">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3.5">
            <span className="text-[0.6875rem] font-medium text-zinc-400">Applications</span>
            <AddAppDialog groupId={group.id} />
          </div>
          {group.apps.length > 0 && (
            // Answers "is this group blocked?" without counting rows.
            <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5 text-xs">
              <div className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className={cn('shrink-0 text-[13px] leading-none', auth.ready ? 'text-status-ok' : 'text-status-warn')}>
                  {auth.ready ? '●' : '▲'}
                </span>
                <span className={cn('truncate', auth.ready ? 'text-status-ok' : 'text-status-warn')}>
                  {auth.ready
                    ? 'All apps connected'
                    : `${auth.apps_total - auth.apps_authenticated} of ${auth.apps_total} still need signing in`}
                </span>
              </div>
              <button
                type="button"
                title="Re-probe every connected app's session right now"
                className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                disabled={checkAllMut.isPending}
                onClick={() => checkAllMut.mutate()}
              >
                {checkAllMut.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Check all'}
              </button>
            </div>
          )}
          <div className="p-3">
            {group.apps.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-600">No applications yet. Add one to start authenticating this group.</p>
            ) : (
              <GroupAuthWizard groupId={group.id} onAllAuthenticated={refresh} editable />
            )}
          </div>
        </section>

        {/* ── Workflows column ── */}
        <div className="min-w-0 flex-1">
          <ScrollArea className="min-h-0 flex-1">
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/8 py-16 text-center">
                <div className="rounded-full border border-white/8 bg-white/[0.03] p-4">
                  <Layers className="size-7 text-zinc-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-400">No workflows yet</p>
                  <p className="mt-1 max-w-xs text-xs text-zinc-600">Create a workflow in this group to start automating.</p>
                </div>
                <NewWorkflowDialog groupId={group.id} />
              </div>
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/[0.02]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
                  <span className="text-[0.6875rem] font-medium text-zinc-400">Workflows</span>
                  <span className="text-[0.6875rem] text-zinc-600">Updated {fmtDate(Math.max(...workflows.map((w) => w.updated_at)))}</span>
                </div>
                {workflows.map((wf) => (
                  <WorkflowRow
                    key={wf.id}
                    wf={wf}
                    groupId={group.id}
                    groupReady={auth.ready}
                    apps={group.apps}
                    skillPackBuild={packQ.data?.skill_pack?.build ?? null}
                    onChanged={refresh}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
