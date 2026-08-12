import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelRecording,
  deleteWorkflowEntity,
  fetchWorkflow,
  finalizeWorkflow,
  getWorkflowRecordingStatus,
  startWorkflowRecord,
  type Workflow,
} from '@/api/workflowsApi'
import { fetchGroup } from '@/api/groupsApi'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ExternalLink,
  FolderKanban,
  ListChecks,
  Loader2,
  MousePointer2,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react'

// ─────────────────────────────────────────────────
// Group auth strip — read-only summary linking to the owning group's setup
// (auth is captured once per group, not per workflow; see GroupPage.tsx).
// ─────────────────────────────────────────────────

function GroupAuthStrip({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const groupQ = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => fetchGroup(groupId),
    enabled: !!groupId,
  })

  if (groupQ.isLoading || !groupQ.data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Loader2 className="size-4 animate-spin text-zinc-500" />
        </span>
        <p className="text-xs text-zinc-500">Loading group…</p>
      </div>
    )
  }

  const { group, auth } = groupQ.data
  const ready = auth.ready

  return (
    <button
      type="button"
      onClick={() => navigate(`/groups/${encodeURIComponent(group.id)}`)}
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', ready ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : 'border-amber-500/20 bg-amber-500/[0.08]')}>
        {ready ? <ShieldCheck className="size-4 text-emerald-400" /> : <ShieldAlert className="size-4 text-amber-400" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Group</p>
        <p className={cn('text-xs font-semibold', ready ? 'text-emerald-300' : 'text-amber-300')}>{group.name}</p>
        <p className="text-[10px] text-zinc-600">
          {auth.apps_authenticated} of {auth.apps_total} app{auth.apps_total === 1 ? '' : 's'} connected
        </p>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────
// Record Workflow dialog
// ─────────────────────────────────────────────────

function RecordWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workflow: Workflow
  onRecorded: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [urlVariables, setUrlVariables] = useState<Record<string, string>>({})
  const [captureHover, setCaptureHover] = useState(false)
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [error, setError] = useState('')

  const workflowStartUrl = (workflow.protected_url || workflow.target_url).trim()
  const varPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g
  const requiredVars = Array.from(workflowStartUrl.matchAll(varPattern), (m) => m[1])

  const startMut = useMutation({
    mutationFn: () => startWorkflowRecord(workflow.id, requiredVars.length > 0 ? urlVariables : undefined, captureHover),
    onSuccess: (data) => {
      setActiveSession(data.session_id)
      setError('')
    },
    onError: (e: Error) => setError(e.message),
  })

  const finalizeMut = useMutation({
    mutationFn: () => finalizeWorkflow(workflow.id, activeSession!),
    onSuccess: () => {
      onOpenChange(false)
      setStep(1)
      setCaptureHover(false)
      setActiveSession(null)
      onRecorded()
    },
    onError: (e: Error) => {
      const message = e.message
      setError(message)
      if (message.toLowerCase().startsWith('no workflow actions were recorded')) {
        setActiveSession(null)
        onRecorded()
      }
    },
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelRecording(activeSession!, workflow.id),
    onSettled: () => {
      setActiveSession(null)
      setError('')
      onRecorded()
    },
  })

  const isRecording = !!activeSession
  const statusQ = useQuery({
    queryKey: ['workflow-recording-status', workflow.id, activeSession],
    queryFn: () => getWorkflowRecordingStatus(activeSession!),
    enabled: isRecording && !finalizeMut.isPending,
    refetchInterval: 1000,
    retry: false,
  })
  const workflowBrowserClosed = statusQ.data?.browser_open === false

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && activeSession && !finalizeMut.isPending) return
        if (!nextOpen) setStep(1)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Record Workflow</DialogTitle>
        </DialogHeader>

        {!isRecording && step === 1 ? (
          <div className="space-y-5 pt-1">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-300">How it works</p>
              {[
                'Click "Start Recording" on the next screen.',
                'Do the steps in the browser like normal. Clicks, typing, and page changes are recorded. If a menu only shows up on hover, turn on "hover-only elements" first.',
                'When done, close the browser, then click "Save Workflow Now".',
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[11px] font-bold text-zinc-400">{i + 1}</span>
                  <p className="text-xs leading-5 text-zinc-400">{text}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/8" />
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Best practices</p>
              {[
                'Keep the recording to one task.',
                'Passwords are removed automatically — you don\'t need to do anything.',
                'Go slow. Let each page finish loading before you click or type the next thing.',
                'Do it in one clean pass — don\'t go back and redo steps.',
              ].map((tip, i) => (
                <p key={i} className="text-xs leading-5 text-zinc-500"><span className="mr-1.5 text-zinc-600">·</span>{tip}</p>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>Next →</Button>
          </div>

        ) : !isRecording ? (
          <div className="space-y-4 pt-1">
            {requiredVars.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-400">URL variables <span className="text-zinc-600">(optional)</span></p>
                {requiredVars.map((varName) => (
                  <div key={varName} className="space-y-1">
                    <Label className="text-xs text-zinc-400">{varName}</Label>
                    <Input value={urlVariables[varName] || ''} onChange={(e) => setUrlVariables((prev) => ({ ...prev, [varName]: e.target.value }))} placeholder={`Enter ${varName} (optional)`} className="border-white/10 bg-white/5 text-zinc-100 h-8" />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <Checkbox id="workflowCaptureHover" checked={captureHover} disabled={startMut.isPending} onCheckedChange={(checked) => setCaptureHover(checked === true)} className="mt-0.5" />
              <Label htmlFor="workflowCaptureHover" className="grid min-w-0 cursor-pointer gap-1">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-200"><MousePointer2 className="size-3.5 text-zinc-400" />Workflow contains hover-only elements</span>
                <span className="text-xs leading-5 text-zinc-500">Turn this on when menus, tooltips, or drawers only appear after hovering.</span>
              </Label>
            </div>
            <p className="text-xs text-zinc-500">
              The browser will open pre-authenticated at{' '}
              <span className="font-mono text-zinc-300">
                {requiredVars.some((v) => urlVariables[v])
                  ? requiredVars.reduce((url, varName) => url.replace(new RegExp(`{{\\s*${varName}\\s*}}`), urlVariables[varName] || `{{${varName}}}`), workflowStartUrl)
                  : workflowStartUrl}
              </span>.
            </p>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/5 text-zinc-300" onClick={() => { setUrlVariables({}); setCaptureHover(false); setError('') }}>Clear</Button>
              <Button className="flex-1" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? <><Loader2 className="size-4 animate-spin" />Launching browser…</> : <><Play className="size-4" />Start Recording</>}
              </Button>
            </div>
          </div>

        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <Loader2 className="size-4 animate-spin text-blue-400" />
              <p className="text-xs text-blue-300">
                {finalizeMut.isPending
                  ? 'Saving workflow…'
                  : workflowBrowserClosed
                  ? 'Browser closed. Click Save Workflow Now to keep this recording, or Cancel to discard it.'
                  : 'Browser is open — perform your workflow, then close it when done.'}
              </p>
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {!finalizeMut.isPending && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-white/10 bg-white/5 text-zinc-300"
                  onClick={() => cancelMut.mutate()}
                  disabled={cancelMut.isPending}
                >
                  Cancel
                </Button>
                <Button size="sm" className="flex-1" onClick={() => finalizeMut.mutate()}>
                  Save Workflow Now
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteWorkflowButton({ workflow, onDeleted }: { workflow: Workflow; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => deleteWorkflowEntity(workflow.id),
    onSuccess: () => {
      setError('')
      setOpen(false)
      onDeleted()
    },
    onError: (e: Error) => setError(e.message || 'Failed to delete workflow.'),
  })
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return
        setOpen(nextOpen)
        if (nextOpen) setError('')
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-white/10 bg-white/[0.04] text-zinc-400 hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400"
          disabled={mutation.isPending}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete &ldquo;{workflow.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This deletes the workflow, its recording, and any built output. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              setError('')
              mutation.mutate()
            }}
          >
            {mutation.isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

export function WorkflowPage() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const setSelectedWorkflowId = useSelectionStore((s) => s.setSelectedWorkflowId)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)

  // A deep link (or manual URL nav) into a workflow should update the shared
  // selection too, so every stage page picks up the same automation.
  useEffect(() => {
    if (workflowId) setSelectedWorkflowId(workflowId)
  }, [workflowId, setSelectedWorkflowId])

  const q = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId!),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: !!workflowId,
  })
  const entitlementsQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['workflow', workflowId] })

  if (q.isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Workflow" />
        <p className="px-6 py-6 text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (q.isError || !q.data) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Workflow" />
        <p className="px-6 py-6 text-sm text-red-400">{(q.error as Error)?.message ?? 'Not found'}</p>
      </div>
    )
  }

  const workflow = q.data.workflow
  const canRecordWorkflow = workflow.status === 'ready'
  const hasRecording = !!workflow.session_id
  const compileMeter = entitlementsQ.data?.meters?.compile_credits
  const editMeter = entitlementsQ.data?.meters?.human_edit_tokens

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={workflow.name}
        description={
          <a
            href={workflow.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate font-mono text-xs text-sky-400 transition-colors hover:text-sky-300"
          >
            {workflow.target_url}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        }
        actions={
          <>
            <InspectorDrawer
              workflow={workflow}
              trigger={
                <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white">
                  <FolderKanban className="size-3.5" /> Inspector
                </Button>
              }
            />
            <DeleteWorkflowButton workflow={workflow} onDeleted={() => navigate('/workflows')} />
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-3">
          <GroupAuthStrip groupId={workflow.group_id} />

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

        {/* ── Action row ── */}
        {!hasRecording && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRecordWorkflow}
              title={canRecordWorkflow ? 'Record this workflow' : "Authenticate this workflow's group first"}
              onClick={() => setRecordDialogOpen(true)}
            >
              <Play className="size-3.5" />
              Record Workflow
            </Button>
          </div>
        )}

        {!canRecordWorkflow && !hasRecording && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            Authenticate every app in this workflow's group before recording — see the Group card above.
          </div>
        )}

        {/* ── Recording panel ── */}
        <section className="rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recording</span>
            <WorkflowStageBadge stage={workflow.stage} />
          </div>

          {!hasRecording ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ListChecks className="size-7 text-zinc-700" />
              <div>
                <p className="text-sm font-medium text-zinc-400">Not recorded yet</p>
                <p className="mt-1 max-w-xs text-xs text-zinc-600">
                  {canRecordWorkflow ? 'Click "Record Workflow" above to capture the task.' : 'Record login first, then record this workflow.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    Recorded{' '}
                    {workflow.recorded_at
                      ? new Date(workflow.recorded_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : '—'}
                    {workflow.step_count != null ? ` · ${workflow.step_count} step${workflow.step_count === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!workflow.skill_id ? (
                    <Button size="sm" variant="outline" className="border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/10" onClick={() => navigate(`/workflows/${encodeURIComponent(workflow.id)}/compile/${encodeURIComponent(workflow.session_id!)}`)}>
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
                              This rebuilds the skill from the original raw recording and uses the Human Edit pool. Saved editor changes will be replaced.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-amber-600 text-white hover:bg-amber-700"
                              onClick={() => navigate(`/workflows/${encodeURIComponent(workflow.id)}/compile/${encodeURIComponent(workflow.session_id!)}?mode=recompile`)}
                            >
                              Recompile
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white" onClick={() => navigate(`/edit/${encodeURIComponent(workflow.skill_id!)}?from=/workflows/${encodeURIComponent(workflow.id)}`)}>
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <StagePath stage={workflow.stage} />
              </div>
            </div>
          )}
        </section>
      </div>

      <RecordWorkflowDialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen} workflow={workflow} onRecorded={refresh} />
    </div>
  )
}
