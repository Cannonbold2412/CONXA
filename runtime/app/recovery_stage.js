"use strict";
/**
 * recovery_stage.js — per-skill round state for agent-mediated recovery.
 *
 * The runtime never calls Claude Desktop — it RESPONDS to execute_skill with a
 * recovery request, and the client resumes by calling execute_skill again. Each
 * round is therefore one MCP round-trip, and every round for a failed step
 * carries the same fully-armed payload: the ranked indexed digest, the live
 * screenshots, and the recording-time reference when it is on disk.
 *
 * This replaced a two-shape escalation (round one text-only at "tier 3", vision
 * withheld for a later "tier 4" round). Splitting them was a token-cost lever,
 * and it inverted the priority: the first round is the likeliest to succeed, so
 * it is the round that should be best armed. Withholding the screenshots saved
 * tokens on attempts that worked and cost a whole wasted round-trip — the entire
 * digest re-sent — on the attempts that needed them most.
 *
 * Stagnation hard cap: browser-use detects frozen pages softly (PageFingerprint
 * nudge); we flip that to a HARD stop. If the page fingerprint is unchanged
 * across CONSECUTIVE recovery rounds — STAGNATION_LIMIT of them — further paid
 * rounds are refused and the step fails deterministically. The first identical
 * round is still allowed: round two is not a re-roll, it carries what round one
 * nominated and what that pick actually matched, so the agent iterates. What
 * stops is anything BEYOND that — repeating the same signal set against a page
 * that never moves.
 *
 * Keyed per `${workspace_id}:${slug}` like parks and the retry budget (RT-3):
 * sibling runs of other skills live under their own keys. The same shared-key
 * tradeoff as retry_budget.js applies (two concurrent runs of the SAME skill
 * share stage state) — deliberately not fixed for the same reason: the cap
 * must persist ACROSS calls or an agent could loop recovery forever by
 * starting fresh runs. Bounded growth: one small record per failed step.
 */

// Consecutive identical-fingerprint recovery rounds tolerated before recovery
// stops. 2 = the first repeat is allowed, the second is refused — so a failed
// step gets two agent rounds against an unchanged page and no more.
//
// The allowance used to be justified by the T3 → T4 escalation: a second round
// on an unchanged page was worth paying for because it added vision. Now that
// the first round is already armed, the justification is different but the
// number is the same — round two carries what round one tried and what its pick
// actually matched, so the agent iterates on a rejection rather than re-rolling
// the identical guess.
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
 *
 * Always 4 — the agent tier is armed from its first round. The old split (round
 * one text-only at tier 3, screenshots withheld for a later tier 4 round) was a
 * token-cost optimisation, and it cost more than it saved: the first round is
 * the one most likely to succeed, so it is the round that should carry the most
 * information. Withholding the pictures bought a cheaper first attempt at the
 * price of a wasted round-trip — the whole ranked digest re-sent — whenever that
 * attempt failed for want of them.
 *
 * Ceiling 3 and ceiling 4 are therefore identical now; a pack that set 3 to opt
 * out of image costs gets the armed payload like everything else. Ceiling 2 is
 * unchanged and never reaches here (handled by the deterministic Studio path in
 * failure_response.js).
 */
function nextRecoveryTier({ maxRecoveryTier }) {
  return maxRecoveryTier >= 3 ? 4 : maxRecoveryTier;
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
