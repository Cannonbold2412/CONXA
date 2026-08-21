import { create } from 'zustand'
import { cmd, type BackendEvent } from '@/lib/ipc'
import { errorMessage } from '@/api/workflowApi'

export type StepState = 'pending' | 'running' | 'done' | 'error'

export interface CompileStep {
  id: string
  label: string
  state: StepState
  startedAt?: number
  endedAt?: number
}

export interface LogEntry {
  ts: number
  message: string
  level: string
}

export interface ApiCallEntry {
  task: string
  kind: string
  duration_ms: number
  status: string
}

export interface CompileResult {
  skill_id: string
  version: number
  step_count: number
  compile_status: 'ok' | 'review_needed' | 'failed' | null
  compile_min_confidence: number | null
  compile_steps_with_warnings: number | null
}

export const PIPELINE_STEPS: Omit<CompileStep, 'state'>[] = [
  { id: 'normalize', label: 'Normalize events' },
  { id: 'dedupe', label: 'Deduplicate actions' },
  { id: 'enrich', label: 'Enrich with DOM snapshots' },
  { id: 'selectors', label: 'Generate selectors' },
  { id: 'assertions', label: 'Build assertions' },
  { id: 'recovery', label: 'Build recovery blocks' },
  { id: 'package', label: 'Package skill' },
]

export type CompileRun = {
  /** `${workflowId}:${sessionId}:${mode}` — identifies one compile attempt. */
  key: string
  workflowId: string
  sessionId: string
  mode: 'compile' | 'recompile'
  steps: CompileStep[]
  status: 'running' | 'done' | 'error'
  skillId: string | null
  error: string | null
  logs: LogEntry[]
  apiCalls: ApiCallEntry[]
  startedAt: number
}

export type StartOutcome = 'started' | 'attached' | 'busy'

type CompileState = {
  run: CompileRun | null
  start: (args: { workflowId: string; sessionId: string; mode: 'compile' | 'recompile' }) => StartOutcome
  clear: () => void
  applyEvent: (ev: BackendEvent) => void
}

/**
 * The one in-flight compile, held outside the React tree.
 *
 * The Python backend already runs each command on its own thread, so a compile
 * survives the user navigating away — but until this store existed the progress
 * lived in CompileProgress's local state and died with the component. Worse,
 * remounting that page re-fired `cmd('compile')`, starting a *second* compile on
 * the same recording and reserving a *second* compile credit. `start()` is
 * idempotent on `key`, so returning to the page re-attaches to the live run
 * instead of paying for it twice.
 *
 * Only one run at a time: `window.conxa.cmd` never exposes the backend request
 * id, so streamed events carry nothing the renderer could correlate against a
 * specific run. Rather than plumb an id through main + preload, a second,
 * different compile is refused ('busy') while one is in flight.
 */
export const useCompileStore = create<CompileState>((set, get) => ({
  run: null,

  start: ({ workflowId, sessionId, mode }) => {
    const key = `${workflowId}:${sessionId}:${mode}`
    const existing = get().run

    if (existing?.key === key) return 'attached'
    if (existing?.status === 'running') return 'busy'

    const now = Date.now()
    set({
      run: {
        key,
        workflowId,
        sessionId,
        mode,
        steps: PIPELINE_STEPS.map((s, i) => ({
          ...s,
          state: i === 0 ? 'running' : 'pending',
          startedAt: i === 0 ? now : undefined,
        })),
        status: 'running',
        skillId: null,
        error: null,
        logs: [],
        apiCalls: [],
        startedAt: now,
      },
    })

    // Owned by the store, not by a component — resolution no longer depends on
    // anything staying mounted.
    cmd<CompileResult>('compile', { workflow_id: workflowId, session_id: sessionId, mode })
      .then((result) => {
        set((s) =>
          s.run?.key !== key
            ? s
            : {
                run: {
                  ...s.run,
                  status: 'done',
                  skillId: result.skill_id,
                  steps: s.run.steps.map((step) => ({
                    ...step,
                    state: 'done' as StepState,
                    endedAt: step.endedAt ?? Date.now(),
                  })),
                },
              },
        )
      })
      .catch((e) => {
        set((s) =>
          s.run?.key !== key
            ? s
            : {
                run: {
                  ...s.run,
                  status: 'error',
                  error: errorMessage(e, 'Compile failed.'),
                  steps: s.run.steps.map((step) =>
                    step.state === 'running' ? { ...step, state: 'error' as StepState, endedAt: Date.now() } : step,
                  ),
                },
              },
        )
      })

    return 'started'
  },

  clear: () => set({ run: null }),

  applyEvent: (ev) => {
    const run = get().run
    if (!run || run.status !== 'running') return
    const now = Date.now()

    if (ev.phase === 'compile_log') {
      set({
        run: {
          ...run,
          logs: [
            ...run.logs,
            { ts: (ev.ts as number) ?? now / 1000, message: String(ev.message ?? ''), level: String(ev.level ?? 'info') },
          ],
        },
      })
      return
    }

    if (ev.phase === 'api_call') {
      set({
        run: {
          ...run,
          apiCalls: [
            ...run.apiCalls,
            {
              task: String(ev.task ?? ''),
              kind: String(ev.kind ?? 'text'),
              duration_ms: Number(ev.duration_ms ?? 0),
              status: String(ev.status ?? 'ok'),
            },
          ],
        },
      })
      return
    }

    if (ev.phase === 'pipeline_done') {
      set({
        run: {
          ...run,
          steps: run.steps.map((s, i) => {
            if (i <= 2) return { ...s, state: 'done', endedAt: now }
            if (s.id === 'selectors') return { ...s, state: 'running', startedAt: now }
            return s
          }),
        },
      })
      return
    }

    if (ev.phase === 'compiler_start') {
      set({
        run: {
          ...run,
          steps: run.steps.map((s) =>
            s.id === 'selectors' && s.state !== 'done' ? { ...s, state: 'running', startedAt: s.startedAt ?? now } : s,
          ),
        },
      })
      return
    }

    if (ev.phase === 'compile_step') {
      const { step, status } = ev as unknown as { step: string; status: string }
      const idx = run.steps.findIndex((s) => s.id === step)
      if (idx === -1) return
      set({
        run: {
          ...run,
          steps: run.steps.map((s, i) => {
            if (i === idx) {
              return {
                ...s,
                state: status as StepState,
                startedAt: status === 'running' ? (s.startedAt ?? now) : s.startedAt,
                endedAt: status === 'done' || status === 'error' ? now : s.endedAt,
              }
            }
            if (i === idx + 1 && status === 'done') return { ...s, state: 'running', startedAt: now }
            return s
          }),
        },
      })
      return
    }

    if (ev.phase === 'compile_done') {
      set({ run: { ...run, status: 'done', skillId: (ev.skill_id as string | null) ?? run.skillId } })
      return
    }

    if (ev.phase === 'compile_error') {
      const failedStep = String(ev.failed_step ?? '')
      set({
        run: {
          ...run,
          status: 'error',
          error: String(ev.message ?? 'Compile failed'),
          steps: run.steps.map((s) =>
            s.state === 'running' || s.id === failedStep ? { ...s, state: 'error', endedAt: now } : s,
          ),
        },
      })
    }
  },
}))

/** True while any compile is in flight — used to keep a second one from being
 * started from the group page, since only one run can be tracked at a time. */
export function useCompileBusy() {
  return useCompileStore((s) => s.run?.status === 'running')
}
