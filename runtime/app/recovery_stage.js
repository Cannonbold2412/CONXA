"use strict";
/**
 * recovery_stage.js — per-skill escalation state for agent-mediated recovery,
 * where Tier 3 (semantic, browser-use-style grounding) and Tier 4 (vision,
 * CUA-style) fire as SEPARATE MCP round-trips instead of one combined payload.
 *
 * The runtime never calls Claude Desktop — it RESPONDS to execute_skill with a
 * recovery request, and the client resumes by calling execute_skill again. Two
 * separate calls therefore mean two distinct failure-response shapes in
 * sequence: the first agent round for a step is Tier 3 (text-only, ranked
 * indexed digest); any subsequent round for that step escalates to Tier 4
 * (screenshots added). Broad trigger, decided 2026-08-25: escalation happens
 * whether the Tier 3 override failed validation or validated and the step
 * still failed — vision adds information in both cases.
 *
 * Stagnation hard cap: browser-use detects frozen pages softly (PageFingerprint
 * nudge); we flip that to a HARD stop. If the page fingerprint is unchanged
 * across CONSECUTIVE recovery rounds — STAGNATION_LIMIT of them — further paid
 * rounds are refused and the step fails deterministically. The first identical
 * round is always allowed, which is precisely what lets the designed Tier 3 →
 * Tier 4 escalation fire on an unchanged page (vision adds information even
 * when the DOM hash matches); what stops is anything BEYOND that — repeating
 * the same signal set against a page that never moves.
 *
 * Keyed per `${workspace_id}:${slug}` like parks and the retry budget (RT-3):
 * sibling runs of other skills live under their own keys. The same shared-key
 * tradeoff as retry_budget.js applies (two concurrent runs of the SAME skill
 * share stage state) — deliberately not fixed for the same reason: the cap
 * must persist ACROSS calls or an agent could loop recovery forever by
 * starting fresh runs. Bounded growth: one small record per failed step.
 */

// Consecutive identical-fingerprint recovery rounds tolerated before
// escalation stops. 2 = first repeat allowed (the T3 → T4 escalation),
// second repeat refused.
const STAGNATION_LIMIT = 2;

const _stages = new Map(); // key -> { rounds: { [stepIndex]: { count, tier, fp, stagnantRun } } }

function getStageState(key) {
  let st = _stages.get(key);
  if (!st) {
    st = { rounds: {} };
    _stages.set(key, st);
  }
  return st;
}

/**
 * Record one agent-recovery round for a failed step and return its state:
 *   round     — 1-based count of agent rounds this step has had
 *   stagnant  — true when this round must NOT be sent (hard cap reached)
 *
 * `fp` is the current page fingerprint (recovery_park.capturePageFingerprint
 * shape: {url, interactiveCount, domHash}) captured at response-build time.
 * Stagnation counts CONSECUTIVE identical fingerprints across rounds regardless
 * of tier: the first repeat is allowed (that is the T3 → T4 information
 * escalation), the STAGNATION_LIMIT-th refuses to spend further tokens.
 */
function recordRound(key, stepIndex, tier, fp) {
  const st = getStageState(key);
  const r = st.rounds[stepIndex] || { count: 0, tier: 0, fp: null, stagnantRun: 0 };
  r.count += 1;

  const sameFingerprint =
    !!fp && !!r.fp && JSON.stringify(fp) === JSON.stringify(r.fp);
  if (sameFingerprint) {
    r.stagnantRun += 1;
  } else {
    r.stagnantRun = 0;
  }
  r.tier = tier;
  r.fp = fp || null;
  st.rounds[stepIndex] = r;

  return { round: r.count, stagnant: r.stagnantRun >= STAGNATION_LIMIT };
}

/**
 * Which tier THIS failure response should use for the failed step.
 *   • No prior agent round on this step and no failed override behind us → 3.
 *   • Any prior agent round on this step (the broad rule) → 4.
 *   • Clamped by the ceiling: CONXA_MAX_RECOVERY_TIER=3 keeps every round
 *     semantic (vision never fires); ceiling 2 never reaches here (handled by
 *     the deterministic Studio path in failure_response.js).
 */
function nextRecoveryTier({ key, failedStep, err, maxRecoveryTier }) {
  const st = _stages.get(key);
  const stepIndex = typeof (err && err.failedAt) === "number" ? err.failedAt : -1;
  const priorRound = st && stepIndex >= 0 ? st.rounds[stepIndex] : null;
  const overrideBehindUs = !!(err && err.overrideValidationFailed) ||
    !!(failedStep && failedStep._agent_override);
  const escalated = (priorRound && priorRound.count >= 1) || overrideBehindUs;
  // Ceiling clamp: CONXA_MAX_RECOVERY_TIER=3 keeps every round semantic
  // (vision never fires); 4 is the default. Ceiling 2 never reaches here.
  return Math.min(escalated ? 4 : 3, maxRecoveryTier >= 4 ? 4 : 3);
}

/**
 * Nomination map from the most recent Tier 3/4 digest built under this key:
 * { "<index>": { selector, score } }. Consumed by applyStepOverrides when the
 * agent replies with candidate_index; overwritten on every digest build and
 * cleared on run success (clearForSlug).
 */
function setCandidateMap(key, map) {
  getStageState(key).candidates = map && Object.keys(map).length ? map : null;
}

function getCandidateMap(key) {
  const st = _stages.get(key);
  return (st && st.candidates) || null;
}

// Same lifecycle as clearRetryBudget(slug): called on run success so a later
// failure starts from Tier 3 again instead of inheriting a stale escalation.
function clearForSlug(slug) {
  for (const key of [..._stages.keys()]) {
    if (key.endsWith(`:${slug}`)) _stages.delete(key);
  }
}

module.exports = {
  STAGNATION_LIMIT,
  nextRecoveryTier,
  recordRound,
  setCandidateMap,
  getCandidateMap,
  clearForSlug,
};
