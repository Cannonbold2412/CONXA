import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelRecording,
  finalizeWorkflow,
  getWorkflowRecordingStatus,
  resolveFilePicker,
  startWorkflowRecord,
  type Workflow,
} from '@/api/workflowsApi'
import { getGroupAuthStatus } from '@/api/groupsApi'
import { GroupAuthWizard } from '@/components/GroupAuthWizard'
import { CmdError } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MousePointer2, Play } from 'lucide-react'

/** Walks the user through recording a workflow: instructions → optional URL
 * variables/hover toggle → live browser session → save. Moved verbatim out of
 * the removed per-workflow detail page so the group page's Record rail node
 * can open the same flow inline. */
export function RecordWorkflowDialog({
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
  const [siblingWarnings, setSiblingWarnings] = useState<string[]>([])

  const workflowStartUrl = (workflow.protected_url || workflow.target_url).trim()
  const varPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g
  const requiredVars = Array.from(workflowStartUrl.matchAll(varPattern), (m) => m[1])

  // Recording is pre-flight-gated on the workflow's required app(s) being authenticated
  // (see handlers/session.py's cmd_start_recording) — an auth_required failure means the
  // browser never launched. Rather than just showing the error text, surface the wizard
  // right here so the user can fix it and retry without leaving this dialog.
  const [authBlocked, setAuthBlocked] = useState(false)

  const startMut = useMutation({
    mutationFn: () => startWorkflowRecord(workflow.id, requiredVars.length > 0 ? urlVariables : undefined, captureHover),
    onSuccess: (data) => {
      setActiveSession(data.session_id)
      setError('')
      setAuthBlocked(false)
      // Non-blocking: a sibling app the recorder seeded (but this workflow doesn't
      // require) looks signed out — recording started anyway, just flag it.
      setSiblingWarnings(data.warnings ?? [])
    },
    onError: (e: Error) => {
      setError(e.message)
      setAuthBlocked(e instanceof CmdError && e.code === 'auth_required')
    },
  })

  // Only the apps that came back not-ready are relevant here — a healthy sibling app
  // shouldn't clutter a "you're blocked" screen. Shares its query cache with
  // GroupAuthWizard's own internal fetch (same queryKey), so this never double-fetches.
  const authStatusQ = useQuery({
    queryKey: ['group-auth-status', workflow.group_id],
    queryFn: () => getGroupAuthStatus(workflow.group_id),
    enabled: authBlocked && !!workflow.group_id,
  })
  const notReadyAppIds = authStatusQ.data?.apps.filter((a) => a.state !== 'ready').map((a) => a.id)

  const finalizeMut = useMutation({
    mutationFn: () => finalizeWorkflow(workflow.id, activeSession!),
    onSuccess: () => {
      onOpenChange(false)
      setStep(1)
      setCaptureHover(false)
      setActiveSession(null)
      setSiblingWarnings([])
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
      setSiblingWarnings([])
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

  // While recording, a "Choose File" click asks us (instead of Chrome's native picker,
  // which is deliberately suppressed — see recorder/session.py's filechooser listener) to
  // show Electron's own file-pick dialog pre-pointed at the session's download folder.
  useEffect(() => {
    if (!activeSession) return
    return window.conxa.onEvent(async (event) => {
      if (event.action !== 'file_picker_request' || event.session_id !== activeSession) return
      const requestId = event.request_id as string
      const picked = await window.conxa.pickFile({
        defaultPath: event.default_dir as string,
        multiple: Boolean(event.multiple),
      })
      await resolveFilePicker(activeSession, requestId, picked)
    })
  }, [activeSession])

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
            {authBlocked && workflow.group_id ? (
              authStatusQ.data ? (
                <div className="space-y-3 rounded-lg border border-red-500/15 bg-red-500/[0.03] p-3">
                  <GroupAuthWizard
                    groupId={workflow.group_id}
                    appIds={notReadyAppIds}
                    onAllAuthenticated={() => {
                      setAuthBlocked(false)
                      setError('')
                      // Everything this workflow needs just got fixed — retry immediately
                      // instead of making the user click Start Recording a second time.
                      startMut.mutate()
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Checking authentication…</p>
              )
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/5 text-zinc-300" onClick={() => { setUrlVariables({}); setCaptureHover(false); setError('') }}>Clear</Button>
                <Button className="flex-1" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                  {startMut.isPending ? <><Loader2 className="size-4 animate-spin" />Launching browser…</> : <><Play className="size-4" />Start Recording</>}
                </Button>
              </div>
            )}
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
            {siblingWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-300">{w}</p>
            ))}
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
