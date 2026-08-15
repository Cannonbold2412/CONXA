import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelGroupAppAuth,
  finishGroupAppAuth,
  getGroupAuthStatus,
  removeGroupApp,
  updateGroupApp,
  startGroupAppAuth,
  type GroupAppStatus,
} from '@/api/groupsApi'
import { getWorkflowRecordingStatus } from '@/api/workflowsApi'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2, Pencil, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'

type AppState = 'idle' | 'launching' | 'waiting' | 'captured' | 'failed'

/** Edit-in-place dialog for a group app's name/login URL/success URL. */
function EditAppDialog({
  groupId,
  app,
  open,
  onOpenChange,
}: {
  groupId: string
  app: GroupAppStatus
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(app.name)
  const [loginUrl, setLoginUrl] = useState(app.login_url)
  const [successUrl, setSuccessUrl] = useState(app.success_url)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(app.name)
    setLoginUrl(app.login_url)
    setSuccessUrl(app.success_url)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, app.id])

  const mutation = useMutation({
    mutationFn: () => updateGroupApp(groupId, app.id, { name, login_url: loginUrl, success_url: successUrl }),
    onSuccess: () => {
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['group-auth-status', groupId] })
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-white">Edit application</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="border-white/10 bg-white/5 text-zinc-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Login URL</Label>
            <Input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} className="border-white/10 bg-white/5 text-zinc-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Success URL <span className="text-zinc-600">(optional)</span></Label>
            <Input value={successUrl} onChange={(e) => setSuccessUrl(e.target.value)} className="border-white/10 bg-white/5 text-zinc-100" />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!name || !loginUrl || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm-then-remove for a single group app. */
function RemoveAppButton({ groupId, app }: { groupId: string; app: GroupAppStatus }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: () => removeGroupApp(groupId, app.id),
    onSuccess: () => {
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['group-auth-status', groupId] })
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="icon-sm" variant="outline" title={`Remove ${app.name}`} className="border-white/10 bg-white/[0.04] text-zinc-500 hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#0d0f12] text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Remove &ldquo;{app.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            This removes the app and its captured session from this group. Workflows in this group will need it reconnected before recording.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-200" disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Walks every unauthenticated app in a group one at a time: opens a login
 * browser at the app's login URL, polls until the recorder self-detects the
 * app's success URL (or the user closes the browser), saves that app's
 * session, then moves to the next app. Shared by the group setup page and
 * the pre-run gate (RunGateDialog). `editable` (group page only, not
 * RunGateDialog) adds a pencil/trash pair per row for managing the app
 * itself, replacing the old separate "Remove {app}" chip strip. */
