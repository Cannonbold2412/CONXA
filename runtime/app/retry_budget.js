"use strict";
// Per-step retry budget (L0), extracted from run.js. Enforcement lives in
// server.js's execute loop; this module owns the attempt counting.
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
