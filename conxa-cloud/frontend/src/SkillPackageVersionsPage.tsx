'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  fetchInstallerVersions,
  fetchSkillPack,
  type InstallerVersion,
  type SkillPack,
} from '@/api/workflowsApi'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, Clock3, Download, PackageCheck } from 'lucide-react'
import { queryKeys } from '@/lib/queryKeys'

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size'
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: number) {
  if (!ts) return 'Unknown'
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabel(status: SkillPack['status']) {
  const labels: Record<SkillPack['status'], string> = {
    idle: 'Idle',
    building: 'Building',
    error: 'Error',
  }
  return labels[status] ?? 'Error'
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
      <p className="mt-0.5 truncate text-xs text-zinc-600">{sub}</p>
    </div>
  )
}

function releaseRows(pack: SkillPack, versions: InstallerVersion[]) {
  if (versions.length > 0) return versions
  if (!pack.installer) return []
  // Legacy packages with no entry in the versions KV namespace: the backend is
  // the only place that can mint a signed download link (SG-07), so this
  // synthetic row leaves download_url empty rather than guessing an unsigned
  // URL — the UI disables the download action in that case.
  return [
    {
      slug: pack.company_slug,
      version: pack.installer.version,
      release_notes: pack.installer.release_notes ?? '',
      filename: pack.installer.filename,
      sha256: '',
      size: 0,
      uploaded_at: pack.installer.built_at,
      workspace_id: '',
      is_latest: true,
      download_url: '',
    },
  ] satisfies InstallerVersion[]
}

export function SkillPackageVersionsPage({ companySlug }: { companySlug: string }) {
  const packQ = useQuery({
    queryKey: queryKeys.skillPack(companySlug),
    queryFn: () => fetchSkillPack(companySlug),
    staleTime: 10_000,
  })
  const pack = packQ.data?.skill_pack
  const versionsQ = useQuery({
    queryKey: queryKeys.installerVersions(pack?.company_slug),
    queryFn: () => fetchInstallerVersions(pack?.company_slug ?? ''),
    enabled: !!pack?.company_slug,
    staleTime: 30_000,
  })

  const rows = pack ? releaseRows(pack, versionsQ.data?.versions ?? []) : []
  const latest = rows.find((row) => row.is_latest) ?? rows[0]

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={pack?.company_name ?? 'Skill Package'}
        description={pack?.company_slug ?? 'Installer release history and downloads.'}
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white"
          >
            <Link href="/packages">
              <ChevronLeft className="size-3.5" />
              Back
            </Link>
          </Button>
        }
      />

      <main className="flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
        {packQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
        ) : packQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {(packQ.error as Error).message}
          </div>
        ) : pack ? (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <SummaryStat label="Status" value={statusLabel(pack.status)} sub="distribution state" />
              <SummaryStat
                label="Current version"
                value={latest ? `v${latest.version}` : 'Not published'}
                sub={latest?.is_latest ? 'latest installer' : 'waiting for installer'}
              />
              <SummaryStat
                label="Releases"
                value={String(rows.length)}
                sub="installer versions"
              />
            </section>

            <section>
              <Card className="gap-0 border-white/8 bg-white/[0.03] py-0 shadow-none">
                <CardHeader className="border-b border-white/8 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-semibold text-white">Installer Versions</CardTitle>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        Previous releases, builder comments, and version-specific downloads.
                      </p>
                    </div>
                    {versionsQ.isFetching ? (
                      <span className="text-[11px] text-zinc-600">Refreshing</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {versionsQ.isLoading ? (
                    <div className="space-y-2 p-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <PackageCheck className="mx-auto size-7 text-zinc-700" />
                      <p className="mt-2 text-sm font-medium text-zinc-300">No installer versions yet</p>
                      <p className="mt-1 text-xs text-zinc-600">Build and publish an installer to create the first release.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="border-b border-white/8 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Version</th>
                            <th className="px-4 py-2.5 font-medium">Comments</th>
                            <th className="px-4 py-2.5 font-medium">Uploaded</th>
                            <th className="px-4 py-2.5 font-medium">Size</th>
                            <th className="px-4 py-2.5 text-right font-medium">Download</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {rows.map((row) => (
                            <tr key={`${row.version}-${row.download_url}`} className="bg-transparent transition-colors hover:bg-white/[0.025]">
                              <td className="whitespace-nowrap px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-zinc-200">v{row.version}</span>
                                  {row.is_latest ? (
                                    <Badge variant="outline" className="h-5 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                                      Latest
                                    </Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="max-w-[24rem] px-4 py-3 align-top text-xs leading-relaxed text-zinc-400">
                                {row.release_notes?.trim() ? row.release_notes : 'No release comment provided.'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-zinc-500">
                                {formatDate(row.uploaded_at)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-zinc-500">
                                {formatBytes(row.size)}
                              </td>
                              <td className="px-4 py-3 text-right align-top">
                                {row.download_url ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white"
                                  >
                                    <a href={row.download_url} download={row.filename}>
                                      <Download className="size-3.5" />
                                      Download
                                    </a>
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled
                                    title="Refresh the page to get a download link"
                                    className="border-white/10 bg-white/[0.04] text-zinc-500"
                                  >
                                    <Download className="size-3.5" />
                                    Download
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-3 gap-0 border-white/8 bg-white/[0.03] py-0 shadow-none">
                <CardHeader className="border-b border-white/8 py-3">
                  <CardTitle className="text-sm font-semibold text-white">Release Discipline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3 text-xs text-zinc-500">
                  <p className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 size-3.5 shrink-0 text-zinc-600" />
                    Keep comments specific so customers can choose the right installer version.
                  </p>
                  <p>
                    Version rows use stored installer metadata.
                  </p>
                </CardContent>
              </Card>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
