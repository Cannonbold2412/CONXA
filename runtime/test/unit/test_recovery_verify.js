"use strict";

// Proves the "recovered but unverified must still fail" gap (run.js recoverWithSelector) is
// closed, and that a verify-fail (classified VERIFY_FAIL -> "descend-layer2") skips the L1
// single-remedy retry instead of wastefully re-running the same action against unchanged DOM.

const test = require("node:test");
const assert = require("node:assert");

const { recoverWithSelector, recoverStep, layer1Ladder } = require("../../app/run");

// A page whose selector_present check NEVER becomes satisfied — simulates an action that
// re-runs "successfully" (no throw) without the intended result ever actually landing.
function mockNeverPassingPage() {
  return {
    url: () => "https://x.test/start",
    locator: (_sel) => ({
      first: () => ({
        waitFor: async () => { throw new Error("not attached"); },
        scrollIntoViewIfNeeded: async () => {},
      }),
      count: async () => 0,
    }),
    waitForTimeout: async () => {},
    keyboard: { press: async () => {} },
  };
}

function mockAlwaysPassingPage() {
  return {
    url: () => "https://x.test/done",
    locator: (_sel) => ({
      first: () => ({ waitFor: async () => {} }),
      count: async () => 1,
    }),
    waitForTimeout: async () => {},
  };
}

const REQUIRED_STEP = {
  type: "wait", // trivial handler (page.waitForTimeout only) — isolates the verify gate itself
  ms: 1,
  validation: { assertions: [
    { type: "selector_present", target: ".confirmation-banner", required: true, timeout_ms: 20 },
  ] },
};

const ADVISORY_STEP = {
  type: "wait",
  ms: 1,
  validation: { assertions: [
    { type: "selector_present", target: ".confirmation-banner", required: false, timeout_ms: 20 },
  ] },
};

test("recoverWithSelector fails when the action re-runs but the post-condition never re-holds", async () => {
  const page = mockNeverPassingPage();
  const ok = await recoverWithSelector(page, REQUIRED_STEP, {}, "#irrelevant", () => {});
  assert.strictEqual(ok, false);
});

test("recoverWithSelector succeeds when the action re-runs and the post-condition re-holds", async () => {
  const page = mockAlwaysPassingPage();
  let onSuccessCalled = false;
  const ok = await recoverWithSelector(page, REQUIRED_STEP, {}, "#irrelevant", () => { onSuccessCalled = true; });
  assert.strictEqual(ok, true);
  assert.strictEqual(onSuccessCalled, true);
});

test("recoverWithSelector is unaffected by advisory (non-required) assertions", async () => {
  // Same never-passing page/assertion, but required:false — the step has no ENFORCED
  // post-condition, so a successful action re-run is recovery-successful regardless.
  const page = mockNeverPassingPage();
  const ok = await recoverWithSelector(page, ADVISORY_STEP, {}, "#irrelevant", () => {});
  assert.strictEqual(ok, true);
});

test("layer1Ladder short-circuits a verify-fail without retrying the action", async () => {
  const page = mockNeverPassingPage();
  let waited = false;
  page.waitForTimeout = async () => { waited = true; };
  const primaryErr = Object.assign(new Error("Verification failed: selector_present"), { verifyFail: true });
  const result = await layer1Ladder(page, REQUIRED_STEP, {}, "slug", 0, "#confirmation-banner", primaryErr);
  assert.strictEqual(result, false);
  // No L1 remedy applies to a verify-fail (retrying the same action against the same,
  // already-checked DOM can't fix it) — the action must never be re-run here.
  assert.strictEqual(waited, false);
});

test("recoverStep reports total failure end-to-end when the post-condition never re-holds", async () => {
  const page = mockNeverPassingPage();
  const tracker = { emit: () => {} };
  const primaryErr = new Error("some transient exception"); // unknown class -> retry-cascade
  const result = await recoverStep(page, REQUIRED_STEP, {}, "slug", 0, "#confirmation-banner", tracker, primaryErr, null);
  assert.strictEqual(result, false);
});

test("recoverStep reports success when the post-condition is re-established", async () => {
  const page = mockAlwaysPassingPage();
  const tracker = { emit: () => {} };
  const primaryErr = new Error("some transient exception");
  const result = await recoverStep(page, REQUIRED_STEP, {}, "slug", 0, "#confirmation-banner", tracker, primaryErr, null);
  assert.notStrictEqual(result, false);
});
