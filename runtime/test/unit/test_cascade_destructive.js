"use strict";
// PROD-3 (EXEC-24 P5) — a step.destructive === true step gets Layer 1 and nothing more.
// recoverStep itself is unchanged by PROD-3 (the halt has shipped since EXEC-24); this test
// exists because nothing exercised it before — the compiler never actually set `destructive`
// (see conxa_compile/compiler/destructive_semantics.py::classify_consequence), so the halt at
// cascade.js has never fired on a real pack.

const test = require("node:test");
const assert = require("node:assert");

const { recoverStep } = require("../../app/cascade");

function fakeTracker() {
  const events = [];
  return { events, emit(name, fields) { events.push({ name, fields }); } };
}

// primaryErr.verifyFail makes layer1Ladder's remedy resolve to "descend-layer2", which returns
// false immediately WITHOUT touching `page` at all (cascade.js:279) — so passing page=null lets
// any stage that actually dispatches against the page fail loudly (TypeError) instead of the
// test silently passing for the wrong reason.
const VERIFY_FAIL_ERR = { verifyFail: true };

test("destructive step halts after Layer 1 — never reaches L2 (page is never touched)", async () => {
  const step = { destructive: true, handler_hints: {} };
  const tracker = fakeTracker();
  const result = await recoverStep(null, step, {}, "test-slug", 0, "sel", tracker, VERIFY_FAIL_ERR, null, null, null);
  assert.strictEqual(result, false);
  assert.ok(tracker.events.some(e => e.name === "rec_halt" && e.fields.why === "destructive"),
    "expected a rec_halt/destructive telemetry event");
});

test("control: a NON-destructive step with the same primaryErr does reach L2 (proves the halt above is real, not incidental)", async () => {
  const step = { destructive: false, handler_hints: {} };
  const tracker = fakeTracker();
  // L2's recoverWithA11y (and everything after it) dispatches against `page` — with page=null
  // that must throw, proving control genuinely passed L1 and into L2 rather than returning early
  // for an unrelated reason.
  await assert.rejects(
    () => recoverStep(null, step, {}, "test-slug", 0, "sel", tracker, VERIFY_FAIL_ERR, null, null, null),
  );
});
