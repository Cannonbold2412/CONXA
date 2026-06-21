import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { buildPlugin, fetchPlugins, normalizePluginList, type PluginBuild } from '@/api/pluginApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { PluginWorkflowTests, workflowTestSummary } from '@/components/PluginWorkflowTests'
import {
  BuildPipelineStepper,
  type PipelineStep,
  type StepState,
} from '@/components/build/BuildPipelineStepper'
import { StatCard } from '@/components/build/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2,
  FolderKanban,
  Loader2,
  PackageCheck,
  XCircle,
  Layers,
  FlaskConical,
  CalendarDays,
  Cpu,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// Anchored severity matching — only explicit warning prefixes, never substring guessing.
function logLineLevel(line: string): 'warn' | 'default' {
  if (/^Warning:/i.test(line)) return 'warn'
  if (/^Skipping /i.test(line)) return 'warn'
  return 'default'
}

type TabId = 'log' | 'tests'

// ─── terminal log panel ───────────────────────────────────────────────────────

function TerminalPanel({
  logs,
  building,
  logRef,
}: {
  logs: string[]
  building: boolean
  logRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {logs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Terminal className="size-6 text-zinc-700" />
          <p className="text-[11px] text-zinc-600">
            {building ? 'Starting build…' : 'Logs will appear here when a build runs.'}
          </p>
        </div>
      ) : (
        <div
          ref={logRef}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <div className="space-y-px">
            {logs.map((line, i) => {
              const level = logLineLevel(line)
              return (
                <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
                  <span className="mt-px shrink-0 select-none text-zinc-700">›</span>
                  <span
                    className={cn(
                      'min-w-0 break-all',
                      level === 'warn' ? 'text-amber-400' : 'text-zinc-300',
                    )}
                  >
                    {line}
                  </span>
                </div>
              )
            })}
            {building && (
              <div className="flex gap-2 font-mono text-[11px] leading-relaxed">
                <span className="mt-px shrink-0 select-none text-zinc-700">›</span>
                <span className="text-zinc-600 animate-pulse">_</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export function BuildPage() {
  const pluginsQ = useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [buildDone, setBuildDone] = useState(false)
  const [buildResult, setBuildResult] = useState<PluginBuild | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('log')
  const logRef = useRef<HTMLDivElement>(null)

  const plugins = normalizePluginList(pluginsQ.data)
  const selectedPlugin = plugins.find((p) => p.id === selectedId)
  const hasBuiltPackage = Boolean(selectedPlugin?.build || buildResult)
  const testSummary = selectedPlugin
    ? workflowTestSummary(selectedPlugin)
    : { passed: 0, total: 0, allPassed: false }

  const uncompiled = selectedPlugin?.workflows.filter((w) => !w.skill_id) ?? []
  const unedited = selectedPlugin?.workflows.filter((w) => w.skill_id && !w.edited_at) ?? []
  const buildBlocked = uncompiled.length > 0 || unedited.length > 0
  const stale =
    selectedPlugin?.build &&
    selectedPlugin.workflows.some(
      (w) => w.edited_at && w.edited_at > (selectedPlugin.build?.last_built_at ?? 0),
    )

  function selectPlugin(pluginId: string) {
    setSelectedId(pluginId)
    setLogs([])
    setBuildError('')
    setBuildDone(false)
    setBuildResult(null)
    setActiveTab('log')
  }

  async function handleBuild() {
    if (!selectedId) return
    setLogs([])
    setBuildError('')
    setBuildDone(false)
    setBuildResult(null)
    setActiveTab('log')
    setBuilding(true)
    try {
      const result = await buildPlugin(selectedId, '0.1.0', (msg) => {
        setLogs((prev) => [...prev, msg])
        setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0)
      })
      setBuildResult(result)
      setBuildDone(true)
      void pluginsQ.refetch()
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  // ── pipeline stepper state ─────────────────────────────────────────────────

  function pipelineSteps(): PipelineStep[] {
    if (!selectedPlugin) {
      return [
        { label: 'Compile', state: 'pending' },
        { label: 'Edit', state: 'pending' },
        { label: 'Build', state: 'pending' },
        { label: 'Test', state: 'pending' },
        { label: 'Installer', state: 'pending' },
      ]
    }

    const compileState: StepState = uncompiled.length === 0 ? 'done' : 'blocked'

    const editState: StepState =
      uncompiled.length > 0
        ? 'pending'
        : unedited.length === 0
          ? 'done'
          : 'blocked'

    const buildState: StepState = buildBlocked
      ? 'pending'
      : building
        ? 'active'
        : hasBuiltPackage
          ? 'done'
          : 'active'

    const testState: StepState = !hasBuiltPackage
      ? 'pending'
      : testSummary.allPassed
        ? 'done'
        : testSummary.total > 0
          ? 'active'
          : 'pending'

    const installerState: StepState = testSummary.allPassed ? 'active' : 'pending'

    return [
      {
        label: 'Compile',
        state: compileState,
        subtitle: uncompiled.length > 0 ? `${uncompiled.length} pending` : undefined,
      },
      {
        label: 'Edit',
        state: editState,
        subtitle: unedited.length > 0 ? `${unedited.length} pending` : undefined,
      },
      {
        label: 'Build',
        state: buildState,
        subtitle: selectedPlugin.build ? `v${selectedPlugin.build.version}` : undefined,
      },
      {
        label: 'Test',
        state: testState,
        subtitle:
          testSummary.total > 0 ? `${testSummary.passed}/${testSummary.total} passed` : undefined,
      },
      { label: 'Installer', state: installerState },
    ]
  }

  // ── loading state ──────────────────────────────────────────────────────────

  if (pluginsQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Build Plugin" description="Package compiled workflows into a distributable plugin." />
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
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-auto h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (pluginsQ.isError || !pluginsQ.data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Build Plugin" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <XCircle className="size-8 text-red-400" />
          <p className="text-sm font-medium text-red-300">Failed to load plugins</p>
          <p className="text-xs text-zinc-500">{(pluginsQ.error as Error)?.message ?? 'Unknown error'}</p>
          <Button size="sm" variant="outline" onClick={() => void pluginsQ.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ── main render ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Build Plugin"
        description="Package compiled workflows into a distributable plugin."
        actions={
          selectedPlugin?.build ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/packages">
                <FolderKanban className="size-3.5" />
                Open Packages
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        {/* ── Left rail: plugin list ──────────────────────────────────────── */}
        <div className="flex min-h-0 w-[272px] shrink-0 flex-col rounded-xl border border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Plugins
            </span>
            <span className="rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              {plugins.length}
            </span>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-px p-2">
              {plugins.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Layers className="size-6 text-zinc-700" />
                  <p className="text-xs text-zinc-500">No plugins yet.</p>
                  <p className="text-[11px] text-zinc-600">Record a workflow to get started.</p>
                </div>
              ) : (
                plugins.map((plugin) => {
                  const isSelected = selectedId === plugin.id
                  return (
                    <button
                      key={plugin.id}
                      onClick={() => selectPlugin(plugin.id)}
                      className={cn(
                        'group relative w-full cursor-pointer overflow-hidden rounded-lg px-3 py-2.5 text-left transition-all duration-150',
                        isSelected
                          ? 'bg-white/[0.07]'
                          : 'hover:bg-white/[0.04]',
                      )}
                    >
                      {/* selected accent bar */}
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 w-0.5 rounded-full transition-all duration-150',
                          isSelected ? 'bg-brand' : 'bg-transparent',
                        )}
                      />

                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'mt-px size-1.5 shrink-0 rounded-full',
                            pluginStatusDot(plugin.status),
                          )}
                        />
                        <p
                          className={cn(
                            'min-w-0 flex-1 truncate text-[13px] font-medium',
                            isSelected ? 'text-white' : 'text-zinc-300',
                          )}
                        >
                          {plugin.name}
                        </p>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {plugin.workflows.length}w
                        </span>
                      </div>

                      <div className="mt-1.5 ml-3.5 flex items-center gap-1.5">
                        {plugin.build ? (
                          <>
                            <span className="text-[10px] text-zinc-600">
                              v{plugin.build.version}
                            </span>
                            <span className="text-[10px] text-zinc-700">·</span>
                            <span className="text-[10px] text-zinc-600">
                              {fmtDate(plugin.build.last_built_at)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-zinc-700">Never built</span>
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
              {/* workspace header */}
              <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">{selectedPlugin.name}</h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {selectedPlugin.workflows.length} workflow
                      {selectedPlugin.workflows.length !== 1 ? 's' : ''}
                      {selectedPlugin.build
                        ? ` · last built ${fmtDate(selectedPlugin.build.last_built_at)}`
                        : ''}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn('shrink-0 text-[11px]', pluginStatusBadge(selectedPlugin.status))}
                >
                  {selectedPlugin.status}
                </Badge>
              </div>

              {/* stat strip */}
              <div className="grid grid-cols-3 gap-3 border-b border-white/8 px-5 py-3.5">
                <StatCard
                  label="Workflows"
                  value={selectedPlugin.workflows.length}
                  subvalue={
                    uncompiled.length > 0 ? `${uncompiled.length} uncompiled` : 'all compiled'
                  }
                  accent={uncompiled.length > 0 ? 'amber' : 'emerald'}
                  icon={<Layers />}
                />
                <StatCard
                  label="Tests"
                  value={testSummary.total === 0 ? '—' : `${testSummary.passed}/${testSummary.total}`}
                  subvalue={
                    testSummary.allPassed
                      ? 'All clear'
                      : testSummary.total > 0
                        ? 'Pending'
                        : 'Run after build'
                  }
                  accent={
                    testSummary.allPassed ? 'emerald' : testSummary.total > 0 ? 'amber' : 'zinc'
                  }
                  icon={<FlaskConical />}
                />
                <StatCard
                  label="Last build"
                  value={selectedPlugin.build ? `v${selectedPlugin.build.version}` : '—'}
                  subvalue={
                    selectedPlugin.build
                      ? fmtDate(selectedPlugin.build.last_built_at)
                      : 'No build yet'
                  }
                  accent={selectedPlugin.build ? 'sky' : 'zinc'}
                  icon={<CalendarDays />}
                />
              </div>

              {/* pipeline stepper */}
              <div className="border-b border-white/8 px-5 py-3.5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  Release Pipeline
                </p>
                <BuildPipelineStepper steps={pipelineSteps()} />
              </div>

              {/* action row */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-5 py-3">
                <Button
                  size="sm"
                  onClick={() => void handleBuild()}
                  disabled={
                    building ||
                    selectedPlugin.status !== 'ready' ||
                    selectedPlugin.workflows.length === 0 ||
                    buildBlocked
                  }
                  className={cn(
                    'transition-all duration-150',
                    !building &&
                      !buildBlocked &&
                      selectedPlugin.status === 'ready' &&
                      selectedPlugin.workflows.length > 0
                      ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
                      : '',
                  )}
                >
                  {building ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Building…
                    </>
                  ) : (
                    <>
                      <Cpu className="size-3.5" />
                      Build Plugin
                    </>
                  )}
                </Button>

                {selectedPlugin.build && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/packages">
                      <FolderKanban className="size-3.5" />
                      Open Packages
                    </Link>
                  </Button>
                )}

                {testSummary.allPassed && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                  >
                    <Link to="/build-installer">
                      <PackageCheck className="size-3.5" />
                      Build Installer
                    </Link>
                  </Button>
                )}
              </div>

              {/* notices — only show when relevant */}
              {buildBlocked && (
                <div className="mx-5 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                  <p className="font-medium text-amber-200">Action required before building</p>
                  {uncompiled.length > 0 && (
                    <p className="mt-1 text-amber-300/80">
                      Compile first:{' '}
                      <span className="font-mono">{uncompiled.map((w) => w.name).join(', ')}</span>
                    </p>
                  )}
                  {unedited.length > 0 && (
                    <p className="mt-1 text-amber-300/80">
                      Open editor and sign off:{' '}
                      <span className="font-mono">{unedited.map((w) => w.name).join(', ')}</span>
                    </p>
                  )}
                </div>
              )}
              {stale && !buildBlocked && (
                <div className="mx-5 mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-sky-300">
                  <p className="font-medium text-sky-200">Workflows edited since last build</p>
                  <p className="mt-1 text-sky-300/80">Rebuild and re-test before creating the installer.</p>
                </div>
              )}
              {buildDone && (
                <div className="mx-5 mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-200">
                        Plugin package built successfully
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-100/60">
                        Run workflow tests below before building the installer.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {buildError && (
                <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Build failed</p>
                    <p className="mt-0.5 text-[11px] text-red-300/70">{buildError}</p>
                  </div>
                </div>
              )}

              {/* ── Terminal / Tests panel ─────────────────────────────────── */}
              <div className="mx-5 mb-5 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-[#080a0c]">
                {/* panel header with tabs */}
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab('log')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                        activeTab === 'log'
                          ? 'bg-white/[0.07] text-white'
                          : 'text-zinc-500 hover:text-zinc-300',
                      )}
                    >
                      Build Log
                    </button>
                    {hasBuiltPackage && (
                      <button
                        onClick={() => setActiveTab('tests')}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
                          activeTab === 'tests'
                            ? 'bg-white/[0.07] text-white'
                            : 'text-zinc-500 hover:text-zinc-300',
                        )}
                      >
                        Workflow Tests
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {logs.length > 0 && activeTab === 'log' && (
                      <span className="text-[10px] tabular-nums text-zinc-700">
                        {logs.length} lines
                      </span>
                    )}
                    {building && (
                      <div className="flex items-center gap-1.5">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        <span className="text-[10px] text-zinc-500">Live</span>
                      </div>
                    )}
                    {activeTab === 'tests' && testSummary.allPassed && (
                      <Button size="sm" variant="outline" asChild className="h-6 px-2 text-[10px]">
                        <Link to="/build-installer">
                          <PackageCheck className="size-3" />
                          Build Installer
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {/* panel content */}
                {activeTab === 'log' ? (
                  <TerminalPanel logs={logs} building={building} logRef={logRef} />
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <PluginWorkflowTests
                      plugin={selectedPlugin}
                      onComplete={() => void pluginsQ.refetch()}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* empty selection */
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]">
                <Layers className="size-6 text-zinc-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">Select a plugin to build</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Choose a plugin from the left to view its build pipeline.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
