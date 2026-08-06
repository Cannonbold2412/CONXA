import { Suspense } from 'react'
import { RunDetailPage } from '@/dashboard/RunDetailPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default async function Page({
  params,
}: {
  params: Promise<{ company: string; runId: string }>
}) {
  const { company, runId } = await params
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <RunDetailPage company={decodeURIComponent(company)} runId={decodeURIComponent(runId)} />
    </Suspense>
  )
}
