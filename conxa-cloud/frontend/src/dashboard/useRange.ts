'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { TrackingDashboardRange } from '@/api/pluginApi'

export const RANGES: Array<{ value: TrackingDashboardRange; label: string; long: string }> = [
  { value: '24h', label: '24h', long: 'Last 24 hours' },
  { value: '7d', label: '7d', long: 'Last 7 days' },
  { value: '30d', label: '30d', long: 'Last 30 days' },
  { value: '90d', label: '90d', long: 'Last 90 days' },
]

const VALID = new Set(RANGES.map((r) => r.value))

/**
 * The selected time range, held in the URL rather than in component state.
 *
 * An operator who spots something odd needs to be able to send the link to a colleague and
 * have them see the same window; range in local state produces a URL that shows a different
 * picture to whoever opens it.
 */
export function useRange(): [TrackingDashboardRange, (next: TrackingDashboardRange) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const raw = params.get('range') ?? ''
  const range = (VALID.has(raw as TrackingDashboardRange) ? raw : '7d') as TrackingDashboardRange

  const setRange = useCallback(
    (next: TrackingDashboardRange) => {
      const search = new URLSearchParams(params.toString())
      search.set('range', next)
      router.replace(`${pathname}?${search.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  return [range, setRange]
}

export function rangeLongLabel(range: TrackingDashboardRange): string {
  return RANGES.find((r) => r.value === range)?.long ?? 'Last 7 days'
}
