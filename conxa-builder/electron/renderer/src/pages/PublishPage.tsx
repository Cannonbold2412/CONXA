import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSkillPack,
  fetchSkillPackVersions,
  fetchDeployments,
  fetchReleaseEvents,
  previewRelease,
  publishSkillPack,
  type RollbackResult,
  type SkillPackReleaseResult,
} from '@/api/workflowsApi'
import { fetchEntitlements } from '@/api/usageApi'
import { errorMessage } from '@/api/workflowApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuildLogPanel } from '@/components/BuildLogUi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DiffPanel } from '@/components/release/DiffPanel'
import { ReleaseHistoryTable } from '@/components/release/ReleaseHistoryTable'
import { DeploymentPanel } from '@/components/release/DeploymentPanel'
import { ReleaseAuditLog } from '@/components/release/ReleaseAuditLog'
import { ReleaseStatusBadge } from '@/components/release/ReleaseStatusBadge'
import {
  canPublish,
  derivePublishUiState,
  isValidSemver,
  stageChecklist,
  stageLabel,
  suggestNextVersion,
  untestedCount,
  type PublishStage,
} from '@/lib/releaseState'
import { CheckCircle2, ChevronRight, Loader2, Rocket, UploadCloud, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PublishPage() {
  const qc = useQueryClient()
  const packQ = useQuery({ queryKey: ['skill-pack'], queryFn: fetchSkillPack, staleTime: 10_000 })
  const entitlementsQ = useQuery({ queryKey: ['entitlements'], queryFn: fetchEntitlements, staleTime: 30_000, retry: 1 })
  const creditsMeter = entitlementsQ.data?.meters?.compile_credits

  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishStage, setPublishStage] = useState<PublishStage | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [publishError, setPublishError] = useState('')
  const [publishDone, setPublishDone] = useState(false)
  const [publishResult, setPublishResult] = useState<SkillPackReleaseResult | null>(null)
  const [rollbackNotice, setRollbackNotice] = useState<RollbackResult | null>(null)

  const pack = packQ.data?.skill_pack ?? null
  const workflows = packQ.data?.workflows ?? []
  const allTestsPassed = workflows.length > 0 && workflows.every((w) => w.last_test_status === 'passed')
  const untested = untestedCount(workflows)

  const versionsQ = useQuery({
    queryKey: ['skill-pack-versions'],
    queryFn: fetchSkillPackVersions,
    enabled: Boolean(pack?.build),
    staleTime: 10_000,
  })
  const versions = versionsQ.data?.versions ?? []
  const currentStable = versionsQ.data?.current_stable ?? null
  const currentStableVersion = currentStable?.version ?? null

  const versionValue = version.trim()
  const notesValue = releaseNotes.trim()
  const versionValid = isValidSemver(versionValue)

  const previewQ = useQuery({
    queryKey: ['release-preview', versionValue],
    queryFn: () => previewRelease(versionValue),
    enabled: Boolean(pack?.build) && versionValid,
    staleTime: 5_000,
  })
  const preview = previewQ.data

  const deploymentsQ = useQuery({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    enabled: Boolean(pack?.build),
    staleTime: 15_000,
  })
  const eventsQ = useQuery({
    queryKey: ['release-events'],
    queryFn: fetchReleaseEvents,
    enabled: Boolean(pack?.build),
    staleTime: 10_000,
  })

  const notesValid = notesValue.length > 0 && notesValue.length <= 2000
  const versionAvailable = preview ? preview.version_available && !preview.artifact_unchanged : true
  const readyToPublish = canPublish({
    hasPackage: Boolean(pack?.build),
    allTestsPassed,
    versionValid,
    versionAvailable,
    notesValid,
    publishing,
    // Build Studio is a single-operator local tool with no client-visible role
    // concept today — publish/rollback are enforced server-side (require_admin)
    // regardless of what this UI shows, so this never widens the real gate.
    canManage: true,
  })

  const uiState = derivePublishUiState({ publishing, publishError, publishDone })
  const checklist = stageChecklist(publishStage)

  function refreshReleaseData() {
    void versionsQ.refetch()
    void deploymentsQ.refetch()
    void eventsQ.refetch()
    void entitlementsQ.refetch()
  }

  async function handlePublish() {
    if (!readyToPublish) return
    setLogs([])
    setPublishError('')
    setPublishDone(false)
    setPublishResult(null)
    setRollbackNotice(null)
    setPublishStage(null)
    setPublishing(true)

    try {
      const result = await publishSkillPack(
        versionValue,
        notesValue,
        (message) => setLogs((prev) => [...prev, message]),
        (stage) => setPublishStage(stage as PublishStage),
      )
      setPublishResult(result)
      setPublishDone(true)
      setVersion('')
      setReleaseNotes('')
      refreshReleaseData()
      void qc.invalidateQueries({ queryKey: ['skill-pack'] })
    } catch (err) {
      setPublishError(errorMessage(err, 'Skill pack publish failed'))
    } finally {
      setPublishing(false)
    }
  }

  const slotPill = (
    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px]">
      <span className="font-semibold text-zinc-200">
        {creditsMeter ? (creditsMeter.unlimited ? creditsMeter.used : `${creditsMeter.remaining} / ${creditsMeter.limit}`) : '—'}
      </span>
      <span className="text-zinc-500">{creditsMeter?.unlimited ? 'compiles used' : 'compile credits left'}</span>
    </div>
  )

  if (packQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Publish Skill Package" actions={slotPill} />
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
        <PageHeader title="Publish Skill Package" actions={slotPill} />
        <div className="mx-6 mt-6 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{(packQ.error as Error)?.message ?? 'Failed to load the skill package'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Publish Skill Package"
        description={
          currentStableVersion
            ? `Current release: v${currentStableVersion} — Published, Stable`
            : 'Ship a version-controlled skill pack update — the primary way to release changes to customers who already have Conxa installed.'
        }
        actions={slotPill}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-0 overflow-y-auto px-4 py-6 sm:px-6">
        {!pack?.build ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="rounded-full border border-white/8 bg-white/[0.03] p-5">
              <UploadCloud className="size-9 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-400">No skill package built yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Sign off every workflow to auto-build the shared skill package, then return here to publish it.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Section 1 — Release Candidate */}
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug text-white">{pack.company_name}</h3>
                  <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{pack.build.output_path}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {versions.length > 0
                      ? 'Publishing a new version updates customers via delta sync — no installer rebuild needed.'
                      : "First publish claims this slug's skill pack slot on your plan."}
                  </p>
                </div>
                {currentStable && <ReleaseStatusBadge row={currentStable} currentStableVersion={currentStableVersion} />}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {workflows.map((w) => (
                  <Badge
                    key={w.id}
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      w.last_test_status === 'passed'
                        ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
                    )}
                  >
                    {w.name}
                  </Badge>
                ))}
              </div>
            </div>

            {!allTestsPassed && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Tests required before publish</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    {untested} workflow{untested !== 1 ? 's' : ''} must pass before this skill pack can be published.
                  </p>
                </div>
              </div>
            )}

            {/* Release form */}
            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Release Details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-zinc-300">Version</span>
                  <Input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder={suggestNextVersion(currentStableVersion)}
                    aria-invalid={version.length > 0 && !versionValid}
                    disabled={publishing || !allTestsPassed}
                    className="font-mono"
                  />
                  {version.length > 0 && !versionValid ? (
                    <p className="text-xs text-red-300">Must be semver: 1.2.3 or 1.2.3-beta.1</p>
                  ) : preview && versionValid && !preview.version_available ? (
                    <p className="text-xs text-red-300">Version already published — choose a new one.</p>
                  ) : preview && versionValid && preview.artifact_unchanged ? (
                    <p className="text-xs text-amber-300">Nothing changed since the current stable release.</p>
                  ) : (
                    <p className="text-[11px] text-zinc-600">Format: 1.2.3 or 1.2.3-beta.1</p>
                  )}
                </label>
                <label className="grid gap-1.5 sm:row-span-2">
                  <span className="text-xs font-medium text-zinc-300">Release notes</span>
                  <Textarea
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Describe what changed in this release…"
                    aria-invalid={releaseNotes.length > 2000}
                    disabled={publishing || !allTestsPassed}
                    className="resize-none"
                  />
                  <p className={cn('text-[11px]', releaseNotes.length > 2000 ? 'text-red-300' : 'text-zinc-600')}>
                    {releaseNotes.length} / 2000 characters
                  </p>
                </label>
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={() => void handlePublish()} disabled={!readyToPublish}>
                  {publishing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Rocket className="size-4" />
                      Publish {versionValid ? `v${versionValue}` : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Section 2 — What Will Change */}
            {preview && versionValid && (
              <div className="mt-4">
                <DiffPanel diff={preview.diff} previousVersion={preview.previous_version} />
              </div>
            )}

            {/* Section 3 — Where Will It Go */}
            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Where Will It Go</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-zinc-300">Stable channel</span>
                <span className="font-mono text-zinc-400">v{currentStableVersion ?? '—'}</span>
                <ChevronRight className="size-3.5 text-zinc-600" />
                <span className="font-mono text-emerald-300">{versionValid ? `v${versionValue}` : '…'}</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {deploymentsQ.data
                  ? `Active runtimes: ${deploymentsQ.data.summary.total}. Runtimes will receive this version automatically at their next sync.`
                  : 'Runtimes will receive this version automatically at their next sync.'}
              </p>
            </div>

            {/* Publishing UX states */}
            {uiState === 'publishing' && (
              <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-4">
                <p className="mb-2 text-sm font-medium text-sky-300">Publishing v{versionValue}</p>
                <ul className="space-y-1">
                  {checklist.map(({ stage, state }) => (
                    <li key={stage} className="flex items-center gap-2 text-xs">
                      {state === 'done' && <CheckCircle2 className="size-3.5 text-emerald-400" />}
                      {state === 'active' && <Loader2 className="size-3.5 animate-spin text-sky-400" />}
                      {state === 'pending' && <span className="size-3.5 rounded-full border border-white/15" />}
                      <span className={state === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}>{stageLabel(stage)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {uiState === 'failure' && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">Publishing failed</p>
                  <p className="mt-0.5 text-xs text-red-400/80">
                    v{versionValue || '—'} was NOT released. Stable remains v{currentStableVersion ?? '—'}.
                  </p>
                  <p className="mt-1 text-xs text-red-400/80">{publishError}</p>
                </div>
              </div>
            )}

            {uiState === 'success' && publishResult && (
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">Published successfully</p>
                </div>
                <p className="text-xs text-emerald-300/90">
                  v{publishResult.version} is now the Stable release. Runtimes will receive the update during their next sync.
                </p>
              </div>
            )}

            {rollbackNotice && (
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <p className="text-sm font-medium text-amber-300">
                  Rolled back to v{rollbackNotice.rolled_back_to} (was v{rollbackNotice.previous_stable ?? '—'})
                </p>
              </div>
            )}

            {/* Publish log */}
            <div className="mb-6 mt-4 flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Publish Log</p>
                {logs.length > 0 && <span className="text-[10px] text-zinc-600">{logs.length} lines</span>}
              </div>
              <div className="min-h-[100px] overflow-y-auto rounded-lg border border-white/8 bg-black/40 p-3 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <p className="text-zinc-700">Publish logs will appear here when publishing starts…</p>
                ) : (
                  <BuildLogPanel logs={logs} />
                )}
              </div>
            </div>

            {/* Section 4 — Release History */}
            <div className="mb-6 flex flex-col">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Release History</p>
              <ReleaseHistoryTable
                versions={versions}
                currentStableVersion={currentStableVersion}
                isLoading={versionsQ.isLoading}
                onSelectVersion={() => {}}
                onRolledBack={(result) => {
                  setRollbackNotice(result)
                  refreshReleaseData()
                }}
              />
            </div>

            {/* Section 5 — Deployment */}
            <div className="mb-6 flex flex-col">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Deployment</p>
              <DeploymentPanel data={deploymentsQ.data} isLoading={deploymentsQ.isLoading} />
            </div>

            {/* Section 6 — Audit */}
            <div className="mb-6 flex flex-col">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Audit</p>
              <ReleaseAuditLog events={eventsQ.data?.events ?? []} isLoading={eventsQ.isLoading} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
