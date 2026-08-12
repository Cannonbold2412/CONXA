import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createGroup, fetchGroups, type GroupSummary } from '@/api/groupsApi'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { cn } from '@/lib/utils'
import { FolderKanban, Plus } from 'lucide-react'

function NewGroupDialog() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => createGroup(name),
    onSuccess: (data) => {
      setOpen(false)
      setName('')
      setError('')
      navigate(`/groups/${encodeURIComponent(data.group.id)}`)
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New Group
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">New Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mutation.mutate()}
              placeholder="e.g. Sales"
              className="border-white/10 bg-white/5 text-zinc-100"
              disabled={mutation.isPending}
            />
            <p className="text-xs text-zinc-500">
              A business domain — e.g. Sales, Marketing. It groups both workflows and the applications they need to sign in to.
            </p>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Group'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GroupCard({ group }: { group: GroupSummary }) {
  const navigate = useNavigate()
  const authLabel =
    group.apps_total === 0
      ? 'No apps yet'
      : `${group.apps_authenticated} of ${group.apps_total} app${group.apps_total === 1 ? '' : 's'} connected`

  return (
    <button
      type="button"
      onClick={() => navigate(`/groups/${encodeURIComponent(group.id)}`)}
      className="group flex flex-col items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-left transition-colors hover:border-brand/30 hover:bg-white/[0.04]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 group-hover:border-brand/40 group-hover:text-brand">
        <FolderKanban className="size-5" />
      </span>
      <div className="min-w-0 w-full">
        <p className="truncate text-sm font-semibold text-white">{group.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {group.workflow_count} workflow{group.workflow_count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span
          aria-hidden
          className={cn('text-[13px] leading-none', group.ready ? 'text-status-ok' : 'text-status-warn')}
        >
          {group.ready ? '●' : '▲'}
        </span>
        <span className={cn(group.ready ? 'text-status-ok' : 'text-status-warn')}>{authLabel}</span>
      </div>
    </button>
  )
}

export function WorkflowListPage() {
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })
  const groups = groupsQ.data?.groups ?? []

  if (groupsQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Workflows" description="Organize your automations by business group — each one owns its own logins." />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (groupsQ.isError || !groupsQ.data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Workflows" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm font-medium text-red-300">Failed to load groups</p>
          <p className="text-xs text-zinc-500">{(groupsQ.error as Error)?.message ?? 'Unknown error'}</p>
          <Button size="sm" variant="outline" onClick={() => void groupsQ.refetch()}>
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
        description="Organize your automations by business group — each one owns its own logins."
        actions={<NewGroupDialog />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/8 py-20 text-center">
              <div className="rounded-full border border-white/8 bg-white/[0.03] p-4">
                <FolderKanban className="size-7 text-zinc-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">No groups yet</p>
                <p className="mt-1 max-w-xs text-xs text-zinc-600">Create a group to start organizing workflows and their logins.</p>
              </div>
              <NewGroupDialog />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
