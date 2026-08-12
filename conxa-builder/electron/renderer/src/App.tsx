import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cmd, type UpdateCheckResult } from '@/lib/ipc'
import { AuthContext, performLogout, type Identity } from '@/contexts/AuthContext'
import { AppChrome } from '@/components/layout/AppChrome'
import { LoginOverlay } from '@/components/LoginOverlay'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BootstrapScreen } from '@/pages/BootstrapScreen'
import { UpdateRequiredScreen } from '@/pages/UpdateRequiredScreen'
import { fetchWorkflow } from '@/api/workflowsApi'

// Pages
import { WorkflowListPage } from '@/pages/WorkflowListPage'
import { GroupPage } from '@/pages/GroupPage'
import { HumanEditPage } from '@/pages/HumanEditPage'
import { HumanEditListPage } from '@/pages/HumanEditListPage'
import { PublishPage } from '@/pages/PublishPage'
import { BuildInstallerPage } from '@/pages/BuildInstallerPage'
import { TestSkillPage } from '@/pages/TestSkillPage'
import { SettingsPage } from '@/pages/SettingsPage'

// Studio-exclusive pages (keep existing)
import { CompileProgress } from '@/pages/CompileProgress'

function SplashScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#090b0d]">
      <div className="size-8 animate-pulse rounded-full bg-white/10" />
    </div>
  )
}

function DeepLinkHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    return window.conxa.onDeepLink((url) => {
      const workflowMatch = url.match(/[?&]workflow=([^&]+)/)
      const workflowId = workflowMatch ? decodeURIComponent(workflowMatch[1]) : null
      navigate(workflowId ? `/workflows/${workflowId}` : '/workflows')
    })
  }, [navigate])
  return null
}

/** `/` has no id to route on — the group list (`/workflows`) is the home. */
function DefaultRedirect() {
  return <Navigate to="/workflows" replace />
}

/** The per-workflow detail page was folded into its owning group's page (every
 * action it offered — record/compile/review/test — now lives on the group
 * page's workflow row). This keeps old `/workflows/:workflowId` links (deep
 * links, the compile page's "back", Human Edit's `?from=`) working by
 * resolving the workflow and forwarding to its group. */
function WorkflowRedirect() {
  const { workflowId } = useParams<{ workflowId: string }>()
  const q = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId!),
    enabled: !!workflowId,
  })

  if (q.isLoading) return null
  if (q.isError || !q.data) return <Navigate to="/workflows" replace />
  return <Navigate to={`/groups/${encodeURIComponent(q.data.workflow.group_id)}`} replace />
}

type DepUpdateBanner =
  | { phase: 'idle' }
  | { phase: 'updating'; pct: number | null }
  | { phase: 'done' }

