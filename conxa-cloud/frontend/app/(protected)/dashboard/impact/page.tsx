import { Suspense } from 'react'
import { ImpactPage } from '@/dashboard/ImpactPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ImpactPage />
    </Suspense>
  )
}
