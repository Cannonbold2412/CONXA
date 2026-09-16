"use strict";

// Unit tests for overlay_capture.js (BUILD-26 stage f) — the runtime's own writer for
// runs/{run_id}/_evidence/overlays.jsonl, the evidence a copilot branch-insertion proposal is
// built from. No DOM here (overlayProbe's descriptor logic runs inside a real Playwright page
// and is covered by the e2e overlay-dismiss fixtures) — this covers the pure-Node write path:
// directory creation on a run with no evidence.json (the passing-run case this module exists
// for), dedupe within a run, and the never-throws contract.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert");

const { overlaysPath, overlayId, recordOverlayObservation, readOverlayObservations } = require("../../app/overlay_capture");

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "conxa-overlay-capture-test-"));
}

function probe(signal = "#cookie-banner") {
  return {
    container: { tag: "div", role: "dialog", signal },
    controls: [{ tag: "button", role: "button", name: "Accept", text: "Accept", testid: "accept-btn" }],
  };
}

test("creates runs/{run_id}/_evidence/ itself — the case a passing run needs, since _writeStudioEvidence never runs", () => {
  const dataDir = tmpDataDir();
  const runId = "run_pass_1";
  assert.ok(!fs.existsSync(path.join(dataDir, "runs", runId, "_evidence")));
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 2, probe: probe(), dismissed: true });
  const file = overlaysPath(dataDir, runId);
  assert.ok(fs.existsSync(file));
  const records = readOverlayObservations(dataDir, runId);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].step_index, 2);
  assert.strictEqual(records[0].dismissed, true);
  assert.strictEqual(records[0].container.signal, "#cookie-banner");
});

test("dedupes within a run on the container signal — one popup blocking three steps writes once", () => {
  const dataDir = tmpDataDir();
  const runId = "run_dedupe_1";
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 1, probe: probe(), dismissed: false });
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 2, probe: probe(), dismissed: false });
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 3, probe: probe(), dismissed: true });
  const records = readOverlayObservations(dataDir, runId);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].step_index, 1, "first capture wins, later ones dedupe out");
});

test("a distinct overlay (different container signal) gets its own record", () => {
  const dataDir = tmpDataDir();
  const runId = "run_distinct_1";
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 0, probe: probe("#cookie-banner"), dismissed: true });
  recordOverlayObservation({ dataDir, runId, slug: "wf-1", stepIndex: 5, probe: probe("#newsletter-modal"), dismissed: true });
  const records = readOverlayObservations(dataDir, runId);
  assert.strictEqual(records.length, 2);
});

test("overlayId is stable for the same signal+run and differs across runs", () => {
  const a = overlayId("#cookie-banner", "run_1");
  const b = overlayId("#cookie-banner", "run_1");
  const c = overlayId("#cookie-banner", "run_2");
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test("never throws — missing dataDir/runId/probe are all silent no-ops", () => {
  assert.doesNotThrow(() => recordOverlayObservation({}));
  assert.doesNotThrow(() => recordOverlayObservation({ dataDir: tmpDataDir(), runId: "r1", probe: null }));
  assert.doesNotThrow(() => recordOverlayObservation({ dataDir: tmpDataDir(), probe: probe() })); // no runId
});

test("readOverlayObservations on a missing file returns [] rather than throwing", () => {
  const dataDir = tmpDataDir();
  assert.deepStrictEqual(readOverlayObservations(dataDir, "no-such-run"), []);
});
