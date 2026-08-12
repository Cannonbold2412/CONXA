import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createWorkflow, fetchWorkflows, normalizeWorkflowList } from '@/api/workflowsApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { StagePath, WorkflowStageBadge } from '@/components/StagePath'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight, Layers, Plus, Search } from 'lucide-react'

function NewWorkflowDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => createWorkflow({ name, target_url: targetUrl }),
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
          <Plus className="size-4" />
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">New Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Workflow name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mutation.mutate()}
              placeholder="e.g. Create new service on Render.com"
              className="border-white/10 bg-white/5 text-zinc-100"
              disabled={mutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Target URL</Label>
            <Input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mutation.mutate()}
              placeholder="https://render.com"
              className="border-white/10 bg-white/5 text-zinc-100"
              disabled={mutation.isPending}
            />
            <p className="text-xs text-zinc-500">The login or landing page for the site this workflow automates.</p>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!name || !targetUrl || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create Workflow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const STATUS_FILTERS = ['all', 'needs_auth', 'ready', 'error'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

function fmtDate(epoch: number) {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function WorkflowListPage() {
  const navigate = useNavigate()
  const workflowsQ = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const workflows = normalizeWorkflowList(workflowsQ.data)
  const filtered = workflows.filter((w) => {
    const matchesSearch = !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.target_url.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (workflowsQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Workflows" description="Show Conxa the task once — record a login, then record the workflow." />
        <div className="min-h-0 flex-1 space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (workflowsQ.isError || !workflowsQ.data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Workflows" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm font-medium text-red-300">Failed to load workflows</p>
          <p className="text-xs text-zinc-500">{(workflowsQ.error as Error)?.message ?? 'Unknown error'}</p>
          <Button size="sm" variant="outline" onClick={() => void workflowsQ.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Workflows"
        description="Show Conxa the task once — record a login, then record the workflow."
        actions={<NewWorkflowDialog />}
      />

      {workflows.length > 0 && (
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5 sm:px-6">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="h-8 border-white/10 bg-white/[0.04] pl-7 text-xs text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  statusFilter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                )}
              >
                {f === 'all' ? 'All' : f === 'needs_auth' ? 'Needs login' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/8 py-20 text-center">
              <div className="rounded-full border border-white/8 bg-white/[0.03] p-4">
                <Layers className="size-7 text-zinc-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">No workflows yet</p>
                <p className="mt-1 max-w-xs text-xs text-zinc-600">Create your first workflow to start automating.</p>
              </div>
              <NewWorkflowDialog />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="text-xs text-zinc-500">No workflows match your filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/6 rounded-xl border border-white/8 bg-white/[0.02]">
              {filtered.map((wf) => (
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
                  <div className="hidden w-48 shrink-0 sm:block">
                    <StagePath stage={wf.stage} />
                  </div>
                  <div className="w-28 shrink-0 text-right text-[11px] text-zinc-600">{fmtDate(wf.updated_at)}</div>
                  <ChevronRight className="size-4 shrink-0 text-zinc-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
