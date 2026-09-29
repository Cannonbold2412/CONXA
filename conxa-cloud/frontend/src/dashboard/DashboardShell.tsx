'use client'

import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { RANGES, useRange } from './useRange'

const TABS = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/workflows', label: 'Workflows', exact: false },
  { href: '/dashboard/healing', label: 'Self-healing', exact: false },
  { href: '/dashboard/impact', label: 'Impact', exact: false },
]

function RangePicker() {
  const [range, setRange] = useRange()
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
    >
      {RANGES.map((option) => {
        const active = option.value === range
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.long}
            onClick={() => setRange(option.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400/70',
              active ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-400 hover:text-zinc-100',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function RefreshButton() {
  const queryClient = useQueryClient()
  // Any in-flight tracking query counts — the spinner should reflect the page, not one call.
  const fetching = useIsFetching({
    predicate: (query) => String(query.queryKey[0] ?? '').startsWith('tracking'),
  })
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] hover:text-white"
      onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.trackingDashboardAll })}
      aria-label="Refresh dashboard data"
    >
      <RefreshCw className={cn('size-3.5', fetching > 0 && 'motion-safe:animate-spin')} aria-hidden />
      Refresh
    </Button>
  )
}

function SubNav() {
  const pathname = usePathname()
  const [range] = useRange()
  return (
    <nav className="-mb-px flex items-center gap-7 overflow-x-auto" aria-label="Dashboard sections">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={`${tab.href}?range=${range}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 pb-3 pt-1 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70',
              active
                ? 'border-zinc-100 font-medium text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-100',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Chrome shared by every dashboard section: title, sub-navigation, range, refresh.
 *
 * The sidebar keeps one "Dashboard" entry rather than sprouting five — the sections are
 * facets of one surface, not five destinations, and a sidebar that grows with every panel
 * stops being navigable.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Operations"
        description="How every deployed workflow is doing, in plain terms."
        info="Live health, reliability, and business impact across every deployed workflow."
        actions={
          <Suspense fallback={null}>
            <div className="flex items-center gap-2">
              <RangePicker />
              <RefreshButton />
            </div>
          </Suspense>
        }
      />
      <div className="border-b border-white/8 px-4 sm:px-6">
        <Suspense fallback={null}>
          <SubNav />
        </Suspense>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
