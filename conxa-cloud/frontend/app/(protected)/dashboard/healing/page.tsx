import { Suspense } from 'react'
import { HealingPage } from '@/dashboard/HealingPage'
import { DashboardSkeleton } from '@/dashboard/DashboardStates'

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HealingPage />
    </Suspense>
  )
}
