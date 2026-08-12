import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelGroupAppAuth,
  finishGroupAppAuth,
  getGroupAuthStatus,
  startGroupAppAuth,
  type GroupAppStatus,
} from '@/api/groupsApi'
import { getWorkflowRecordingStatus } from '@/api/workflowsApi'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Check, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'

type AppState = 'idle' | 'launching' | 'waiting' | 'captured' | 'failed'

/** Walks every unauthenticated app in a group one at a time: opens a login
 * browser at the app's login URL, polls until the recorder self-detects the
 * app's success URL (or the user closes the browser), saves that app's
 * session, then moves to the next app. Shared by the group setup page and
 * the pre-run gate (RunGateDialog). */
export function GroupAuthWizard({
  groupId,
  onAllAuthenticated,
}: {
  groupId: string
  onAllAuthenticated: () => void
}) {
  const qc = useQueryClient()
  const statusQ = useQuery({
    queryKey: ['group-auth-status', groupId],
    queryFn: () => getGroupAuthStatus(groupId),
  })

  const [activeAppId, setActiveAppId] = useState<string | null>(null)
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

  return (
    <div className="space-y-3">
      {apps.map((app: GroupAppStatus) => {
        const isActive = activeAppId === app.id
        const isReady = app.state === 'ready' && !isActive
        return (
          <div
            key={app.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5',
              isReady ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/8 bg-white/[0.03]',
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                isReady ? 'bg-emerald-500/15 text-emerald-400' : isActive && appState === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-zinc-500',
              )}
            >
              {isReady ? (
                <Check className="size-3.5" />
              ) : isActive && (appState === 'launching' || appState === 'waiting') ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isActive && appState === 'failed' ? (
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
              {isActive && appState === 'failed' && (
                <p className="mt-0.5 text-[11px] text-red-300">{error || app.last_error || 'Login failed.'}</p>
              )}
            </div>
            {isReady ? null : isActive && appState === 'failed' ? (
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
                Connect
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
