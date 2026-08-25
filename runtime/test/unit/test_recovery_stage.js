"use strict";
// Unit tests for recovery_stage.js — per-skill escalation state for the split
// Tier 3 (semantic) → Tier 4 (vision) recovery rounds, the stagnation hard cap,
// and the candidate_index nomination maps.
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

test("nextRecoveryTier: first round is 3, later rounds for the same step are 4", () => {
  const k = key();
  const errAt3 = { failedAt: 2 };
  const base = { key: k, err: errAt3, maxRecoveryTier: 4 };
  assert.strictEqual(nextRecoveryTier({ ...base, failedStep: null }), 3);
  recordRound(k, 2, 3, FP_A);
  assert.strictEqual(nextRecoveryTier({ ...base, failedStep: null }), 4, "prior round escalates");
});

test("nextRecoveryTier: a failed agent override behind us escalates immediately", () => {
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

test("nextRecoveryTier: ceiling 3 clamps vision off; other steps stay at 3", () => {
  const k = key();
  recordRound(k, 0, 3, FP_A); // step 0 already had its semantic round
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 0 }, failedStep: null, maxRecoveryTier: 3 }), 3);
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 5 }, failedStep: null, maxRecoveryTier: 3 }), 3);
  // Ceiling 4 does not leak the escalation to a DIFFERENT step:
  assert.strictEqual(nextRecoveryTier({ key: k, err: { failedAt: 5 }, failedStep: null, maxRecoveryTier: 4 }), 3);
});

test("recordRound: identical fingerprints count across tiers; the T3→T4 round stays allowed", () => {
  const k = key();
  let r = recordRound(k, 4, 3, FP_A);
  assert.deepStrictEqual(r, { round: 1, stagnant: false });
  r = recordRound(k, 4, 4, FP_A); // identical page, tier changed — designed escalation
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
