"use strict";
// Unit tests for recovery_stage.js — per-skill round state for agent-mediated
// recovery, the stagnation hard cap, and the candidate_index nomination maps.
//
// There is no longer a tier escalation to test: every agent round is armed from
// round one, so nextRecoveryTier depends only on the ceiling. What still matters
// is the round COUNT and the stagnation cap — two rounds against a page that
// never moves, then a deterministic stop.
const test   = require("node:test");
const assert = require("node:assert");

const {
  STAGNATION_LIMIT,
  nextRecoveryTier,
  recordRound,
  setCandidateMap,
  getCandidateMap,
  clearForSlug,
} = require("../../app/recovery_stage");

const FP_A = { url: "https://x/", interactiveCount: 10, domHash: "aaaa" };
const FP_B = { url: "https://x/", interactiveCount: 11, domHash: "bbbb" };

// Unique slugs per test — module state is keyed by `${workspace}:${slug}`.
let seq = 0;
function key() { return `ws-stage-${++seq}:stage-skill`; }

test("nextRecoveryTier: every round is armed — the first one too", () => {
  const k = key();
  const base = { key: k, err: { failedAt: 2 }, maxRecoveryTier: 4 };
  assert.strictEqual(nextRecoveryTier({ ...base, failedStep: null }), 4,
    "round one is armed — withholding screenshots starved the likeliest attempt");
  recordRound(k, 2, 4, FP_A);
  assert.strictEqual(nextRecoveryTier({ ...base, failedStep: null }), 4, "and stays armed");
});

test("nextRecoveryTier: a failed agent override still lands on the armed round", () => {
  const k = key();
  assert.strictEqual(
    nextRecoveryTier({
      key: k,
      err: { failedAt: 1, overrideValidationFailed: true },
      failedStep: { _agent_override: true },
      maxRecoveryTier: 4,
    }),
    4
  );
});

test("nextRecoveryTier: ceiling 3 and ceiling 4 are the same thing now", () => {
  // Ceiling 3 used to mean "reason, never spend image tokens". That opt-out is gone, so the two
  // ceilings are indistinguishable — a pack can no longer be armed for one round and starved the
  // next. Ceiling 2 still stops short of any agent handoff and is clamped, not promoted.
  const k = key();
  recordRound(k, 0, 4, FP_A);
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 0 }, failedStep: null, maxRecoveryTier: 3 }), 4);
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 5 }, failedStep: null, maxRecoveryTier: 4 }), 4);
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 5 }, failedStep: null, maxRecoveryTier: 2 }), 2,
    "the Studio ceiling is never promoted into an agent round");
});

test("recordRound: the second round against an identical page is still allowed", () => {
  const k = key();
  let r = recordRound(k, 4, 3, FP_A);
  assert.deepStrictEqual(r, { round: 1, stagnant: false });
  r = recordRound(k, 4, 4, FP_A); // identical page; round two carries the rejection feedback
  assert.strictEqual(r.stagnant, false);
  r = recordRound(k, 4, 4, FP_A); // second identical-fingerprint round — hard cap
  assert.strictEqual(r.stagnant, true);
});

test("recordRound: a page change resets the stagnation run", () => {
  const k = key();
  recordRound(k, 1, 3, FP_A);
  recordRound(k, 1, 4, FP_A);
  const r = recordRound(k, 1, 4, FP_B);
  assert.strictEqual(r.stagnant, false, "the page moved — recovery may continue");
});

test(`recordRound: cap fires exactly after ${STAGNATION_LIMIT} identical-fingerprint rounds`, () => {
  const k = key();
  const r1 = recordRound(k, 9, 3, FP_A);
  const r2 = recordRound(k, 9, 3, FP_A);
  const r3 = recordRound(k, 9, 3, FP_A);
  assert.strictEqual(r1.stagnant, false);
  assert.strictEqual(r2.stagnant, false, "first identical repeat is tolerated");
  assert.strictEqual(r3.stagnant, true, "second identical repeat is refused");
});

test("candidate map: round-trips per stage key and clears by slug", () => {
  const k = key();
  assert.strictEqual(getCandidateMap(k), null);
  setCandidateMap(k, { "0": { selector: '[data-testid="x"]', score: 150 } });
  assert.strictEqual(getCandidateMap(k)["0"].selector, '[data-testid="x"]');
  setCandidateMap(k, {}); // empty map → stored as null
  assert.strictEqual(getCandidateMap(k), null);

  const k2 = key(); // same slug prefix "stage-skill"
  setCandidateMap(k2, { "1": { selector: "#y", score: 10 } });
  clearForSlug("stage-skill");
  assert.strictEqual(getCandidateMap(k2), null, "clearForSlug wipes every workspace key for the slug");
});
