import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchWorkflows, normalizeWorkflowList } from '@/api/workflowsApi'
import { useSelectionStore } from '@/store/selectionStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ExternalLink, Globe } from 'lucide-react'

/** The compact "current workflow" picker shown at the top of every stage page
 * (Compile/Human Edit/Test Skill), backed by the single shared selection store —
 * kills the old four-page re-selection shuffle without collapsing the pages
 * into one workspace. */
export function WorkflowSwitcher() {
  const navigate = useNavigate()
  const { selectedWorkflowId, setSelectedWorkflowId } = useSelectionStore()
  const { data, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows, staleTime: 10_000 })
  const workflows = normalizeWorkflowList(data)

  // Deep-selects a sane default: keep the persisted selection if it still
  // exists, otherwise fall back to the first available workflow.
  useEffect(() => {
    if (isLoading) return
    if (selectedWorkflowId && workflows.some((w) => w.id === selectedWorkflowId)) return
    setSelectedWorkflowId(workflows[0]?.id ?? null)
  }, [isLoading, workflows, selectedWorkflowId, setSelectedWorkflowId])

  if (isLoading) return null

  if (workflows.length === 0) {
    return (
      <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-3 sm:px-6">
        <Globe className="size-4 shrink-0 text-zinc-600" />
        <p className="flex-1 text-xs text-zinc-500">No workflows yet — create one to get started.</p>
        <Button size="sm" variant="outline" onClick={() => navigate('/workflows')}>
          Go to Workflows
        </Button>
      </div>
    )
  }

  const selected = workflows.find((w) => w.id === selectedWorkflowId) ?? workflows[0]

  return (
    <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-3 sm:px-6">
      <Select value={selected?.id} onValueChange={(id) => setSelectedWorkflowId(id)}>
        <SelectTrigger className="h-8 max-w-72 border-white/10 bg-white/[0.04] text-sm text-zinc-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workflows.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-zinc-400 hover:text-white"
          onClick={() => navigate(`/workflows/${encodeURIComponent(selected.id)}`)}
        >
          <ExternalLink className="size-3.5" /> Overview
        </Button>
      )}
    </div>
  )
}

/** Convenience hook for stage pages: the currently selected workflow's id, or
 * null if none is selected/available yet. */
export function useSelectedWorkflowId(): string | null {
  return useSelectionStore((s) => s.selectedWorkflowId)
}
