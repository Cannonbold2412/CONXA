import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGroupApp,
  deleteGroup,
  fetchGroup,
  removeGroupApp,
  renameGroup,
} from '@/api/groupsApi'
import { createWorkflow } from '@/api/workflowsApi'
import { GroupAuthWizard } from '@/components/GroupAuthWizard'
import { PageHeader } from '@/components/layout/PageHeader'
import { StagePath, WorkflowStageBadge } from '@/components/StagePath'
import { cn } from '@/lib/utils'
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
import { ChevronRight, Layers, Plus, Trash2 } from 'lucide-react'

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
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" /> Add app
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
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => createWorkflow({ name, target_url: targetUrl, group_id: groupId }),
    onSuccess: (data) => {
      setOpen(false)
      setName('')
      setTargetUrl('')
      setError('')
      navigate(`/workflows/${encodeURIComponent(data.workflow.id)}`)
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

  const renameMut = useMutation({
    mutationFn: () => renameGroup(groupId!, renameValue),
    onSuccess: () => {
      setRenaming(false)
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const removeAppMut = useMutation({
    mutationFn: (appId: string) => removeGroupApp(groupId!, appId),
    onSuccess: () => {
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

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={group.name}
        description={`${auth.apps_total} app${auth.apps_total === 1 ? '' : 's'} · ${auth.apps_authenticated} connected`}
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

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Applications</span>
            <AddAppDialog groupId={group.id} />
          </div>
          <div className="p-4">
            {group.apps.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-600">No applications yet. Add one to start authenticating this group.</p>
            ) : (
              <>
                <GroupAuthWizard groupId={group.id} onAllAuthenticated={() => qc.invalidateQueries({ queryKey: ['group', groupId] })} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {group.apps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => removeAppMut.mutate(app.id)}
                      title="Remove app"
                      className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-500 hover:border-red-500/30 hover:text-red-400"
                    >
                      Remove {app.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

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
            <div className="divide-y divide-white/6 rounded-xl border border-white/8 bg-white/[0.02]">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => navigate(`/workflows/${encodeURIComponent(wf.id)}`)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{wf.name}</p>
                      <WorkflowStageBadge stage={wf.stage} />
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">{wf.target_url}</p>
                  </div>
                  <div className={cn('hidden w-48 shrink-0 sm:block')}>
                    <StagePath stage={wf.stage ?? 'ready_to_compile'} />
                  </div>
                  <div className="w-28 shrink-0 text-right text-[11px] text-zinc-600">{fmtDate(wf.updated_at)}</div>
                  <ChevronRight className="size-4 shrink-0 text-zinc-600" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
