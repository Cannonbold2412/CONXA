const API_VERSION_PREFIX = '/api/v1'

/** Prefix a path with `/api/v1` unless it already targets an `/api/` route. */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return p.startsWith('/api/') ? p : `${API_VERSION_PREFIX}${p}`
}

/** Fetch a versioned API path, sending Clerk session cookies by default. */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(input), {
    ...init,
    credentials: init?.credentials ?? 'include',
  })
}

function detailFromRaw(raw: string, fallback: string): string {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown }
    const detail = parsed.detail ?? parsed.message
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
  } catch {
    // Non-JSON error bodies are common (e.g. plain "Internal Server Error").
  }
  return raw
}

/** Read a (possibly-errored) response body and return a human-readable message. */
export async function errorDetail(response: Response): Promise<string> {
  const raw = (await response.text().catch(() => '')).trim()
  return detailFromRaw(raw, response.statusText || 'Request failed')
}

/** Parse a JSON response, throwing an Error carrying the server detail on failure. */
export async function json<T>(response: Response): Promise<T> {
  const raw = (await response.text()).trim()
  if (!response.ok) throw new Error(detailFromRaw(raw, response.statusText))
  return raw ? (JSON.parse(raw) as T) : ({} as T)
}
