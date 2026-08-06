import { Suspense } from 'react'
import { OverviewPage } from '@/dashboard/OverviewPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <OverviewPage />
    </Suspense>
  )
}
