"use strict";
// Per-step retry budget (L0), extracted from run.js. Enforcement lives in
// server.js's execute loop; this module owns the attempt counting.
//
// ponytail: keyed by `${slug}:${stepIndex}` only, not by run — two concurrent runs of the SAME
// skill (RT-3) share one counter, so a sibling run's clearRetryBudget(slug) on success resets a
// still-failing sibling's attempt count, and a struggling sibling can burn a shared run's budget
// faster than solo. Deliberately not fixed: the budget exists to persist ACROSS calls (a fresh
// execute_skill call gets a new runId, so per-run keying would let an agent retry a broken step
// forever by always starting a new run) — keying it by run would silently remove that ceiling.
// Worst case today is a few extra retries for a sibling, not corruption. Upgrade path if this
// ever bites: key by `${runId}:${slug}:${stepIndex}` for the in-run attempts *and* keep a
// separate `${slug}:${stepIndex}` counter that only clears on cross-call resume, so same-skill
// siblings stop sharing attempts without losing the cross-call ceiling.
const { appendRecoveryEvent } = require("./recovery_log");

const RETRY_BUDGET_MAX = 3;

const retryBudget = new Map();

function checkRetryBudget(slug, stepIndex) {
  const key = `${slug}:${stepIndex}`;
  const attempts = (retryBudget.get(key) || 0) + 1;
  retryBudget.set(key, attempts);

  if (attempts <= RETRY_BUDGET_MAX) return true;

  appendRecoveryEvent({ event: "retry_budget_exhausted", slug, step_index: stepIndex });
  return false;
}

function clearRetryBudget(slug) {
  for (const key of retryBudget.keys()) {
    if (key.startsWith(`${slug}:`)) retryBudget.delete(key);
  }
}

module.exports = { RETRY_BUDGET_MAX, checkRetryBudget, clearRetryBudget };
