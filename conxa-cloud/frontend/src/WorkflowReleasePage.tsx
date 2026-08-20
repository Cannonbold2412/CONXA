'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDeployments,
  fetchReleaseDiff,
  fetchReleaseEvents,
  fetchSkillPackVersions,
  fetchGroups,
} from '@/api/workflowsApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DiffPanel } from '@/components/release/DiffPanel'
import { ReleaseHistoryTable } from '@/components/release/ReleaseHistoryTable'
import { DeploymentPanel } from '@/components/release/DeploymentPanel'
import { ReleaseAuditLog } from '@/components/release/ReleaseAuditLog'
import { ReleaseDialog } from '@/components/release/ReleaseDialog'
import { ChevronLeft, PackageCheck } from 'lucide-react'
import { queryKeys } from '@/lib/queryKeys'

function SummaryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
      <p className="mt-0.5 truncate text-xs text-zinc-600">{sub}</p>
    </div>
  )
}

/** Skill Packages → Group → Workflow: the full per-workflow release page —
 * current production version, pending "ready" versions with diff + Release
 * action, version history, deployment status, rollback, and audit. This is
 * where "publish ≠ deploy" actually plays out: Build Studio only ever gets a
 * version to "ready" here; everything below the Ready for Release section is
 * Cloud-owned end to end. */
export function WorkflowReleasePage({
  groupId,
  skillSlug,
}: {
  groupId: string
  skillSlug: string
}) {
  const qc = useQueryClient()
  const groupsQ = useQuery({ queryKey: queryKeys.groups, queryFn: fetchGroups, staleTime: 15_000 })
  const groups = groupsQ.data?.groups ?? []
  const group = groups.find((g) => g.group_id === groupId)
  const workflowName = group?.workflows.find((w) => w.skill_slug === skillSlug)?.workflow_name ?? skillSlug

  const versionsQ = useQuery({
    queryKey: queryKeys.skillPackVersions(skillSlug),
    queryFn: () => fetchSkillPackVersions(skillSlug),
    staleTime: 10_000,
  })
  const deploymentsQ = useQuery({
    queryKey: queryKeys.deployments(skillSlug),
    queryFn: () => fetchDeployments(skillSlug),
    staleTime: 15_000,
  })
  const eventsQ = useQuery({
    queryKey: queryKeys.releaseEvents(skillSlug),
    queryFn: () => fetchReleaseEvents(skillSlug),
    staleTime: 10_000,
  })

  const versions = versionsQ.data?.versions ?? []
  const currentStableVersion = versionsQ.data?.current_stable?.version ?? null
  const readyVersions = versions.filter((v) => v.status === 'ready')

  const [selectedReady, setSelectedReady] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedReady && readyVersions.length > 0) setSelectedReady(readyVersions[0].version)
    if (selectedReady && !readyVersions.some((v) => v.version === selectedReady)) {
      setSelectedReady(readyVersions[0]?.version ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyVersions.map((v) => v.version).join(',')])

  const diffQ = useQuery({
    queryKey: queryKeys.releaseDiff(skillSlug, selectedReady ?? undefined),
    queryFn: () => fetchReleaseDiff(skillSlug, selectedReady as string),
    enabled: Boolean(selectedReady),
    staleTime: 15_000,
  })

  function refreshReleaseData() {
    void versionsQ.refetch()
    void deploymentsQ.refetch()
    void eventsQ.refetch()
    void qc.invalidateQueries({ queryKey: queryKeys.groups })
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={workflowName}
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white"
          >
            <Link href={`/packages/groups/${encodeURIComponent(groupId)}`}>
              <ChevronLeft className="size-3.5" />
              Back
            </Link>
          </Button>
        }
      />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6">
        {groupsQ.isLoading || versionsQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
        ) : versionsQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {(versionsQ.error as Error).message}
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <SummaryStat
                label="Production version"
                value={currentStableVersion ? `v${currentStableVersion}` : 'Not released'}
                sub="live via stable channel"
              />
              <SummaryStat label="Awaiting release" value={String(readyVersions.length)} sub="published, not deployed" />
              <SummaryStat label="Releases" value={String(versions.length)} sub="total versions published" />
            </section>

            {readyVersions.length > 0 && (
              <section>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                  Ready for Release
                </p>
                <Card className="gap-0 border-sky-500/20 bg-sky-500/[0.03] py-0 shadow-none">
                  <CardHeader className="border-b border-white/8 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {readyVersions.map((v) => (
                          <button
                            key={v.version}
                            type="button"
                            onClick={() => setSelectedReady(v.version)}
                            className={`rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                              v.version === selectedReady
                                ? 'border-sky-500/40 bg-sky-500/[0.12] text-sky-300'
                                : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                            }`}
                          >
                            v{v.version}
                          </button>
                        ))}
                      </div>
                      {selectedReady && (
                        <ReleaseDialog
                          skillSlug={skillSlug}
                          version={selectedReady}
                          currentStableVersion={currentStableVersion}
                          onReleased={refreshReleaseData}
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-3">
                    {(() => {
                      const row = readyVersions.find((v) => v.version === selectedReady)
                      if (!row) return null
                      return (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                          {row.release_notes && <span className="text-zinc-300">{row.release_notes}</span>}
                          {row.tests_passed != null && (
                            <span className={row.tests_passed ? 'text-emerald-400' : 'text-amber-400'}>
                              {row.tests_passed ? 'Tests passed at publish' : 'Tests were not passing at publish'}
                            </span>
                          )}
                          {row.artifact_sha256 && (
                            <span className="font-mono" title={row.artifact_sha256}>
                              sha256 {row.artifact_sha256.slice(0, 12)}…
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    {diffQ.data?.available ? (
                      <DiffPanel diff={diffQ.data} previousVersion={diffQ.data.from_version} />
                    ) : diffQ.isLoading ? (
                      <div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
                    ) : null}
                  </CardContent>
                </Card>
              </section>
            )}

            <section>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Release History</p>
              {versions.length === 0 ? (
                <Card className="border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                    <PackageCheck className="size-7 text-zinc-600" />
                    <p className="text-sm font-medium text-zinc-300">No releases published yet</p>
                  </CardContent>
                </Card>
              ) : (
                <ReleaseHistoryTable
                  skillSlug={skillSlug}
                  versions={versions}
                  currentStableVersion={currentStableVersion}
                  isLoading={false}
                  onReleased={refreshReleaseData}
                  onRolledBack={refreshReleaseData}
                  onSelectVersion={() => {}}
                />
              )}
            </section>

            <section>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Deployment</p>
              <DeploymentPanel data={deploymentsQ.data} isLoading={deploymentsQ.isLoading} />
            </section>

            <section className="mb-6">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Audit</p>
              <ReleaseAuditLog events={eventsQ.data?.events ?? []} isLoading={eventsQ.isLoading} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}
