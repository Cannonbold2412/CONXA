"use strict";

// EXEC-11: two downloads in one run that suggest the same filename must land on two distinct
// paths, not overwrite each other. EXEC-12: a failed run must not leave its retry-budget
// counters behind, or the next run of the same skill in the same process starts exhausted and
// self-healing never engages.

const test = require("node:test");
const assert = require("node:assert");

const { uniqueDownloadName, checkRetryBudget, runPlan } = require("../run");

test("uniqueDownloadName: first claim keeps the suggested name", () => {
  const taken = new Set();
  assert.strictEqual(uniqueDownloadName("report.pdf", taken), "report.pdf");
});

test("uniqueDownloadName: collisions get distinct suffixed names", () => {
  const taken = new Set();
  const names = ["invoice.pdf", "invoice.pdf", "invoice.pdf"].map(n => uniqueDownloadName(n, taken));
  assert.deepStrictEqual(names, ["invoice.pdf", "invoice (2).pdf", "invoice (3).pdf"]);
  assert.strictEqual(new Set(names).size, 3);
});

test("uniqueDownloadName: suffix goes before the extension, dotless names still work", () => {
  const taken = new Set();
  uniqueDownloadName("export.csv", taken);
  assert.strictEqual(uniqueDownloadName("export.csv", taken), "export (2).csv");
  uniqueDownloadName("LICENSE", taken);
  assert.strictEqual(uniqueDownloadName("LICENSE", taken), "LICENSE (2)");
});

test("uniqueDownloadName: a real suggested name colliding with a generated one still resolves", () => {
  const taken = new Set();
  uniqueDownloadName("report.pdf", taken);
  assert.strictEqual(uniqueDownloadName("report.pdf", taken), "report (2).pdf");
  // The site itself suggests "report (2).pdf" — must not collide with the one we generated.
  assert.strictEqual(uniqueDownloadName("report (2).pdf", taken), "report (2) (2).pdf");
});

// runPlan only needs a page that can settle; with no steps it does nothing else. It now also
// creates a tab registry (tabs.js) at run start, which needs page.context() — a real Playwright
// Page always has one; this fixture stubs the minimal shape createTabRegistry reads (on()).
const idleContext = { on: () => {} };
const idlePage = { waitForLoadState: async () => {}, context: () => idleContext };

test("retry budget is reset at run start, not only on success (EXEC-12)", async () => {
  const slug = "budget-test";

  // Simulate a run that failed after burning the whole budget on step 0.
  assert.strictEqual(checkRetryBudget(slug, 0), true);
  assert.strictEqual(checkRetryBudget(slug, 0), true);
  assert.strictEqual(checkRetryBudget(slug, 0), true);
  assert.strictEqual(checkRetryBudget(slug, 0), false, "budget should be exhausted after 3 attempts");

  // Re-running the same skill in the same process must behave like a cold first run.
  await runPlan(idlePage, [], {}, 0, slug);
  assert.strictEqual(checkRetryBudget(slug, 0), true, "recovery must engage again after a failed run");
});

test("resetting one skill's budget leaves other skills untouched", async () => {
  checkRetryBudget("other-skill", 0);
  checkRetryBudget("other-skill", 0);
  await runPlan(idlePage, [], {}, 0, "unrelated-skill");
  // "other-skill" keeps its two attempts: one left before exhaustion.
  assert.strictEqual(checkRetryBudget("other-skill", 0), true);
  assert.strictEqual(checkRetryBudget("other-skill", 0), false);
});
