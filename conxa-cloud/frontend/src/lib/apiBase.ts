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

/** Thrown by `json()`/`errorDetail()` on a non-ok response. `requestId` is set
 *  whenever the server's error body carried one — show it as a support
 *  reference alongside `message`. */
export class ApiError extends Error {
  requestId?: string
  constructor(message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.requestId = requestId
  }
}

function errorFromRaw(raw: string, fallback: string): ApiError {
  if (!raw) return new ApiError(fallback)
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown; request_id?: unknown }
    const requestId = typeof parsed.request_id === 'string' ? parsed.request_id : undefined
    // Prefer the human `message` the server now sends (app/api/errors.py). Older
    // deployed backends only ever sent `detail` — kept as a fallback until every
    // environment is past this change.
    // ponytail: remove the `detail` fallback once backend and frontend are both
    // deployed past this error-contract change (see docs/TRD.md's back-compat table).
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return new ApiError(parsed.message.trim(), requestId)
    }
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return new ApiError(parsed.detail.trim(), requestId)
    }
  } catch {
    // Non-JSON error bodies are common (e.g. plain "Internal Server Error").
  }
  return new ApiError(raw)
}

/** Read a (possibly-errored) response body and return a human-readable message. */
export async function errorDetail(response: Response): Promise<string> {
  const raw = (await response.text().catch(() => '')).trim()
  return errorFromRaw(raw, response.statusText || 'Request failed').message
}

/** Parse a JSON response, throwing an ApiError carrying the server's human message
 *  (and request id, if present) on failure. */
export async function json<T>(response: Response): Promise<T> {
  const raw = (await response.text()).trim()
  if (!response.ok) throw errorFromRaw(raw, response.statusText)
  return raw ? (JSON.parse(raw) as T) : ({} as T)
}

/** Safe message extraction for a query/mutation `error: unknown` — replaces the
 *  unchecked `(error as Error).message` cast that rendered `undefined` for any
 *  non-Error throw. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
