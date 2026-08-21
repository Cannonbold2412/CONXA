import { apiFetch, json } from '@/lib/apiBase'

export type RuntimeStatus = 'active' | 'stale' | 'revoked'

export type RuntimeRegistration = {
  company: string
  install_id: string
  platform: string
  runtime_version: string
  workspace_id: string
  hostname?: string
  username?: string
  os_release?: string
  os_arch?: string
  capabilities?: Record<string, string>
  first_seen: number
  last_seen: number
  stale: boolean
  revoked?: boolean
  status: RuntimeStatus
}

export type RuntimesResponse = {
  registrations: RuntimeRegistration[]
  stale_count: number
  version_distribution: Record<string, number>
  total: number
  limit: number
  offset: number
}

export function fetchRuntimeRegistrations(limit = 100, offset = 0): Promise<RuntimesResponse> {
  return apiFetch(`/telemetry/runtimes?limit=${limit}&offset=${offset}`).then((r) => json<RuntimesResponse>(r))
}

export function revokeRuntime(installId: string): Promise<{ install_id: string; revoked: boolean }> {
  return apiFetch('/telemetry/runtimes/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ install_id: installId }),
  }).then((r) => json<{ install_id: string; revoked: boolean }>(r))
}
