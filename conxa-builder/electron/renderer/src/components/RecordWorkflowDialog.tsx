import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelRecording,
  finalizeWorkflow,
  getWorkflowRecordingStatus,
  startWorkflowRecord,
  type Workflow,
} from '@/api/workflowsApi'
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
