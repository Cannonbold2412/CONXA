/**
 * Central registry of TanStack Query keys.
 *
 * Using these instead of inline string-literal arrays keeps reads and
 * invalidations in sync — a mistyped key can no longer silently skip a cache
 * update. Per-call `staleTime`/`retry` options stay at the call site.
 */
export const queryKeys = {
  me: ['me'] as const,
  entitlements: ['entitlements'] as const,
  subscription: ['subscription'] as const,
  billingPlans: ['billing-plans'] as const,
  plugins: ['plugins'] as const,
  plugin: (id: string) => ['plugin', id] as const,
  installerVersions: (slug: string | undefined) => ['installer-versions', slug] as const,
  auditEvents: (scope?: string) =>
    (scope ? ['auditEvents', scope] : ['auditEvents']) as readonly string[],
  trackingDashboard: (range: string) => ['tracking-dashboard', range] as const,
  trackingDrift: () => ['tracking-drift'] as const,
} as const
