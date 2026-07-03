import { apiFetch, errorDetail } from '@/lib/apiBase'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type JobRecord = {
  job_id: string
  kind: string
  status: JobStatus
  resource_id?: string | null
  retry_count: number
  user_error?: string | null
  internal_error_code?: string | null
  result?: Record<string, unknown> | null
  created_at: number
  updated_at: number
}

export type EnqueuedJob = Pick<JobRecord, 'job_id' | 'status' | 'resource_id'>

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch a job endpoint with a 15s timeout and one retry on 401 (the Clerk proxy
 * occasionally races the session cookie on first paint). Returns parsed JSON.
 */
async function jobRequest<T>(endpoint: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = init?.signal ? null : new AbortController()
    const timer = controller
      ? setTimeout(() => controller.abort(new DOMException('job_request_timeout', 'TimeoutError')), 15000)
      : null
    let response: Response
    try {
      response = await apiFetch(endpoint, { ...init, signal: init?.signal ?? controller?.signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error(
          `Timed out calling ${endpoint}. Check the frontend API proxy and backend server.`,
          { cause: err },
        )
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (response.status === 401 && attempt < 2) {
      await response.text().catch(() => '')
      await delay(350 + attempt * 650)
      continue
    }
    if (!response.ok) throw new Error(await errorDetail(response))
    const raw = (await response.text()).trim()
    return (raw ? JSON.parse(raw) : {}) as T
  }
  throw new Error('Request was not sent.')
}

export function fetchJob(jobId: string): Promise<JobRecord> {
  return jobRequest<JobRecord>(`/jobs/${encodeURIComponent(jobId)}`)
}

export function enqueueCompileJob(sessionId: string, skillTitle?: string): Promise<EnqueuedJob> {
  return jobRequest<EnqueuedJob>('/jobs/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, skill_title: skillTitle ?? '' }),
  })
}
