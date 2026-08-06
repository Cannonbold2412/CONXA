import { Suspense } from 'react'
import { WorkflowDetailPage } from '@/dashboard/WorkflowDetailPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default async function Page({
  params,
}: {
  params: Promise<{ company: string; slug: string }>
}) {
  const { company, slug } = await params
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <WorkflowDetailPage company={decodeURIComponent(company)} slug={decodeURIComponent(slug)} />
    </Suspense>
  )
}