export function GroupAuthWizard({
  groupId,
  onAllAuthenticated,
  editable = false,
}: {
  groupId: string
  onAllAuthenticated: () => void
  editable?: boolean
}) {
  const qc = useQueryClient()
  const statusQ = useQuery({
    queryKey: ['group-auth-status', groupId],
    queryFn: () => getGroupAuthStatus(groupId),
  })

  const [activeAppId, setActiveAppId] = useState<string | null>(null)
  const [editingAppId, setEditingAppId] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allDoneRef = useRef(onAllAuthenticated)
  allDoneRef.current = onAllAuthenticated

  const startMut = useMutation({
    mutationFn: (appId: string) => startGroupAppAuth(groupId, appId),
    onMutate: (appId) => {
      setActiveAppId(appId)
      setAppState('launching')
      setError('')
    },
    onSuccess: (data) => {
      setSessionId(data.session_id)
      setAppState('waiting')
    },
    onError: (e: Error) => {
      setAppState('failed')
      setError(e.message)
    },
  })

  const finishMut = useMutation({
    mutationFn: () => finishGroupAppAuth(sessionId!, groupId, activeAppId!),
    onSuccess: (data) => {
      setAppState('captured')
      setSessionId(null)
      qc.setQueryData(['group-auth-status', groupId], data.auth)
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      if (data.auth.ready) {
        setActiveAppId(null)
        allDoneRef.current()
      } else {
        setActiveAppId(null)
        setAppState('idle')
      }
    },
    onError: (e: Error) => {
      setAppState('failed')
      setError(e.message)
    },
  })

  // Poll recording status while a login window is open, same 1s cadence as the
  // old RecordLoginDialog. Auto-finish the moment the recorder detects the
  // app's success URL — this is the "closes on its own" behaviour.
  const recStatusQ = useQuery({
    queryKey: ['group-app-recording-status', sessionId],
    queryFn: () => getWorkflowRecordingStatus(sessionId!),
    enabled: appState === 'waiting' && !!sessionId,
    refetchInterval: 1000,
    retry: false,
  })

  useEffect(() => {
    if (appState !== 'waiting' || !recStatusQ.data) return
    if (recStatusQ.data.reached_wait_url || recStatusQ.data.browser_open === false) {
      finishMut.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, recStatusQ.data?.reached_wait_url, recStatusQ.data?.browser_open])

  function retry(appId: string) {
    startMut.mutate(appId)
  }

  function skip() {
    if (sessionId) cancelGroupAppAuth(sessionId).catch(() => {})
    setActiveAppId(null)
    setAppState('idle')
    setSessionId(null)
  }

  if (statusQ.isLoading || !statusQ.data) {
    return <p className="px-1 py-4 text-xs text-zinc-500">Loading apps…</p>
  }

  const apps = statusQ.data.apps
  const editingApp = editingAppId ? apps.find((a) => a.id === editingAppId) ?? null : null

  return (
    <div className="space-y-3">
      {apps.map((app: GroupAppStatus) => {
        const isActive = activeAppId === app.id
        const isReady = app.state === 'ready' && !isActive
        const isExpired = app.state === 'expired' && !isActive
        const isFailed = isActive && appState === 'failed'
        return (
          <div
            key={app.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5',
              isReady
                ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                : isExpired
                  ? 'border-red-500/20 bg-red-500/[0.04]'
                  : 'border-white/8 bg-white/[0.03]',
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                isReady
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : isExpired || isFailed
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-white/8 text-zinc-500',
              )}
            >
              {isReady ? (
                <Check className="size-3.5" />
              ) : isActive && (appState === 'launching' || appState === 'waiting') ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isExpired || isFailed ? (
                <ShieldAlert className="size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{app.name}</p>
              <p className="truncate font-mono text-[11px] text-zinc-500">{app.login_url}</p>
              {isActive && appState === 'waiting' && (
                <p className="mt-0.5 text-[11px] text-sky-300">Sign in — this closes on its own once you're logged in.</p>
              )}
              {isFailed && (
                <p className="mt-0.5 text-[11px] text-red-300">{error || app.last_error || 'Login failed.'}</p>
              )}
              {isExpired && (
                <p className="mt-0.5 text-[11px] text-red-300">Session expired — sign in again.</p>
              )}
            </div>
            {isReady ? null : isFailed ? (
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" onClick={skip}>Skip</Button>
                <Button size="sm" onClick={() => retry(app.id)}>Retry</Button>
              </div>
            ) : isActive ? (
              <Button size="sm" variant="outline" disabled className="shrink-0">
                <Loader2 className="size-3.5 animate-spin" /> Waiting…
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => startMut.mutate(app.id)} disabled={!!activeAppId}>
                {isExpired ? 'Reconnect' : 'Connect'}
              </Button>
            )}
            {editable && !isActive && (
              <div className="flex shrink-0 gap-1.5">
                <Button size="icon-sm" variant="outline" title={`Edit ${app.name}`} className="border-white/10 bg-white/[0.04] text-zinc-500 hover:text-white" onClick={() => setEditingAppId(app.id)}>
                  <Pencil className="size-3.5" />
                </Button>
                <RemoveAppButton groupId={groupId} app={app} />
              </div>
            )}
          </div>
        )
      })}
      {editable && editingApp && (
        <EditAppDialog groupId={groupId} app={editingApp} open={!!editingApp} onOpenChange={(v) => !v && setEditingAppId(null)} />
      )}
    </div>
  )
}
