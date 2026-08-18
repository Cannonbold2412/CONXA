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
  skillPacks: ['skill-packs'] as const,
  skillPack: (slug: string) => ['skill-pack', slug] as const,
  installerVersions: (slug: string | undefined) => ['installer-versions', slug] as const,
  skillPackVersions: (slug: string | undefined) => ['skill-pack-versions', slug] as const,
  deployments: (slug: string | undefined) => ['deployments', slug] as const,
  auditEvents: (scope?: string) =>
    (scope ? ['auditEvents', scope] : ['auditEvents']) as readonly string[],
  trackingDashboard: (range: string) => ['tracking-dashboard', range] as const,
  trackingDrift: () => ['tracking-drift'] as const,
  trackingActivity: () => ['tracking-activity'] as const,
  trackingWorkflow: (company: string, slug: string, range: string) =>
    ['tracking-workflow', company, slug, range] as const,
  trackingRun: (company: string, runId: string) => ['tracking-run', company, runId] as const,
  roiAssumptions: () => ['roi-assumptions'] as const,
} as const
