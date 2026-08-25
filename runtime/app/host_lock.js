"use strict";
/**
 * host_lock.js — per-external-host mutual exclusion for concurrent runs (RT-3 follow-up).
 *
 * RT-3 gave every run its own browser context, download dir, recovery park, and retry budget —
 * the runtime never corrupts its own bookkeeping when two runs execute at once. But two runs that
 * both interact with the SAME external platform (e.g. one workflow's Render step and a different,
 * concurrently-running workflow's Render step) is a real risk at the PLATFORM's own application
 * layer, which the runtime has no control over: a lost update when both mutate the same resource,
 * one deploy cancelling another mid-flight, or bot/rate-limit detection tripped by two
 * near-simultaneous automated sessions on one account. This module serializes ONLY runs that
 * actually overlap on a host — two runs touching different platforms still execute fully in
 * parallel; that's the whole point of not just falling back to a global queue.
 *
 * Deliberately scoped to the browser-acquisition-through-step-execution phase, not the auth
 * pre-flight's session *validation* probe (a read-only navigation, not a mutation) — locking that
 * too would serialize even completely benign concurrent session checks for no safety benefit.
 */

const _holders = new Map(); // hostname -> { runId, slug }

// PROD-5: when the caller passes `locksDir`, acquisition is extended across
// processes via heartbeat-stamped lock files (file_lock.js) — so a scheduled run
// in the scheduler daemon's engine and a chat-driven run in a chat host's engine
// can never double-hit the same platform. Without `locksDir` behavior is exactly
// the original in-process-only contract (unit tests stay hermetic).
const fileLock = require("./file_lock");

// Atomic: either every host in `hosts` is free and all get claimed, or none are touched — so a
// group run needing two hosts can never end up holding one while blocked forever on the other.
function _tryAcquire(hosts, holder) {
  // Canonical (sorted) acquire order across every caller is what prevents deadlock when two runs
  // need the same two hosts in different orders — see the classic lock-ordering technique.
  const sorted = [...new Set(hosts)].sort();
  const blockedOn = sorted.find((h) => _holders.has(h));
  if (blockedOn) return { ok: false, host: blockedOn, blocker: _holders.get(blockedOn) };
  sorted.forEach((h) => _holders.set(h, holder));
  return {
    ok: true,
    release: () => sorted.forEach((h) => { if (_holders.get(h) === holder) _holders.delete(h); }),
  };
}

/**
 * Polls until every host in `hosts` is free (then claims them all) or `isDone()` says to give up.
 * `isDone` is expected to be the SAME cancel/deadline check already used as runPlan's cancelCheck
 * (server.js's `_execCancelled`) — reusing it means a run that gives up waiting on a host is
 * indistinguishable, to the caller's existing error handling, from one cancelled or deadline-out
 * mid-step, and its side effects (flipping exec.deadlineExceeded, logging) already happened.
 *
 * With `opts.locksDir` set, an in-process win must ALSO win the cross-process file-lock race for
 * the same hosts before the acquire resolves; losing that race releases the in-process claim and
 * reports the external blocker (blocker.runId carries the other process's holder key). A
 * filesystem failure degrades to in-process-only locking — fail open, matching this module's
 * existing philosophy.
 *
 * Resolves to `{ release }` on success, or `{ host, blocker }` (no `release`) on give-up — never
 * throws or rejects, so the caller decides how to surface a give-up.
 */
async function acquireHosts(hosts, holder, { isDone, pollMs = 250, locksDir } = {}) {
  const clean = (hosts || []).filter(Boolean);
  if (clean.length === 0) return { release: () => {} }; // nothing to lock — fail open, not closed
  const holderKey = holder && holder.runId !== undefined
    ? `${holder.runId}:${holder.slug || ""}`
    : String(holder && holder.slug ? holder.slug : holder);
  for (;;) {
    const attempt = _tryAcquire(clean, holder);
    if (attempt.ok) {
      if (!locksDir) return { release: attempt.release };
      let fl;
      try {
        fl = await fileLock.acquireFileLocks(clean, holderKey, { locksDir, isDone, pollMs });
      } catch (_) {
        return { release: attempt.release }; // disk unavailable — degrade to in-process-only
      }
      if (fl.ok) {
        return {
          release: () => {
            try { fl.release(); } finally { attempt.release(); } // both halves always torn down together
          },
        };
      }
      attempt.release(); // undo the local claim — another PROCESS holds the platform
      return {
        host: fl.host || "(external)",
        blocker: { runId: (fl.blocker && fl.blocker.holder) || "", external_pid: fl.blocker && fl.blocker.pid },
      };
    }
    if (isDone && isDone()) return { host: attempt.host, blocker: attempt.blocker };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// Snapshot for diagnostics/tests — which hosts are currently locked and by whom.
function activeHosts() {
  return [..._holders.entries()].map(([host, holder]) => ({ host, run_id: holder.runId, skill: holder.slug }));
}

module.exports = { acquireHosts, activeHosts };
