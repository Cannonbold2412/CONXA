import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSkillPack,
  fetchSkillPackVersions,
  previewRelease,
  publishSkillPack,
  type SkillPackReleaseResult,
} from '@/api/workflowsApi'
import { fetchEntitlements } from '@/api/usageApi'
import { errorMessage } from '@/api/workflowApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuildLogPanel } from '@/components/BuildLogUi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DiffPanel } from '@/components/release/DiffPanel'
import { ReleaseStatusBadge } from '@/components/release/ReleaseStatusBadge'
import {
  canPublish,
  derivePublishUiState,
  isValidSemver,
  stageChecklist,
  stageLabel,
  suggestNextVersion,
  type PublishStage,
} from '@/lib/releaseState'
import { CheckCircle2, CloudUpload, Loader2, Rocket, UploadCloud, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PublishPage() {
  const qc = useQueryClient()
  const packQ = useQuery({ queryKey: ['skill-pack'], queryFn: fetchSkillPack, staleTime: 10_000 })
  const entitlementsQ = useQuery({ queryKey: ['entitlements'], queryFn: fetchEntitlements, staleTime: 30_000, retry: 1 })

  const workflows = packQ.data?.workflows ?? []

  // Every release action below (test gate, version history, diff, deployment,
  // rollback, audit) is scoped to whichever ONE skill is selected here — a
  // sibling workflow's readiness never affects it. See the per-skill
  // publishing architecture: 1 Workflow = 1 Skill = 1 Skill Package.
  const [selectedSkillSlug, setSelectedSkillSlug] = useState('')
  const firstWorkflowSlug = workflows[0]?.slug
  useEffect(() => {
    if (!selectedSkillSlug && firstWorkflowSlug) setSelectedSkillSlug(firstWorkflowSlug)
  }, [firstWorkflowSlug, selectedSkillSlug])
  const selectedWorkflow = workflows.find((w) => w.slug === selectedSkillSlug) ?? null

  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishStage, setPublishStage] = useState<PublishStage | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [publishError, setPublishError] = useState('')
  const [publishDone, setPublishDone] = useState(false)
  const [publishResult, setPublishResult] = useState<SkillPackReleaseResult | null>(null)

  const pack = packQ.data?.skill_pack ?? null
  const allTestsPassed = Boolean(selectedWorkflow && selectedWorkflow.last_test_status === 'passed')

  const versionsQ = useQuery({
    queryKey: ['skill-pack-versions', selectedSkillSlug],
    queryFn: () => fetchSkillPackVersions(selectedSkillSlug),
    enabled: Boolean(pack?.build) && Boolean(selectedSkillSlug),
    staleTime: 10_000,
  })
  const versions = versionsQ.data?.versions ?? []
  const currentStable = versionsQ.data?.current_stable ?? null
  const currentStableVersion = currentStable?.version ?? null

  const versionValue = version.trim()
  const notesValue = releaseNotes.trim()
  const versionValid = isValidSemver(versionValue)

  const previewQ = useQuery({
    queryKey: ['release-preview', selectedSkillSlug, versionValue],
    queryFn: () => previewRelease(selectedSkillSlug, versionValue),
    enabled: Boolean(pack?.build) && Boolean(selectedSkillSlug) && versionValid,
    staleTime: 5_000,
  })
  const preview = previewQ.data

  const notesValid = notesValue.length > 0 && notesValue.length <= 2000
  const versionAvailable = preview ? preview.version_available && !preview.artifact_unchanged : true
  const readyToPublish = canPublish({
    hasPackage: Boolean(pack?.build) && Boolean(selectedSkillSlug),
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

  function handleSelectSkill(slug: string) {
    setSelectedSkillSlug(slug)
    setVersion('')
    setReleaseNotes('')
    setPublishError('')
    setPublishDone(false)
    setPublishResult(null)
    setPublishStage(null)
    setLogs([])
  }

  async function handlePublish() {
    if (!readyToPublish || !selectedSkillSlug) return
    setLogs([])
    setPublishError('')
    setPublishDone(false)
    setPublishResult(null)
    setPublishStage(null)
    setPublishing(true)

    try {
      const result = await publishSkillPack(
        selectedSkillSlug,
        versionValue,
        notesValue,
        (message) => setLogs((prev) => [...prev, message]),
        (stage) => setPublishStage(stage as PublishStage),
      )
      setPublishResult(result)
      setPublishDone(true)
      setVersion('')
      setReleaseNotes('')
      void versionsQ.refetch()
      void entitlementsQ.refetch()
      void qc.invalidateQueries({ queryKey: ['skill-pack'] })
    } catch (err) {
      setPublishError(errorMessage(err, 'Skill pack publish failed'))
    } finally {
      setPublishing(false)
    }
  }

  if (packQ.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Publish Skill Package" />
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
        <PageHeader title="Publish Skill Package" />
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
            : 'Ship a version-controlled skill update — the primary way to release changes to customers who already have Conxa installed.'
        }
      />

      <div className="scrollbar-none mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-0 overflow-y-auto px-4 py-6 sm:px-6">
        {!pack?.build || workflows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="rounded-full border border-white/8 bg-white/[0.03] p-5">
              <UploadCloud className="size-9 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-400">No skill package built yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Sign off a workflow to auto-build its skill, then return here to publish it.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Skill picker — every section below is scoped to this one skill */}
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Skill</p>
              <div className="flex flex-wrap gap-1.5">
                {workflows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectSkill(w.slug)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      w.slug === selectedSkillSlug
                        ? 'border-sky-500/40 bg-sky-500/[0.12] text-sky-300'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                    )}
                  >
                    {w.name}
                    <span
                      className={cn(
                        'ml-1.5 inline-block size-1.5 rounded-full align-middle',
                        w.last_test_status === 'passed' ? 'bg-emerald-400' : 'bg-amber-400',
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Each skill has its own version history and release — publishing one never requires or affects another.
              </p>
            </div>

            {/* Section 1 — Release Candidate */}
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug text-white">
                    {selectedWorkflow?.name ?? pack.company_name}
                  </h3>
                  <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{pack.build.output_path}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {versions.length > 0
                      ? 'Publishing a new version updates customers via delta sync — no installer rebuild needed.'
                      : 'First publish claims this skill its own version history — starting at v1.0.0.'}
                  </p>
                </div>
                {currentStable && <ReleaseStatusBadge row={currentStable} currentStableVersion={currentStableVersion} />}
              </div>
            </div>

            {!allTestsPassed && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Test required before publish</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    {selectedWorkflow
                      ? `${selectedWorkflow.name} must pass its test before it can be published.`
                      : 'Select a skill to publish.'}
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

            {/* Publish never deploys — see docs/App-Flow.md. Deployment status,
                rollback, and audit history all live in Conxa Cloud now. */}
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3">
              <CloudUpload className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              <div>
                <p className="text-sm font-medium text-zinc-300">Publishing does not deploy</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  This uploads v{versionValid ? versionValue : '…'} as an immutable, versioned release. It stays
                  "Ready for Release" until a Cloud admin reviews and explicitly releases it — open Skill Packages
                  in Conxa Cloud to release, roll back, or check deployment/audit status.
                </p>
              </div>
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
                  <p className="text-sm font-semibold text-emerald-300">Uploaded to Conxa Cloud</p>
                </div>
                <p className="text-xs text-emerald-300/90">
                  v{publishResult.version} is Ready for Release. A Cloud admin must review and release it — open
                  Skill Packages in Conxa Cloud to deploy it to customer machines.
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
          </>
        )}
      </div>
    </div>
  )
}
