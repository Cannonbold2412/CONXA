import { Suspense } from 'react'
import { WorkflowsPage } from '@/dashboard/WorkflowsPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <WorkflowsPage />
    </Suspense>
  )
}
