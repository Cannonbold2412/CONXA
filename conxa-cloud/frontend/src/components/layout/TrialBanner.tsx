'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock } from 'lucide-react'
import { fetchEntitlements } from '@/api/productApi'
import { queryKeys } from '@/lib/queryKeys'

function daysLeft(trialEndsAt: string) {
  const end = new Date(trialEndsAt).getTime()
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
}

/** Free-trial countdown / expiry banner. Renders nothing unless the
 * workspace is on the free plan with trial state to report. */
export function TrialBanner() {
  const entitlementsQ = useQuery({
    queryKey: queryKeys.entitlements,
    queryFn: fetchEntitlements,
    staleTime: 60_000,
    retry: 1,
  })
  const data = entitlementsQ.data

  if (entitlementsQ.isLoading || entitlementsQ.isError) return null
  if (!data || data.plan !== 'free') return null

  if (data.trial_expired) {
    return (
      <div className="border-b border-red-500/30 bg-red-500/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
          <AlertTriangle className="size-4 shrink-0 text-red-300" />
          <p className="text-sm text-red-100">
            Your free trial has ended — publishing and LLM-backed features are paused.
          </p>
          <Link href="/billing" className="ml-auto shrink-0 text-sm font-medium text-red-200 underline-offset-4 hover:underline">
            Upgrade now →
          </Link>
        </div>
      </div>
    )
  }

  const remaining = data.trial_ends_at ? daysLeft(data.trial_ends_at) : null
  if (remaining == null) return null

  const endsLabel = new Date(data.trial_ends_at as string).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const urgent = remaining <= 7

  return (
    <div className={urgent ? 'border-b border-amber-500/30 bg-amber-500/10' : 'border-b border-cyan-400/20 bg-white/[0.03]'}>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <Clock className={urgent ? 'size-4 shrink-0 text-amber-300' : 'size-4 shrink-0 text-cyan-300'} />
        <p className={urgent ? 'text-sm text-amber-100' : 'text-sm text-zinc-300'}>
          Free trial — {remaining} day{remaining === 1 ? '' : 's'} left (ends {endsLabel}).
        </p>
        <Link href="/billing" className="ml-auto shrink-0 text-sm font-medium text-zinc-200 underline-offset-4 hover:underline">
          View plans →
        </Link>
      </div>
    </div>
  )
}
