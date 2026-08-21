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
  skillPack: ['skill-pack'] as const,
  installerVersions: ['installer-versions'] as const,
  groups: ['groups'] as const,
  skillPackVersions: (skillSlug: string | undefined) =>
    ['skill-pack-versions', skillSlug] as const,
  deployments: (skillSlug: string | undefined) =>
    ['deployments', skillSlug] as const,
  releaseEvents: (skillSlug: string | undefined) =>
    ['release-events', skillSlug] as const,
  releaseDiff: (skillSlug: string | undefined, version: string | undefined) =>
    ['release-diff', skillSlug, version] as const,
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
