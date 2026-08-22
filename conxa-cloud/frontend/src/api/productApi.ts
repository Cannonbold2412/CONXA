import { apiFetch, json } from '@/lib/apiBase'

export type Workspace = {
  id: string
  slug: string
  name: string
  role: string
}

export type ProxyIdentityStatus =
  | 'trusted'
  | 'backend_secret_missing'
  | 'proxy_secret_missing'
  | 'proxy_secret_mismatch'
  | 'proxy_user_missing'
  | 'proxy_subject_mismatch'

export type MeResponse = {
  user: {
    id: string
    email?: string | null
    name?: string | null
    auth_provider: string
  }
  workspace: Workspace
  auth_required: boolean
  identity_source?: 'trusted_proxy' | 'clerk_jwt' | 'local'
  proxy_identity_trusted?: boolean
  proxy_identity_status?: ProxyIdentityStatus
}

export type DashboardResponse = {
  workspace: Workspace
  stats: {
    skills: number
    packages: number
    workflows: number
    active_jobs: number
    published_packages: number
  }
  recent_workflows: Array<Record<string, unknown>>
  recent_packages: Array<Record<string, unknown>>
  active_jobs: JobRecord[]
  package_health: Array<Record<string, unknown>>
  usage: UsageResponse
}

export type UsageResponse = {
  workspace_id: string
  skills: number
  packages: number
  workflows: number
  jobs: number
  active_jobs: number
  metrics: Record<string, unknown>
  limits: Record<string, number | null>
}

export type EntitlementMeterKey = 'seats' | 'skill_pack_slots' | 'compile_credits' | 'human_edit_tokens'

export type EntitlementMeter = {
  used: number
  limit: number | null
  remaining: number | null
  unlimited: boolean
}

export type EntitlementsResponse = {
  workspace_id: string
  plan: string
  period: string
  reset_at: string
  trial_ends_at?: string | null
  trial_expired?: boolean
  addons?: Record<string, number>
  meters: Record<EntitlementMeterKey, EntitlementMeter>
}

export type SubscriptionResponse = {
  subscription: {
    plan: string
    status: string
    customer_id?: string | null
    subscription_id?: string | null
    current_period_end?: number | null
  }
}

export type JobRecord = {
  job_id: string
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  resource_id?: string | null
  retry_count: number
  user_error?: string | null
  internal_error_code?: string | null
  result?: Record<string, unknown> | null
  created_at: number
  updated_at: number
}

export type PackageRelease = {
  bundle_slug: string
  workspace_id: string
  state: 'draft' | 'published' | 'archived'
  version: string
  release_notes: string
  published_by?: string | null
  published_at?: number | null
  archived_at?: number | null
  updated_at?: number | null
}

export type AuditEvent = {
  id: string
  workspace_id: string
  user_id: string
  action: string
  resource_type: string
  resource_id?: string | null
  metadata: Record<string, unknown>
  created_at: number
}

export function fetchMe(): Promise<MeResponse> {
  return apiFetch('/me').then((r) => json<MeResponse>(r))
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return apiFetch('/dashboard').then((r) => json<DashboardResponse>(r))
}

export function fetchUsage(): Promise<UsageResponse> {
  return apiFetch('/usage').then((r) => json<UsageResponse>(r))
}

export function fetchEntitlements(): Promise<EntitlementsResponse> {
  return apiFetch('/entitlements/current').then((r) => json<EntitlementsResponse>(r))
}

export function fetchSubscription(): Promise<SubscriptionResponse> {
  return apiFetch('/billing/subscription').then((r) => json<SubscriptionResponse>(r))
}

export function fetchInstallerDomain(): Promise<{ domain: string }> {
  return apiFetch('/entitlements/installer-domain').then((r) => json<{ domain: string }>(r))
}

export function setInstallerDomain(domain: string): Promise<{ domain: string }> {
  return apiFetch('/entitlements/installer-domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  }).then((r) => json<{ domain: string }>(r))
}

export function fetchJobs(): Promise<{ jobs: JobRecord[] }> {
  return apiFetch('/jobs').then((r) => json<{ jobs: JobRecord[] }>(r))
}

export function cancelJob(jobId: string): Promise<JobRecord> {
  return apiFetch(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }).then((r) => json<JobRecord>(r))
}

export function fetchRelease(bundleSlug: string): Promise<{ release: PackageRelease }> {
  return apiFetch(`/packages/bundles/${encodeURIComponent(bundleSlug)}/release`).then((r) =>
    json<{ release: PackageRelease }>(r),
  )
}

export function patchRelease(
  bundleSlug: string,
  body: Partial<Pick<PackageRelease, 'state' | 'version' | 'release_notes'>>,
): Promise<{ release: PackageRelease }> {
  return apiFetch(`/packages/bundles/${encodeURIComponent(bundleSlug)}/release`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json<{ release: PackageRelease }>(r))
}

export function fetchAuditEvents(limit = 100): Promise<{ audit_events: AuditEvent[] }> {
  return apiFetch(`/audit-events?limit=${limit}`).then((r) => json<{ audit_events: AuditEvent[] }>(r))
}

export type MachineDevice = {
  workspace_id: string
  machine_hash: string
  last_ip?: string
  first_seen: string
  last_seen: string
  revoked?: boolean
}

export function fetchMachines(): Promise<{ machines: MachineDevice[] }> {
  return apiFetch('/entitlements/machines').then((r) => json<{ machines: MachineDevice[] }>(r))
}

export function revokeMachine(machineHash: string): Promise<{ machine_hash: string; revoked: boolean }> {
  return apiFetch('/entitlements/machines/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_hash: machineHash }),
  }).then((r) => json<{ machine_hash: string; revoked: boolean }>(r))
}

export type ByokKeyStatus = {
  configured: boolean
  provider?: string | null
  endpoint?: string | null
  deployment?: string | null
  api_version?: string | null
}

export type SetByokKeyBody = {
  endpoint: string
  deployment: string
  api_version?: string
  api_key: string
}

export function fetchLlmKey(): Promise<ByokKeyStatus> {
  return apiFetch('/workspace/llm-key').then((r) => json<ByokKeyStatus>(r))
}

export function setLlmKey(body: SetByokKeyBody): Promise<ByokKeyStatus> {
  return apiFetch('/workspace/llm-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json<ByokKeyStatus>(r))
}

export function deleteLlmKey(): Promise<{ deleted: boolean }> {
  return apiFetch('/workspace/llm-key', { method: 'DELETE' }).then((r) => json<{ deleted: boolean }>(r))
}

export function cancelCompileCreditAddon(tier: string): Promise<{ cancelled: boolean; tier: string; subscription_id: string }> {
  return apiFetch('/subscriptions/addon/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  }).then((r) => json<{ cancelled: boolean; tier: string; subscription_id: string }>(r))
}
