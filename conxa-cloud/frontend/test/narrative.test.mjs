// Plain node:test for the dashboard's plain-language layer (src/dashboard/narrative.ts).
// Run with:
//   node --experimental-strip-types --test test/narrative.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import {
  failureLabel,
  healingAnswer,
  kpiMeaning,
  overviewSentence,
  runTitle,
  versionAnswer,
  workflowStatus,
} from "../src/dashboard/narrative.ts";

test("failureLabel maps runtime codes and never hides unknown ones", () => {
  assert.equal(failureLabel("selector_missing"), "Could not find a button or field");
  assert.equal(failureLabel(null), "Unknown reason");
  assert.equal(failureLabel("unknown"), "Unknown reason");
  assert.equal(failureLabel("review_resume_refused"), "Review resume refused");
});

test("workflowStatus: failing beats slipping, a new workflow is not slipping", () => {
  assert.equal(workflowStatus({ success_rate: 72, success_rate_delta: 5 }), "failing");
  assert.equal(workflowStatus({ success_rate: 94, success_rate_delta: -3 }), "slipping");
  assert.equal(workflowStatus({ success_rate: 94, success_rate_delta: -2.9 }), "healthy");
  assert.equal(workflowStatus({ success_rate: 99, success_rate_delta: null }), "healthy");
});

test("kpiMeaning reads direction per metric", () => {
  assert.equal(kpiMeaning({ key: "failed_executions", delta: -4, delta_pct: -20 }), "fewer failures");
  assert.equal(kpiMeaning({ key: "average_execution_time", delta: 3, delta_pct: 5 }), "slower");
  assert.equal(kpiMeaning({ key: "executions", delta: 3, delta_pct: null }), "no earlier data");
});

test("sentences fall back gracefully on empty data", () => {
  assert.deepEqual(overviewSentence(0, 0, { entered_recovery: 0, healed: 0 }), ["No runs in this period yet."]);
  assert.equal(healingAnswer({ entered_recovery: 0, healed: 0, heal_rate: 0 }), "Nothing needed repairing in this period.");
  assert.equal(versionAnswer([]), null);
});

test("overview and version sentences carry the real numbers", () => {
  const phrase = overviewSentence(1284, 96.2, { entered_recovery: 43, healed: 41 });
  assert.equal(phrase.map((p) => (typeof p === "string" ? p : p.strong)).join(""),
    "1,284 runs. 96.2% finished on their own, and 41 of 43 breakages repaired themselves before anyone had to step in.");
  const versions = [
    { version: "1.4", runs: 34, success_rate: 64.7, recovery_rate: 0, last_seen: 2, first_seen: 1 },
    { version: "1.3", runs: 13, success_rate: 92.3, recovery_rate: 0, last_seen: 1, first_seen: 0 },
  ];
  assert.equal(versionAnswer(versions), "It hurt — success fell from 92.3% to 64.7%.");
});

test("runTitle names the failed step (1-based)", () => {
  const run = {
    run_id: "8f2c1a77-aaaa",
    summary: { status: "fail" },
    steps: [{ index: 5, label: "Click Approve", status: "failed", tiers: [] }],
  };
  assert.equal(runTitle(run), "Run 8f2c1a77 stopped at step 6");
});
