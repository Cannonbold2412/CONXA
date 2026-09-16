"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { waitForSettle, sameShape, TEXT_LEN_TOLERANCE } = require("../../app/settle");
const { EVAL_TIMED_OUT } = require("../../app/page_eval");

// Mock page whose .evaluate() returns a scripted sequence of settle signatures, one per call
// (repeats the last entry once exhausted) — mirrors test_verify.js's mockStatePage pattern.
function mockSignaturePage(signatures) {
  let calls = 0;
  return {
    evaluate: async () => {
      const sig = signatures[Math.min(calls, signatures.length - 1)];
      calls++;
      return sig;
    },
    _calls: () => calls,
  };
}

const STABLE = { textLen: 100, interactiveCount: 5, nodeCount: 200, busyCount: 0 };
const CHURNING = { textLen: 100, interactiveCount: 5, nodeCount: 400, busyCount: 0 };
const BUSY = { textLen: 100, interactiveCount: 5, nodeCount: 200, busyCount: 1 };

test("sameShape matches identical stable signatures", () => {
  assert.strictEqual(sameShape(STABLE, { ...STABLE }), true);
});

test("sameShape tolerates small text-length drift within TEXT_LEN_TOLERANCE", () => {
  const a = { ...STABLE, textLen: 100 };
  const b = { ...STABLE, textLen: 100 + TEXT_LEN_TOLERANCE };
  assert.strictEqual(sameShape(a, b), true);
});

test("sameShape rejects text-length drift beyond TEXT_LEN_TOLERANCE", () => {
  const a = { ...STABLE, textLen: 100 };
  const b = { ...STABLE, textLen: 100 + TEXT_LEN_TOLERANCE + 1 };
  assert.strictEqual(sameShape(a, b), false);
});

test("sameShape rejects when either sample shows a busy indicator", () => {
  assert.strictEqual(sameShape(STABLE, BUSY), false);
  assert.strictEqual(sameShape(BUSY, STABLE), false);
});

test("an already-stable page settles after one poll interval (small waitedMs)", async () => {
  const page = mockSignaturePage([STABLE, STABLE, STABLE]);
  const r = await waitForSettle(page, { budgetMs: 5000, pollMs: 30 });
  assert.strictEqual(r.settled, true);
  assert.strictEqual(r.reason, "stable");
  // Two samples needed to prove stability — roughly one poll interval, not the full budget.
  assert.ok(r.waitedMs < 500, `expected a fast settle, got ${r.waitedMs}ms`);
});

test("a churning page settles once it stops changing", async () => {
  // First two samples differ (still churning), third and fourth match (settled).
  const page = mockSignaturePage([CHURNING, { ...CHURNING, nodeCount: 401 }, STABLE, STABLE]);
  const r = await waitForSettle(page, { budgetMs: 5000, pollMs: 20 });
  assert.strictEqual(r.settled, true);
  assert.strictEqual(r.reason, "stable");
});

test("a busy indicator blocks settling even when the counters stop moving", async () => {
  const page = mockSignaturePage([BUSY, BUSY, BUSY, BUSY, BUSY]);
  const started = Date.now();
  const r = await waitForSettle(page, { budgetMs: 150, pollMs: 20 });
  assert.strictEqual(r.settled, false);
  assert.strictEqual(r.reason, "budget_exceeded");
  assert.ok(Date.now() - started < 1000, "must never exceed budget by more than slack");
});

test("never exceeds the budget on a page that keeps churning forever", async () => {
  let n = 0;
  const page = {
    evaluate: async () => ({ ...CHURNING, nodeCount: 400 + (n++) }), // always different
  };
  const started = Date.now();
  const r = await waitForSettle(page, { budgetMs: 200, pollMs: 25 });
  assert.strictEqual(r.settled, false);
  assert.strictEqual(r.reason, "budget_exceeded");
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `must respect the budget, took ${elapsed}ms`);
});

test("gives up cleanly when the page is unresponsive (evalOn times out)", async () => {
  const page = { evaluate: () => new Promise(() => {}) }; // never resolves
  const started = Date.now();
  const r = await waitForSettle(page, { budgetMs: 5000, pollMs: 60 });
  assert.strictEqual(r.settled, false);
  assert.strictEqual(r.reason, "eval_timed_out");
  // Bounded by the per-poll deadline (pollMs), not the full 5000ms budget.
  assert.ok(Date.now() - started < 1000, "must not wait out the full budget on a hung page");
});

test("never throws when page.evaluate itself rejects", async () => {
  const page = { evaluate: async () => { throw new Error("detached"); } };
  const r = await waitForSettle(page, { budgetMs: 500, pollMs: 30 });
  assert.strictEqual(r.settled, false);
  assert.strictEqual(r.reason, "eval_error");
});
