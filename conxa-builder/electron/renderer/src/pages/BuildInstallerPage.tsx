import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buildInstaller,
  fetchSkillPack,
  fetchSkillPackVersions,
  type InstallerBuildResult,
} from '@/api/workflowsApi'
import { errorMessage } from '@/api/workflowApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuildLogPanel, ResultCard } from '@/components/BuildLogUi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  ChevronDown,
  Download,
  HardDrive,
  ImagePlus,
  Loader2,
  PackageCheck,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ERROR_MESSAGES: Record<string, string> = {
  installer_upload_too_large: 'Installer too large for cloud hosting (max 250 MB). Reduce included assets and retry.',
  installer_not_found: 'Installer file not found. Re-run the build step.',
  cloud_auth_error: 'Cloud authentication failed. Sign in again and retry.',
}

function humanizeError(msg: string): string {
  for (const [code, human] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(code)) return human
  }
  return msg
}

export function BuildInstallerPage() {
  const qc = useQueryClient()
  const packQ = useQuery({
    queryKey: ['skill-pack'],
    queryFn: fetchSkillPack,
    staleTime: 10_000,
  })

  const [logs, setLogs] = useState<string[]>([])
  const [building, setBuilding] = useState(false)
  const [installerError, setInstallerError] = useState('')
  const [installerDone, setInstallerDone] = useState(false)
  const [installerResult, setInstallerResult] = useState<InstallerBuildResult | null>(null)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const pack = packQ.data?.skill_pack ?? null

  // Build Installer no longer collects its own version/release notes — it packages
  // whatever was most recently published via Publish Skill Package. This is also
  // the gate: no release, no installer (routine skill-pack updates never need a
  // rebuild at all; this is deliberately a secondary/advanced action now).
  const versionsQ = useQuery({
    queryKey: ['skill-pack-versions'],
    queryFn: fetchSkillPackVersions,
    enabled: Boolean(pack?.build),
    staleTime: 10_000,
  })
  const latestVersion = versionsQ.data?.versions?.[0]

  const installerInfo = installerResult ?? pack?.installer ?? null
  const installerReady = Boolean(installerInfo)
  const installerOutputPath = installerInfo?.installer_path
  const installerBuiltAt = pack?.installer?.built_at
  const selectedStatus = building ? 'Building' : installerReady ? 'Complete' : 'Not built'
  const canBuild = Boolean(pack?.build) && Boolean(latestVersion) && Boolean(logoPath) && !building

  async function handlePickLogo() {
    const picked = await window.conxa.pickFile({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico'] }],
    })
    if (picked?.[0]) setLogoPath(picked[0])
  }

  function handleClearLogo() {
    setLogoPath(null)
  }

  async function handleBuildInstaller() {
    if (!latestVersion || !canBuild) return
    setLogs([])
    setInstallerError('')
    setInstallerDone(false)
    setInstallerResult(null)
    setBuilding(true)

    try {
      const result = await buildInstaller(
        (message) => {
          setLogs((prev) => [...prev, message])
          setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0)
        },
        logoPath,
        latestVersion.version,
        latestVersion.release_notes,
      )
      setInstallerResult(result)
      setInstallerDone(true)
      void qc.invalidateQueries({ queryKey: ['skill-pack'] })
    } catch (err) {
      setInstallerError(errorMessage(err, 'Installer build failed'))
    } finally {
      setBuilding(false)
    }
  }

  function handleOpenInstaller() {
    if (!installerOutputPath || !installerReady) return
    void window.conxa.saveInstaller(installerOutputPath)
  }

  if (packQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Build Installer" />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading package…</span>
          </div>
        </div>
      </div>
    )
  }

  if (packQ.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Build Installer" />
        <div className="mx-6 mt-6 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">
            {(packQ.error as Error)?.message ?? 'Failed to load the skill package'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Build Installer"
        description="Advanced: package a published skill pack into a distributable Windows installer. Most updates don't need this — use Publish Skill Package instead."
      />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
        {!pack?.build ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="rounded-full border border-white/8 bg-white/[0.03] p-5">
              <PackageCheck className="size-9 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-400">No skill package built yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Sign off every workflow to auto-build the shared skill package, then return here to create its installer.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Package header */}
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug text-white">{pack.company_name}</h3>
                  <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{pack.build.output_path}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 px-2.5 py-1 text-xs',
                    installerReady
                      ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200'
                      : building
                        ? 'border-sky-500/25 bg-sky-500/[0.08] text-sky-200'
                        : 'border-white/10 bg-white/[0.04] text-zinc-300',
                  )}
                >
                  {selectedStatus}
                </Badge>
              </div>
            </div>

            {/* Not-yet-published warning */}
            {!versionsQ.isLoading && !latestVersion && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Publish a skill pack release first</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    Build Installer packages an already-published release.{' '}
                    <Link
                      to="/publish"
                      className="font-medium underline underline-offset-2 hover:text-amber-300 transition-colors"
                    >
                      Publish Skill Package
                    </Link>{' '}
                    before building an installer.
                  </p>
                </div>
              </div>
            )}

            {/* Configuration */}
            <div className={cn('mt-4 grid gap-3', !installerReady && 'sm:grid-cols-2')}>
              {/* Logo upload zone */}
              <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Installer Logo
                  </p>
                  {!logoPath && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      Required
                    </span>
                  )}
                </div>
                {logoPath ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                      <ImagePlus className="size-5 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-200">
                        {logoPath.split(/[\\/]/).pop()}
                      </p>
                      <p className="text-[11px] text-zinc-500">Logo ready</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearLogo}
                      className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-300"
                      aria-label="Remove logo"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handlePickLogo}
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/12 py-5 text-center transition-colors hover:border-white/20 hover:bg-white/[0.03]"
                  >
                    <ImagePlus className="size-6 text-zinc-600" />
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Click to select logo</p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">PNG, JPG, or ICO</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Release being packaged — folded into Build details once installed */}
              {!installerReady && (
                <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Release Being Packaged
                  </p>
                  {latestVersion ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-medium text-sky-300">
                          v{latestVersion.version}
                        </span>
                        <CheckCircle2 className="size-3.5 text-emerald-400" />
                      </div>
                      <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                        {latestVersion.release_notes}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-600">No published release yet.</p>
                  )}
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void handleBuildInstaller()} disabled={!canBuild}>
                {building ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Building installer…
                  </>
                ) : (
                  <>
                    <PackageCheck className="size-4" />
                    {installerReady ? 'Rebuild Installer' : 'Build Installer'}
                  </>
                )}
              </Button>
            </div>

            {/* Build error */}
            {installerError && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">Build failed</p>
                  <p className="mt-0.5 text-xs text-red-400/80">{humanizeError(installerError)}</p>
                </div>
              </div>
            )}

            {/* Non-fatal cloud upload warning — installer upload is optional; the
                build itself already succeeded (see cmd_build_installer). */}
            {installerDone && installerResult?.cloud_upload_error && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Cloud upload skipped</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    {installerResult.cloud_upload_error_message || humanizeError(installerResult.cloud_upload_error)}{' '}
                    The local installer was built successfully.
                  </p>
                </div>
              </div>
            )}

            {/* Installer ready — hero card, renders whether just-built this session
                or loaded from the backend-persisted skill pack's installer on return */}
            {installerInfo && (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                      <CheckCircle2 className="size-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-300">Installer ready</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-400">
                        {installerInfo.filename}
                        <span className="mx-1.5 text-zinc-600">·</span>
                        <span className="font-mono">v{installerInfo.version}</span>
                        {installerBuiltAt && (
                          <>
                            <span className="mx-1.5 text-zinc-600">·</span>
                            Built{' '}
                            {new Date(installerBuiltAt * 1000).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={handleOpenInstaller}>
                    <Download className="size-4" />
                    Download Installer
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="mt-3 flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  <ChevronDown className={cn('size-3.5 transition-transform', detailsOpen && 'rotate-180')} />
                  Build details
                </button>

                {detailsOpen && (
                  <div className="mt-2 space-y-2">
                    {installerOutputPath && (
                      <ResultCard
                        icon={<HardDrive className="size-4" />}
                        label="Local installer"
                        value={installerOutputPath}
                      />
                    )}
                    {installerResult?.cloud_download_url && (
                      <ResultCard
                        icon={<HardDrive className="size-4" />}
                        label="Cloud download URL"
                        value={installerResult.cloud_download_url}
                        href={installerResult.cloud_download_url}
                      />
                    )}
                    {installerResult?.cloud_version_download_url && (
                      <ResultCard
                        icon={<HardDrive className="size-4" />}
                        label="Version download URL"
                        value={installerResult.cloud_version_download_url}
                        href={installerResult.cloud_version_download_url}
                      />
                    )}
                    {installerResult?.installed_runtime_path && (
                      <ResultCard
                        icon={<HardDrive className="size-4" />}
                        label="Runtime path"
                        value={installerResult.installed_runtime_path}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Build log */}
            <div className="mb-6 mt-4 flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                  Build Log
                </p>
                {logs.length > 0 && (
                  <span className="text-[10px] text-zinc-600">{logs.length} lines</span>
                )}
              </div>
              <div
                ref={logRef}
                className="min-h-[140px] overflow-y-auto rounded-lg border border-white/8 bg-black/40 p-3 font-mono text-[11px]"
              >
                {logs.length === 0 ? (
                  <p className="text-zinc-700">Installer logs will appear here when build starts…</p>
                ) : (
                  <BuildLogPanel logs={logs} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
