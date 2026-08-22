"use strict";
/**
 * run_registry.js — the multi-run replacement for server.js's old single
 * `activeExecution` slot (RT-3). Runs are admitted up to a cap; each run is
 * tracked independently by its own runId so cancel/status can address one
 * run without touching its siblings.
 *
 * Extracted as its own module (same reason as recovery_park.js/failure_response.js):
 * server.js connects MCP stdio at import time, so nothing in it is unit-testable in
 * place.
 */

const MAX_CONCURRENT_RUNS = Number(process.env.CONXA_MAX_CONCURRENT_RUNS) || 5;

const _runs = new Map(); // runId -> exec

// Admits `exec` (must carry a unique `.runId`) if under the cap. Returns false — and admits
// nothing — when the cap is already reached, so the caller can refuse honestly instead of
// silently overwriting a sibling run.
function begin(exec) {
  if (_runs.size >= MAX_CONCURRENT_RUNS) return false;
  _runs.set(exec.runId, exec);
  return true;
}

function end(runId) {
  _runs.delete(runId);
}

function get(runId) {
  return _runs.get(runId) || null;
}

function count() {
  return _runs.size;
}

// Snapshot for get_execution_status and for the cap/cancel-ambiguity messages — plain data,
// not the live exec objects (those carry Playwright handles callers must never touch directly).
function list() {
  const now = Date.now();
  return [..._runs.values()].map((exec) => ({
    run_id: exec.runId,
    skill: exec.slug,
    workspace_id: exec.workspace_id,
    step: exec.step,
    total: exec.total,
    started_at: exec.startedAt,
    elapsed_ms: now - Date.parse(exec.startedAt),
    cancel_requested: !!exec.cancelRequested,
    // Non-empty while this run is blocked behind host_lock.js waiting for another run to finish
    // with the same external platform (RT-3 follow-up) — lets an agent see WHY a run is stalled
    // instead of just watching `step` stay at 0.
    waiting_for_host: (exec.waitingForHost && exec.waitingForHost.length) ? exec.waitingForHost : null,
  }));
}

// Flips the named run's cancel flag. Returns false if no such run is active — the caller (a
// stale run_id, or a run that already finished) gets a clear "no such run" rather than a
// silent no-op.
function requestCancel(runId) {
  const exec = _runs.get(runId);
  if (!exec) return false;
  exec.cancelRequested = true;
  return true;
}

module.exports = { MAX_CONCURRENT_RUNS, begin, end, get, list, count, requestCancel };
