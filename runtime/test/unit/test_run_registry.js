"use strict";

// RT-3: run_registry.js replaces the old single `activeExecution` slot in server.js with a
// multi-run registry admitted up to a cap. Set before require — MAX_CONCURRENT_RUNS is read once
// at module load, same pattern as other env-tunable constants in this codebase (see run_config.js).
process.env.CONXA_MAX_CONCURRENT_RUNS = "3";

const test = require("node:test");
const assert = require("node:assert");

const runRegistry = require("../../app/run_registry");

function makeExec(runId, overrides = {}) {
  return Object.assign({
    runId,
    slug: `skill-${runId}`,
    workspace_id: "ws1",
    step: 0,
    total: 5,
    startedAt: new Date().toISOString(),
    cancelRequested: false,
    deadlineExceeded: false,
  }, overrides);
}

test("MAX_CONCURRENT_RUNS reflects the env override", () => {
  assert.strictEqual(runRegistry.MAX_CONCURRENT_RUNS, 3);
});

test("admits runs up to the cap and refuses honestly past it", () => {
  assert.strictEqual(runRegistry.begin(makeExec("r1")), true);
  assert.strictEqual(runRegistry.begin(makeExec("r2")), true);
  assert.strictEqual(runRegistry.begin(makeExec("r3")), true);
  assert.strictEqual(runRegistry.count(), 3);

  // Past the cap: refused, and nothing about the existing 3 runs changes.
  assert.strictEqual(runRegistry.begin(makeExec("r4")), false);
  assert.strictEqual(runRegistry.count(), 3);
  assert.strictEqual(runRegistry.get("r4"), null);

  // Ending one frees a slot for the next caller.
  runRegistry.end("r2");
  assert.strictEqual(runRegistry.count(), 2);
  assert.strictEqual(runRegistry.begin(makeExec("r4")), true);
  assert.strictEqual(runRegistry.count(), 3);

  ["r1", "r3", "r4"].forEach((id) => runRegistry.end(id));
  assert.strictEqual(runRegistry.count(), 0);
});

test("list() reports every active run without exposing live Playwright handles", () => {
  runRegistry.begin(makeExec("la", { slug: "skill-a", workspace_id: "wsA", step: 2, total: 10 }));
  runRegistry.begin(makeExec("lb", { slug: "skill-b", workspace_id: "wsB", step: 0, total: 4, cancelRequested: true }));

  const rows = runRegistry.list();
  assert.strictEqual(rows.length, 2);
  const a = rows.find((r) => r.run_id === "la");
  const b = rows.find((r) => r.run_id === "lb");
  assert.strictEqual(a.skill, "skill-a");
  assert.strictEqual(a.workspace_id, "wsA");
  assert.strictEqual(a.step, 2);
  assert.strictEqual(a.total, 10);
  assert.strictEqual(a.cancel_requested, false);
  assert.ok(a.elapsed_ms >= 0);
  assert.strictEqual(b.cancel_requested, true);
  // No page/context/browser handles leak into the snapshot — this is what both
  // get_execution_status and the cancel-ambiguity message render straight to the agent.
  assert.strictEqual(Object.prototype.hasOwnProperty.call(a, "page"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(a, "browser"), false);

  ["la", "lb"].forEach((id) => runRegistry.end(id));
});

test("requestCancel flips only the named run's flag — siblings are untouched", () => {
  const a = makeExec("ca");
  const b = makeExec("cb");
  runRegistry.begin(a);
  runRegistry.begin(b);

  assert.strictEqual(runRegistry.requestCancel("ca"), true);
  assert.strictEqual(a.cancelRequested, true);
  assert.strictEqual(b.cancelRequested, false);

  // Unknown run_id (already finished, or never existed) is reported, not silently accepted.
  assert.strictEqual(runRegistry.requestCancel("does-not-exist"), false);

  ["ca", "cb"].forEach((id) => runRegistry.end(id));
});

test("end() on an unknown runId is a harmless no-op", () => {
  assert.strictEqual(runRegistry.count(), 0);
  runRegistry.end("never-existed");
  assert.strictEqual(runRegistry.count(), 0);
});

// ─── recovery_park.js: parks keyed per skill, not a single process-wide slot ────────────────
const {
  parkKey,
  getParked,
  setParked,
  discardPark,
} = require("../../app/recovery_park");

function fakeParkedPage() {
  let closed = false;
  return {
    isClosed: () => closed,
    close: async () => { closed = true; },
  };
}

test("two skills' parks coexist — discarding one leaves the other intact", async () => {
  const keyA = parkKey("wsX", "skill-a");
  const keyB = parkKey("wsX", "skill-b");
  assert.notStrictEqual(keyA, keyB);

  const pageA = fakeParkedPage();
  const pageB = fakeParkedPage();
  setParked(keyA, { slug: "skill-a", workspace_id: "wsX", page: pageA, watch: false, timer: setTimeout(() => {}, 100000) });
  setParked(keyB, { slug: "skill-b", workspace_id: "wsX", page: pageB, watch: false, timer: setTimeout(() => {}, 100000) });

  assert.ok(getParked(keyA));
  assert.ok(getParked(keyB));

  await discardPark(keyA, "test");

  assert.strictEqual(getParked(keyA), null);
  assert.ok(pageA.isClosed());
  // Run B's park must survive run A's discard untouched (RT-3's core fix).
  assert.ok(getParked(keyB));
  assert.strictEqual(pageB.isClosed(), false);

  await discardPark(keyB, "test");
  assert.strictEqual(getParked(keyB), null);
});

test("getParked on a key with no park returns null, not throw", () => {
  assert.strictEqual(getParked(parkKey("nope", "nope")), null);
});
