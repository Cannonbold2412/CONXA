import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelRecording,
  createPlugin,
  deletePlugin,
  fetchPlugins,
  finalizeAuth,
  finalizeWorkflow,
  getPluginRecordingStatus,
  normalizePluginList,
  reRecordAuth,
  startAuthRecord,
  startWorkflowRecord,
  type Plugin,
} from '@/api/pluginApi'
import { useSelectedPluginId } from '@/components/PluginSwitcher'
import { useSelectionStore } from '@/store/selectionStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { StagePath } from '@/components/StagePath'
import { cn } from '@/lib/utils'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Check,
  ChevronRight,
  Globe,
  KeyRound,
  Layers,
  ListChecks,
  Loader2,
  MousePointer2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

// ─────────────────────────────────────────────────
// Auth record dialog
// ─────────────────────────────────────────────────

function AuthRecordDialog({
  open,
  onOpenChange,
  plugin,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  plugin: Plugin
  onRefresh: () => void
}) {
  const [step, setStep] = useState<'guide' | 'record'>('guide')
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [error, setError] = useState('')

  const startMut = useMutation({
    mutationFn: () => startAuthRecord(plugin.id),
    onSuccess: (data) => {
      setActiveSession(data.session_id)
      setError('')
    },
    onError: (e: Error) => setError(e.message),
  })

  const finalizeMut = useMutation({
    mutationFn: async () => finalizeAuth(plugin.id, activeSession!),
    onSuccess: () => {
      setActiveSession(null)
      onRefresh()
      onOpenChange(false)
    },
    onError: (e: Error) => {
      setError(e.message)
      setActiveSession(null)
    },
  })

  const reRecordMut = useMutation({
    mutationFn: () => reRecordAuth(plugin.id),
    onSuccess: () => { onRefresh(); onOpenChange(false) },
    onError: (e: Error) => setError(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelRecording(activeSession!, { pluginId: plugin.id }),
    onSettled: () => setActiveSession(null),
  })

  const isRecording = !!activeSession
  const statusQ = useQuery({
    queryKey: ['plugin-auth-recording-status', plugin.id, activeSession],
    queryFn: () => getPluginRecordingStatus(activeSession!),
    enabled: isRecording && !finalizeMut.isPending,
    refetchInterval: 1000,
    retry: false,
  })
  const authBrowserClosed = statusQ.data?.browser_open === false

  function handleClose(v: boolean) {
    if (!v && isRecording && !finalizeMut.isPending) return
    if (!v) { setStep('guide'); setError(''); setActiveSession(null) }
    onOpenChange(v)
  }

  const RECORD_STEPS = ['Open browser', 'Log in', 'Save']
  const recordStep = finalizeMut.isPending ? 2 : 1

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {plugin.auth ? 'Login Session' : 'Record Login'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Already captured ── */}
        {plugin.auth ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <ShieldCheck className="size-5 text-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-200">Login session active</p>
                <p className="mt-0.5 truncate text-xs text-emerald-100/50">
                  Captured{' '}
                  {new Date(plugin.auth.captured_at * 1000).toLocaleString([], {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              Re-recording will replace the existing session. The browser will open at your target URL — complete the full login flow, then close it.
            </p>
            {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">{error}</p> : null}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/10 bg-white/[0.06] text-zinc-300" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                onClick={() => reRecordMut.mutate()}
                disabled={reRecordMut.isPending}
              >
                {reRecordMut.isPending
                  ? <><Loader2 className="size-4 animate-spin" />Re-recording…</>
                  : <><RefreshCw className="size-4" />Re-record Login</>}
              </Button>
            </div>
          </div>

        ) : isRecording ? (
          /* ── Recording in progress ── */
          <div className="space-y-5 pt-1">
            <div className="flex items-center">
              {RECORD_STEPS.map((s, i) => {
                const done = i < recordStep
                const current = i === recordStep
                return (
                  <div key={s} className="flex items-center" style={{ flex: i < RECORD_STEPS.length - 1 ? '1' : undefined }}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                        done ? 'bg-emerald-500 text-white' : current ? 'bg-sky-500 text-white ring-2 ring-sky-500/30' : 'bg-white/8 text-zinc-600',
                      )}>
                        {done ? <Check className="size-3" /> : current && !finalizeMut.isPending ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                      </div>
                      <span className={cn('whitespace-nowrap text-[11px] font-medium', done ? 'text-emerald-300' : current ? 'text-sky-300' : 'text-zinc-600')}>
                        {s}
                      </span>
                    </div>
                    {i < RECORD_STEPS.length - 1 && (
                      <div className={cn('mb-4 mx-3 h-px flex-1 transition-colors duration-500', done ? 'bg-emerald-500/40' : 'bg-white/8')} />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs leading-5 text-sky-100/70">
              {finalizeMut.isPending
                ? 'Saving your session…'
                : authBrowserClosed
                ? 'Browser closed. Click Save Session Now to keep this session, or Cancel to discard it.'
                : 'Browser is open. Log in, navigate to the page where workflows should start, then close the browser.'}
            </p>
            {!finalizeMut.isPending && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/[0.06] text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => cancelMut.mutate()} disabled={finalizeMut.isPending || cancelMut.isPending}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1 bg-sky-600 text-white hover:bg-sky-500" onClick={() => finalizeMut.mutate()} disabled={finalizeMut.isPending}>
                  {finalizeMut.isPending ? <><Loader2 className="size-4 animate-spin" />Saving session…</> : 'Save Session Now'}
                </Button>
              </div>
            )}
            {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">{error}</p> : null}
          </div>

        ) : step === 'guide' ? (
          /* ── Guide: how it works ── */
          <div className="space-y-5 pt-1">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-300">How it works</p>
              {[
                'A browser opens at your target URL.',
                'Complete the full login flow, including 2FA or SSO.',
                'Navigate to the page where workflows should begin.',
                'Close the browser — the session is saved automatically.',
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
                "Complete the full flow before closing — partial sessions won't work.",
                "Land on your app's actual starting page, not the login page.",
                'Re-record whenever credentials or cookies change.',
              ].map((tip) => (
                <p key={tip} className="text-xs leading-5 text-zinc-500"><span className="mr-1.5 text-zinc-600">·</span>{tip}</p>
              ))}
            </div>
            <Button className="w-full bg-amber-500 font-medium text-zinc-950 hover:bg-amber-400" onClick={() => setStep('record')}>
              Continue →
            </Button>
          </div>

        ) : (
          /* ── Record: target URL + launch ── */
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Globe className="size-3.5 text-zinc-500" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Target URL</p>
              </div>
              <p className="truncate font-mono text-sm text-zinc-200">{plugin.target_url}</p>
              <p className="mt-2 text-xs text-zinc-500">Log in, navigate to the starting page, then close the browser.</p>
            </div>
            {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">{error}</p> : null}
            <div className="flex flex-col gap-2">
              <Button
                className="h-10 w-full bg-amber-500 font-medium text-zinc-950 hover:bg-amber-400"
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending}
              >
                {startMut.isPending ? <><Loader2 className="size-4 animate-spin" />Launching browser…</> : <><Play className="size-4" />Record Login</>}
              </Button>
              <button type="button" onClick={() => setStep('guide')} className="text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300">
                ← Back to guide
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────
// New workflow dialog
// ─────────────────────────────────────────────────

function NewWorkflowDialog({
  plugin,
  onCreated,
  triggerElement,
}: {
  plugin: Plugin
  onCreated: () => void
  triggerElement?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [urlVariables, setUrlVariables] = useState<Record<string, string>>({})
  const [captureHover, setCaptureHover] = useState(false)
  const [activeSession, setActiveSession] = useState<{ sessionId: string; workflowId: string } | null>(null)
  const [error, setError] = useState('')
  const [promoteToAuth, setPromoteToAuth] = useState<{ sessionId: string; workflowId: string } | null>(null)

  const workflowStartUrl = (plugin.protected_url || plugin.target_url).trim()
  const varPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g
  const requiredVars = Array.from(workflowStartUrl.matchAll(varPattern), (m) => m[1])
  const canRecordWorkflow = plugin.status === 'ready' && !!plugin.auth

  const startMut = useMutation({
    mutationFn: () => startWorkflowRecord(plugin.id, name, requiredVars.length > 0 ? urlVariables : undefined, captureHover),
    onSuccess: (data) => {
      setActiveSession({ sessionId: data.session_id, workflowId: data.workflow_id })
      setError('')
    },
    onError: (e: Error) => setError(e.message),
  })

  const promoteAuthMut = useMutation({
    mutationFn: ({ sessionId }: { sessionId: string }) => finalizeAuth(plugin.id, sessionId),
    onSuccess: () => {
      setPromoteToAuth(null)
      setOpen(false)
      setName('')
      setCaptureHover(false)
      setActiveSession(null)
      onCreated()
    },
    onError: (e: Error) => setError(e.message),
  })

  const finalizeMut = useMutation({
    mutationFn: () => finalizeWorkflow(plugin.id, activeSession!.workflowId, activeSession!.sessionId),
    onSuccess: async (data) => {
      if (data.workflow_kind === 'login') {
        setPromoteToAuth({ sessionId: data.session_id, workflowId: data.workflow_id })
        return
      }
      setOpen(false)
      setName('')
      setCaptureHover(false)
      setActiveSession(null)
      onCreated()
    },
    onError: (e: Error) => {
      const message = e.message
      setError(message)
      if (message.toLowerCase().startsWith('no workflow actions were recorded')) {
        setActiveSession(null)
        onCreated()
      }
    },
  })

  const cancelMut = useMutation({
    mutationFn: () =>
      cancelRecording(activeSession!.sessionId, { pluginId: plugin.id, workflowId: activeSession!.workflowId }),
    onSettled: () => {
      setActiveSession(null)
      setError('')
      onCreated()
    },
  })

  const isRecording = !!activeSession
  const statusQ = useQuery({
    queryKey: ['plugin-workflow-recording-status', plugin.id, activeSession?.workflowId, activeSession?.sessionId],
    queryFn: () => getPluginRecordingStatus(activeSession!.sessionId),
    enabled: isRecording && !finalizeMut.isPending,
    refetchInterval: 1000,
    retry: false,
  })
  const workflowBrowserClosed = statusQ.data?.browser_open === false

  const defaultTrigger = (
    <Button
      size="sm"
      variant="outline"
      className="border-white/10 bg-white/[0.04] text-zinc-200"
      disabled={!canRecordWorkflow}
      title={canRecordWorkflow ? 'Create a Workflow' : 'Record auth first'}
    >
      <Plus className="size-4" />
      Create a Workflow
    </Button>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && activeSession && !finalizeMut.isPending) return
        if (!nextOpen) setStep(1)
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>
        {triggerElement ?? defaultTrigger}
      </DialogTrigger>

      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Record Workflow</DialogTitle>
        </DialogHeader>

        {!isRecording && step === 1 ? (
          <div className="space-y-5 pt-1">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-300">How it works</p>
              {[
                'Name your workflow on the next screen, then click "Start Recording".',
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
                'Keep each workflow to one task.',
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
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Workflow name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Create new service" className="border-white/10 bg-white/5 text-zinc-100" />
            </div>
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
              <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/5 text-zinc-300" onClick={() => { setName(''); setUrlVariables({}); setCaptureHover(false); setError('') }}>Clear</Button>
              <Button className="flex-1" onClick={() => startMut.mutate()} disabled={!name || startMut.isPending || !canRecordWorkflow}>
                {startMut.isPending ? <><Loader2 className="size-4 animate-spin" />Launching browser…</> : !canRecordWorkflow ? 'Record auth first' : <><Play className="size-4" />Start Recording</>}
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

        {promoteToAuth ? (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-300">This looks like a login recording</p>
            <p className="text-xs text-zinc-400">We detected a password field. Would you like to save this as the plugin&apos;s authentication session instead of a workflow?</p>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 border-white/10 bg-white/5 text-zinc-300" onClick={() => { setPromoteToAuth(null); setOpen(false); setName(''); setCaptureHover(false); setActiveSession(null); onCreated() }} disabled={promoteAuthMut.isPending}>Keep as workflow</Button>
              <Button size="sm" className="flex-1 bg-amber-600 text-white hover:bg-amber-700" onClick={() => promoteAuthMut.mutate({ sessionId: promoteToAuth.sessionId })} disabled={promoteAuthMut.isPending}>
                {promoteAuthMut.isPending ? <><Loader2 className="size-4 animate-spin" />Saving auth…</> : 'Save as auth'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────
// Plugin management (ported from the old Dashboard.tsx)
// ─────────────────────────────────────────────────

function CreatePluginDialog({
  onCreated,
  triggerElement,
}: {
  onCreated: (newPluginId: string) => void
  triggerElement?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => createPlugin({ name, target_url: targetUrl }),
    onSuccess: (data) => {
      setOpen(false)
      setName('')
      setTargetUrl('')
      setError('')
      onCreated(data.plugin.id)
    },
    onError: (e: Error) => setError(e.message),
  })

  const defaultTrigger = (
    <Button size="sm">
      <Plus className="size-4" />
      New Plugin
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerElement ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Create Plugin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Plugin name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mutation.mutate()}
              placeholder="e.g. Render.com"
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
            <p className="text-xs text-zinc-500">The login or landing page for the site your plugin automates.</p>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!name || !targetUrl || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create Plugin'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeletePluginButton({ plugin, onDeleted }: { plugin: Plugin; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => deletePlugin(plugin.id),
    onSuccess: () => {
      setError('')
      setOpen(false)
      onDeleted()
    },
    onError: (e: Error) => setError(e.message || 'Failed to delete plugin.'),
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
          <AlertDialogTitle className="text-white">Delete &ldquo;{plugin.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This deletes the plugin, all its workflows, and the built output. This cannot be undone.
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

const STATUS_FILTERS = ['all', 'ready', 'needs_auth', 'building', 'error'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

// ─────────────────────────────────────────────────
// helpers (ported from the old BuildPage.tsx shell)
// ─────────────────────────────────────────────────

function fmtDate(epoch: number) {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function pluginStatusDot(status: string) {
  if (status === 'ready') return 'bg-emerald-500'
  if (status === 'needs_auth') return 'bg-amber-500'
  return 'bg-red-500'
}

function pluginStatusBadge(status: string) {
  if (status === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'needs_auth') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-red-500/30 bg-red-500/10 text-red-300'
}

// ─────────────────────────────────────────────────
// Record page
// ─────────────────────────────────────────────────

export function RecordPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pluginsQ = useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
  })
  const selectedPluginId = useSelectedPluginId()
  const setSelectedPluginId = useSelectionStore((s) => s.setSelectedPluginId)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const plugins = normalizePluginList(pluginsQ.data)
  const filteredPlugins = plugins.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.target_url.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })
  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId)
  const canRecordWorkflow = selectedPlugin ? selectedPlugin.status === 'ready' && !!selectedPlugin.auth : false
  const refresh = () => void pluginsQ.refetch()
  const handleCreated = (newPluginId: string) => {
    refresh()
    setSelectedPluginId(newPluginId)
  }
  const handleDeleted = (deletedId: string) => {
    qc.setQueryData(['plugins'], (current: unknown) => {
      if (!current) return current
      const next = normalizePluginList(current).filter((plugin) => plugin.id !== deletedId)
      if (Array.isArray(current)) return next
      if (typeof current === 'object') return { ...current, plugins: next }
      return current
    })
    if (selectedPluginId === deletedId) {
      const remaining = plugins.filter((p) => p.id !== deletedId)
      setSelectedPluginId(remaining[0]?.id ?? null)
    }
    void pluginsQ.refetch()
  }

  if (pluginsQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Record" description="Show Conxa the task once — record a login or a new workflow." />
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex w-[272px] flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <Skeleton className="h-3.5 w-20" />
            <div className="mt-1 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[52px] w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
              ))}
            </div>
            <Skeleton className="mt-auto h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (pluginsQ.isError || !pluginsQ.data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Record" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm font-medium text-red-300">Failed to load plugins</p>
          <p className="text-xs text-zinc-500">{(pluginsQ.error as Error)?.message ?? 'Unknown error'}</p>
          <Button size="sm" variant="outline" onClick={() => void pluginsQ.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Record" description="Show Conxa the task once — record a login or a new workflow." />

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        {/* ── Left rail: plugin list ──────────────────────────────────────── */}
        <div className="flex min-h-0 w-[272px] shrink-0 flex-col rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Plugins
            </span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {plugins.length}
              </span>
              <CreatePluginDialog
                onCreated={handleCreated}
                triggerElement={
                  <Button size="icon-sm" variant="ghost" className="text-zinc-400 hover:bg-white/5 hover:text-white" title="New Plugin">
                    <Plus className="size-4" />
                  </Button>
                }
              />
            </div>
          </div>

          {plugins.length > 0 && (
            <div className="space-y-2 border-b border-white/8 px-3 py-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search plugins…"
                  className="h-7 border-white/10 bg-white/[0.04] pl-7 text-xs text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                      statusFilter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'needs_auth' ? 'Needs auth' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-px p-2">
              {plugins.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Layers className="size-6 text-zinc-700" />
                  <p className="text-xs text-zinc-500">No plugins yet.</p>
                  <CreatePluginDialog onCreated={handleCreated} />
                </div>
              ) : filteredPlugins.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <p className="text-xs text-zinc-500">No plugins match your filter.</p>
                </div>
              ) : (
                filteredPlugins.map((plugin) => {
                  const isSelected = selectedPluginId === plugin.id
                  return (
                    <button
                      key={plugin.id}
                      onClick={() => setSelectedPluginId(plugin.id)}
                      className={cn(
                        'group relative w-full cursor-pointer overflow-hidden rounded-lg px-3 py-2.5 text-left transition-all duration-150',
                        isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 w-0.5 rounded-full transition-all duration-150',
                          isSelected ? 'bg-brand' : 'bg-transparent',
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <span className={cn('mt-px size-1.5 shrink-0 rounded-full', pluginStatusDot(plugin.status))} />
                        <p className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', isSelected ? 'text-white' : 'text-zinc-300')}>
                          {plugin.name}
                        </p>
                        <span className="shrink-0 text-[10px] text-zinc-600">{plugin.workflows.length}w</span>
                      </div>
                      <div className="mt-1.5 ml-3.5 flex items-center gap-1.5">
                        {plugin.auth ? (
                          <span className="text-[10px] text-emerald-500">Auth captured {fmtDate(plugin.auth.captured_at)}</span>
                        ) : (
                          <span className="text-[10px] text-amber-500">Auth required</span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right panel: workspace ──────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/8 bg-white/[0.02]">
          {selectedPlugin ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-3.5">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-white">{selectedPlugin.name}</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {selectedPlugin.workflows.length} workflow{selectedPlugin.workflows.length !== 1 ? 's' : ''}
                    {' · '}
                    {selectedPlugin.auth ? `auth captured ${fmtDate(selectedPlugin.auth.captured_at)}` : 'auth required'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className={cn('text-[11px]', pluginStatusBadge(selectedPlugin.status))}>
                    {selectedPlugin.status}
                  </Badge>
                  <DeletePluginButton plugin={selectedPlugin} onDeleted={() => handleDeleted(selectedPlugin.id)} />
                </div>
              </div>

              {/* action row */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-5 py-3.5">
                <Button
                  size="sm"
                  onClick={() => setAuthDialogOpen(true)}
                  className={cn(!selectedPlugin.auth && 'bg-brand text-brand-foreground hover:bg-brand-hover')}
                >
                  {selectedPlugin.auth ? <ShieldCheck className="size-3.5" /> : <KeyRound className="size-3.5" />}
                  {selectedPlugin.auth ? 'Re-record Login' : 'Record Login'}
                </Button>

                <NewWorkflowDialog
                  plugin={selectedPlugin}
                  onCreated={refresh}
                  triggerElement={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canRecordWorkflow}
                      title={canRecordWorkflow ? 'Create a Workflow' : 'Record auth first'}
                    >
                      <Plus className="size-3.5" />
                      Create Workflow
                    </Button>
                  }
                />
              </div>

              {!canRecordWorkflow && (
                <div className="mx-5 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                  Record login first to unlock workflow recording.
                </div>
              )}

              {/* recorded workflows list */}
              <div className="mx-5 mb-5 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                <div className="border-b border-white/8 px-4 py-2.5">
                  <span className="text-[11px] font-medium text-zinc-400">Recorded workflows</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {selectedPlugin.workflows.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
                      <ListChecks className="size-6 text-zinc-700" />
                      <p className="text-xs text-zinc-500">No workflows yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/6">
                      {selectedPlugin.workflows.map((wf) => (
                        <div key={wf.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{wf.name}</p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              Recorded {new Date(wf.recorded_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="w-56 shrink-0">
                            <StagePath stage={wf.stage} />
                          </div>
                          <Button size="sm" variant="ghost" className="shrink-0 text-zinc-400 hover:text-white" onClick={() => navigate(`/plugins/${encodeURIComponent(selectedPlugin.id)}`)}>
                            Open <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <AuthRecordDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} plugin={selectedPlugin} onRefresh={refresh} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]">
                <Layers className="size-6 text-zinc-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">Select a plugin to record</p>
                <p className="mt-1 text-xs text-zinc-600">Choose a plugin from the left to record its login or a new workflow.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
