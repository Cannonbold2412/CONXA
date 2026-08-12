import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSkillPack, fetchSkillPackVersions, publishSkillPack, type SkillPackReleaseResult } from '@/api/workflowsApi'
import { fetchEntitlements } from '@/api/usageApi'
import { errorMessage } from '@/api/workflowApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuildLogPanel, ResultCard } from '@/components/BuildLogUi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Clock, FileText, Globe, Loader2, Tag, UploadCloud, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** Suggests the next patch release after the last one actually published. */
function suggestNextVersion(lastPublished: string | undefined): string {
  const match = lastPublished?.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return '1.0.0'
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

function formatTimestamp(seconds: number): string {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleString()
}

export function PublishPage() {
  const qc = useQueryClient()
  const packQ = useQuery({
    queryKey: ['skill-pack'],
    queryFn: fetchSkillPack,
    staleTime: 10_000,
  })

  const entitlementsQ = useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 30_000,
    retry: 1,
  })

  const creditsMeter = entitlementsQ.data?.meters?.compile_credits

  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [publishError, setPublishError] = useState('')
  const [publishDone, setPublishDone] = useState(false)
  const [publishResult, setPublishResult] = useState<SkillPackReleaseResult | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const pack = packQ.data?.skill_pack ?? null
  const workflows = packQ.data?.workflows ?? []
  const allTestsPassed = workflows.length > 0 && workflows.every((w) => w.last_test_status === 'passed')
  const untestedCount = workflows.filter((w) => w.last_test_status !== 'passed').length

  const versionsQ = useQuery({
    queryKey: ['skill-pack-versions'],
    queryFn: fetchSkillPackVersions,
    enabled: Boolean(pack?.build),
    staleTime: 10_000,
  })
  const versions = versionsQ.data?.versions ?? []
  const latestVersion = versions[0]

  const versionValue = version.trim()
  const notesValue = releaseNotes.trim()
  const versionValid = SEMVER_RE.test(versionValue)
  const notesValid = notesValue.length > 0 && notesValue.length <= 2000
  const canPublish = !!pack?.build && allTestsPassed && versionValid && notesValid && !publishing

  async function handlePublish() {
    if (!canPublish) return
    setLogs([])
    setPublishError('')
    setPublishDone(false)
    setPublishResult(null)
    setPublishing(true)

    try {
      const result = await publishSkillPack(versionValue, notesValue, (message) => {
        setLogs((prev) => [...prev, message])
        setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0)
      })
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

  // Always rendered (never null) — PageHeader only shows its body row when
  // `actions` is truthy, so a conditional-on-creditsMeter pill would make this
  // row disappear entirely while entitlements are still loading.
  const slotPill = (
    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px]">
      <span className="font-semibold text-zinc-200">
        {creditsMeter
          ? creditsMeter.unlimited
            ? creditsMeter.used
            : `${creditsMeter.remaining} / ${creditsMeter.limit}`
          : '—'}
      </span>
      <span className="text-zinc-500">
        {creditsMeter?.unlimited ? 'compiles used' : 'compile credits left'}
      </span>
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
        title="Publish Skill Package"
        description="Ship a version-controlled skill pack update — the primary way to release changes to customers who already have Conxa installed."
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
            {/* Package header */}
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
                {latestVersion && (
                  <Badge variant="outline" className="shrink-0 border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300">
                    latest: v{latestVersion.version}
                  </Badge>
                )}
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

            {/* Test warning */}
            {!allTestsPassed && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Tests required before publish</p>
                  <p className="mt-0.5 text-xs text-amber-400/80">
                    {untestedCount} workflow{untestedCount !== 1 ? 's' : ''} must pass before this skill pack can be published.
                  </p>
                </div>
              </div>
            )}

            {/* Release form */}
            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Release Details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-zinc-300">Version</span>
                  <Input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder={suggestNextVersion(latestVersion?.version)}
                    aria-invalid={version.length > 0 && !versionValid}
                    disabled={publishing || !allTestsPassed}
                    className="font-mono"
                  />
                  {version.length > 0 && !versionValid ? (
                    <p className="text-xs text-red-300">Must be semver: 1.2.3 or 1.2.3-beta.1</p>
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
                <Button size="sm" onClick={() => void handlePublish()} disabled={!canPublish}>
                  {publishing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <UploadCloud className="size-4" />
                      Publish Skill Pack
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Publish error */}
            {publishError && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">Publish failed</p>
                  <p className="mt-0.5 text-xs text-red-400/80">{publishError}</p>
                </div>
              </div>
            )}

            {/* Publish success */}
            {publishDone && (
              <div className="mt-3">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">Skill pack published</p>
                </div>
                <div className="space-y-2">
                  {publishResult?.version && (
                    <ResultCard icon={<Tag className="size-4" />} label="Version" value={publishResult.version} />
                  )}
                  {publishResult?.sync_endpoint && (
                    <ResultCard icon={<Globe className="size-4" />} label="Sync endpoint" value={publishResult.sync_endpoint} />
                  )}
                  {publishResult?.tracking_url && (
                    <ResultCard icon={<Globe className="size-4" />} label="Tracking URL" value={publishResult.tracking_url} />
                  )}
                  {publishResult?.workspace_id && (
                    <ResultCard icon={<FileText className="size-4" />} label="Workspace ID" value={publishResult.workspace_id} />
                  )}
                </div>
              </div>
            )}

            {/* Publish log */}
            <div className="mb-6 mt-4 flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Publish Log</p>
                {logs.length > 0 && <span className="text-[10px] text-zinc-600">{logs.length} lines</span>}
              </div>
              <div
                ref={logRef}
                className="min-h-[100px] overflow-y-auto rounded-lg border border-white/8 bg-black/40 p-3 font-mono text-[11px]"
              >
                {logs.length === 0 ? (
                  <p className="text-zinc-700">Publish logs will appear here when publishing starts…</p>
                ) : (
                  <BuildLogPanel logs={logs} />
                )}
              </div>
            </div>

            {/* Version history */}
            <div className="mb-6 flex flex-col">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                Release History
              </p>
              {versionsQ.isLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-zinc-500">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span className="text-xs">Loading version history…</span>
                </div>
              ) : versions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-xs text-zinc-500">No releases published yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div
                      key={v.version}
                      className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-medium text-sky-300">
                            v{v.version}
                          </span>
                          {v.is_latest && (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/[0.08] text-[10px] text-emerald-300">
                              latest
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Clock className="size-3" />
                          {formatTimestamp(v.published_at)}
                        </div>
                      </div>
                      {v.release_notes && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{v.release_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
