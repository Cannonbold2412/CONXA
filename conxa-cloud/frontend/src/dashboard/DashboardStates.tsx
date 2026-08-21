'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** True when a dashboard query failed because the workspace's plan doesn't include
 * operations analytics, not because anything is actually broken (see `ensure_ops_tier`
 * in the tracking API). Callers should route this to `UpgradeRequired`, not `DashboardError`. */
export function isUpgradeRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === 'ops_tier_required'
}

/** Page container — same rhythm on every dashboard section. */
export function DashboardPageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[92rem] space-y-4 px-4 py-5 sm:px-6">{children}</div>
}

/**
 * Skeleton, not a spinner: the layout is known before the data is, so holding the shape
 * stops the page reflowing under the reader every time a range changes.
 */
export function DashboardSkeleton() {
  return (
    <DashboardPageBody>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/8 bg-white/[0.04] sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 bg-[#0b0d10] px-4 py-3.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </DashboardPageBody>
  )
}

export function DashboardError({ onRetry }: { onRetry?: () => void }) {
  return (
    <DashboardPageBody>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-6 py-12 text-center">
        <AlertTriangle className="size-5 text-red-300" aria-hidden />
        <div>
          <p className="text-sm font-medium text-zinc-100">Could not load telemetry</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            The dashboard could not reach the tracking service. Your workflows are unaffected —
            execution runs entirely on the customer&apos;s machine.
          </p>
        </div>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]"
            onClick={onRetry}
          >
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </Button>
        ) : null}
      </div>
    </DashboardPageBody>
  )
}

/**
 * Plan-gated state — the workspace's tier doesn't include operations analytics
 * (`ensure_ops_tier`). This is permanent, not transient, so unlike `DashboardError`
 * it never offers a retry — it offers the one action that actually resolves it.
 */
export function UpgradeRequired() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-6 py-14 text-center">
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden className="text-zinc-700">
        <rect x="9" y="21" width="34" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 21v-6a10 10 0 0 1 20 0v6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="26" cy="31" r="2.25" fill="var(--tier-3)" />
        <path d="M26 33.25V37" stroke="var(--tier-3)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-sm font-medium text-zinc-200">Operations analytics isn&apos;t on your plan</p>
        <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-zinc-500">
          Health, reliability, and recovery data across your deployed workflows is a Starter-plan
          feature. Your workflows keep running either way — execution is local and unaffected.
        </p>
      </div>
      <Button
        asChild
        size="sm"
        className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]"
        variant="outline"
      >
        <Link href="/billing">View plans</Link>
      </Button>
    </div>
  )
}

/**
 * First-run state.
 *
 * Names the exact event that fills the dashboard and the action that produces it. "No data
 * yet" tells someone nothing is here; this tells them why and what to do about it.
 */
export function NoTelemetry() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-6 py-14 text-center">
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden className="text-zinc-700">
        <rect x="4.5" y="10.5" width="43" height="31" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 18.5h43" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="14.5" r="1.2" fill="currentColor" />
        <circle cx="14.5" cy="14.5" r="1.2" fill="currentColor" />
        <path
          d="M12 33.5l6.5-7 5 4.5 6-9 5.5 6.5 5-4"
          stroke="var(--tier-3)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 4"
        />
      </svg>
      <div>
        <p className="text-sm font-medium text-zinc-200">No production telemetry yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-zinc-500">
          This dashboard fills up the first time a customer&apos;s runtime executes one of your
          skills. Publish a skill pack, install it on a customer machine, and run it once — health,
          reliability, and recovery data will appear here within seconds.
        </p>
      </div>
    </div>
  )
}