export function App() {
  // 'checking' = deps status not yet known, 'needed' = bootstrap required, 'ready' = deps ok
  const [depsState, setDepsState] = useState<'checking' | 'needed' | 'ready'>('checking')
  // 'checking' = update check in-flight, 'required' = newer version exists, 'ok' = proceed
  const [updateState, setUpdateState] = useState<'checking' | 'required' | 'ok'>('checking')
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null)
  const [identity, setIdentity] = useState<Identity | null | 'checking'>('checking')
  const [depUpdateBanner, setDepUpdateBanner] = useState<DepUpdateBanner>({ phase: 'idle' })

  useEffect(() => {
    // Skip the bootstrap gate entirely in dev — deps (nsis/chromium/etc.) are managed by
    // scripts/setup.ps1, and Test Skill always runs against the local runtime/ source tree
    // (see conxa_runtime.py), so dev never needs the packaged-download flow.
    if (!window.conxa.isPackaged) {
      setDepsState('ready')
      return
    }
    cmd<{ all_ready: boolean }>('deps_status')
      .then((r) => setDepsState(r.all_ready ? 'ready' : 'needed'))
      .catch(() => setDepsState('needed'))
  }, [])

  // Check for updates after deps are ready. Fail-open: any error lets the user through.
  useEffect(() => {
    if (depsState !== 'ready') return
    window.conxa.update.check()
      .then((result) => {
        if (result.available && !result.error) {
          setUpdateCheckResult(result)
          setUpdateState('required')
        } else {
          setUpdateState('ok')
        }
      })
      .catch(() => setUpdateState('ok'))
  }, [depsState])

  // Identity check runs only after update check passes.
  useEffect(() => {
    if (updateState !== 'ok') return
    cmd<{ identity: Identity | null }>('whoami')
      .then((r) => {
        const id = r?.identity
        // Require a user_id — rejects empty objects that can slip through on
        // broken sessions where userinfo fetch failed and the token is opaque.
        setIdentity(id?.user_id ? id as Identity : null)
      })
      .catch(() => setIdentity(null))
  }, [updateState])

  // When all deps are present, silently check for newer versions in the background.
  useEffect(() => {
    if (depsState !== 'ready' || !window.conxa.isPackaged) return
    const unsub = window.conxa.onEvent((ev) => {
      if (ev.phase !== 'bootstrap') return
      if (!ev.dep) {
        if (ev.status === 'complete') setDepUpdateBanner({ phase: 'done' })
        return
      }
      if (ev.status === 'downloading') {
        const pct = typeof ev.pct === 'number' ? Math.round(ev.pct as number) : null
        setDepUpdateBanner({ phase: 'updating', pct })
      } else if (ev.status === 'error') {
        // A dep failed — dismiss rather than leaving the banner stuck.
        setDepUpdateBanner({ phase: 'idle' })
      }
    })
    cmd('bootstrap', {}).catch(() => {})
    return unsub
  }, [depsState])

  // Auto-dismiss the 'done' banner after 2 s.
  useEffect(() => {
    if (depUpdateBanner.phase !== 'done') return
    const t = setTimeout(() => setDepUpdateBanner({ phase: 'idle' }), 2000)
    return () => clearTimeout(t)
  }, [depUpdateBanner.phase])

  const handleBootstrapComplete = useCallback(() => setDepsState('ready'), [])

  if (depsState === 'checking') return <SplashScreen />
  if (depsState === 'needed') return <BootstrapScreen onComplete={handleBootstrapComplete} />
  if (updateState === 'checking') return <SplashScreen />
  if (updateState === 'required') return (
    <UpdateRequiredScreen
      currentVersion={updateCheckResult?.currentVersion ?? ''}
      latestVersion={updateCheckResult?.latestVersion ?? ''}
    />
  )
  if (identity === 'checking') return <SplashScreen />

  const resolvedIdentity = identity as Identity | null

  const logout = () => performLogout(setIdentity)

  // Hard gate: routes are never mounted until identity is confirmed.
  // AppChrome is always present so the frameless window's title bar controls work.
  if (!resolvedIdentity) {
    return (
      <AuthContext.Provider value={{ identity: null, setIdentity, logout }}>
        <AppChrome>
          <LoginOverlay onLogin={setIdentity} />
        </AppChrome>
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={{ identity: resolvedIdentity, setIdentity, logout }}>
      <ErrorBoundary>
        <AppChrome>
          <DeepLinkHandler />
          <Routes>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/workflows" element={<WorkflowListPage />} />
            <Route path="/workflows/:workflowId" element={<WorkflowRedirect />} />
            <Route path="/workflows/:workflowId/compile/:sessionId" element={<CompileProgress />} />
            <Route path="/groups/:groupId" element={<GroupPage />} />
            <Route path="/edit" element={<HumanEditPage />} />
            <Route path="/edit/:skillId" element={<HumanEditPage />} />
            <Route path="/human-edit" element={<HumanEditListPage />} />
            <Route path="/test" element={<TestSkillPage />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/build-installer" element={<BuildInstallerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/workflows" replace />} />
          </Routes>
        </AppChrome>
      </ErrorBoundary>
      {depUpdateBanner.phase !== 'idle' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-white/8 bg-[#0d0f12]/95 px-4 py-2 backdrop-blur">
          {depUpdateBanner.phase === 'updating' ? (
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          )}
          <span className="flex-1 text-xs text-zinc-400">
            {depUpdateBanner.phase === 'updating' ? 'Updating dependencies…' : 'Dependencies updated'}
          </span>
          {depUpdateBanner.phase === 'updating' && depUpdateBanner.pct != null && (
            <>
              <span className="text-xs tabular-nums text-zinc-500">{depUpdateBanner.pct}%</span>
              <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${depUpdateBanner.pct}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </AuthContext.Provider>
  )
}
