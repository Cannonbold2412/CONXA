"use strict";

// EXEC-38 — the "for each row matching X, do steps A-C" iteration primitive. Body steps run
// through the same executeOneStep every top-level step uses (tab resolution, GATE/VERIFY,
// recovery, dry-run's destructive-skip), so most of these tests pair a destructive body step
// with dry_run: true — that exercises the full enumerate → per-row entity-bind → resolve path
// without needing to mock the click-handler/gate dispatch chain (see test_dry_run.js, whose
// mock shape this borrows).

const test = require("node:test");
const assert = require("node:assert");

const { runPlan } = require("../../app/run");

const idleContext = { on: () => {} };

// N rows, each with its own full text (used as its identifier — see resolution.js's
// enumerateRows) and a delete-button matching a shared testid signal. entityRoots narrows to
// exactly the row whose text contains {{row_id}}, so the button item returned per row is
// distinct per iteration — proving the loop actually re-scopes each time, not just resolves the
// same element N times.
function mockRowsPage(rowTexts, { missingButtonAt = -1 } = {}) {
  const calls = { enumerate: 0 };
  const rows = rowTexts.map((text, idx) => {
    const btnItem = { evaluate: async () => ({ testid: "delete-btn", role: "button", name: "Delete", text: "Delete" }) };
    return {
      text,
      evaluate: async () => text, // enumerateRows reads each row's own text this way
      locator: (sel) => ({
        all: async () => (idx === missingButtonAt || sel !== '[data-testid="delete-btn"]' ? [] : [btnItem]),
      }),
    };
  });

  const containerLocator = {
    all: async () => { calls.enumerate++; return rows; },
    filter: ({ hasText }) => {
      const match = rows.find((r) => r.text.includes(hasText));
      return { count: async () => (match ? 1 : 0), first: () => match };
    },
  };

  return {
    calls,
    waitForLoadState: async () => {},
    context: () => idleContext,
    url: () => "https://x.test",
    locator: (sel) => (sel === "table#items tr" ? containerLocator : { all: async () => [] }),
  };
}

const CONTAINER_SEL = "table#items tr";

function destructiveBodyStep() {
  return {
    type: "click",
    intent: "delete_row",
    destructive: true,
    identity_bundle: {
      signals: [{ engine: "testid", selector: 'internal:testid=[data-testid="delete-btn"]', durability: 0.99, orthogonality_class: "test-contract" }],
      fingerprint: { data_testid: "delete-btn", role: "button", aria_label: "Delete" },
      stable_hash: "",
      frame_chain: [],
    },
    entity_binding: { container_selector: CONTAINER_SEL, identifier: "{{row_id}}", source: "input", confirmed: true },
  };
}

function forEachStep({ maxIterations = 10, noCap = false, onRowError, steps } = {}) {
  const step = {
    type: "for_each",
    rows: { container_selector: CONTAINER_SEL },
    as: "row",
    steps: steps || [destructiveBodyStep()],
  };
  if (!noCap) step.max_iterations = maxIterations;
  if (onRowError) step.on_row_error = onRowError;
  return step;
}

test("for_each + dry_run: visits every row exactly once, entity-bound per row, never dispatches", async () => {
  const page = mockRowsPage(["Invoice #1", "Invoice #2", "Invoice #3"]);
  const result = await runPlan(page, [forEachStep()], {}, 0, "for-each-basic", { dryRun: true });
  assert.strictEqual(result.dryRunSkipped.length, 3);
  assert.deepStrictEqual(result.dryRunSkipped.map((s) => s.index), [0, 0, 0]); // body-local index each iteration
});

test("for_each snapshots the row list exactly once, not per iteration", async () => {
  const page = mockRowsPage(["A", "B", "C"]);
  await runPlan(page, [forEachStep()], {}, 0, "for-each-snapshot", { dryRun: true });
  assert.strictEqual(page.calls.enumerate, 1);
});

test("for_each caps at max_iterations even when more rows exist", async () => {
  const page = mockRowsPage(["A", "B", "C", "D", "E"]);
  const result = await runPlan(page, [forEachStep({ maxIterations: 2 })], {}, 0, "for-each-cap", { dryRun: true });
  assert.strictEqual(result.dryRunSkipped.length, 2);
});

test("for_each with no max_iterations refuses to run at all", async () => {
  const page = mockRowsPage(["A", "B"]);
  await assert.rejects(
    () => runPlan(page, [forEachStep({ noCap: true })], {}, 0, "for-each-nocap", { dryRun: true }),
    (err) => {
      assert.strictEqual(err.failedAt, 0);
      assert.match(err.message, /max_iterations/);
      return true;
    }
  );
  assert.strictEqual(page.calls.enumerate, 0, "must refuse before ever enumerating rows");
});

test("for_each with on_row_error: stop (default) halts the whole run on the first row failure", async () => {
  const page = mockRowsPage(["A", "B", "C"], { missingButtonAt: 1 }); // row B's target can't resolve
  await assert.rejects(
    () => runPlan(page, [forEachStep()], {}, 0, "for-each-stop", { dryRun: true }),
    (err) => err.failedAt === 0
  );
});

test("for_each with on_row_error: continue skips a failing row and finishes the rest", async () => {
  const page = mockRowsPage(["A", "B", "C"], { missingButtonAt: 1 });
  const result = await runPlan(page, [forEachStep({ onRowError: "continue" })], {}, 0, "for-each-continue", { dryRun: true });
  // Rows A and C resolved+skipped; row B failed and was skipped over, not fatal.
  assert.strictEqual(result.dryRunSkipped.length, 2);
});

const NOOP_BODY = [{ type: "frame_enter", intent: "noop" }];

test("for_each restores inputs after the loop — no {{row_id}}/{{row_index}} leak to later steps", async () => {
  const page = mockRowsPage(["A", "B"]);
  const inputs = {};
  await runPlan(page, [forEachStep({ steps: NOOP_BODY })], inputs, 0, "for-each-restore");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(inputs, "row_id"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(inputs, "row_index"), false);
});

test("for_each restores a pre-existing input value of the same name after the loop", async () => {
  const page = mockRowsPage(["A", "B"]);
  const inputs = { row_id: "pre-existing" };
  await runPlan(page, [forEachStep({ steps: NOOP_BODY })], inputs, 0, "for-each-restore-existing");
  assert.strictEqual(inputs.row_id, "pre-existing");
});

test("for_each with a non-destructive, non-dry-run body step actually runs the loop body", async () => {
  // A pure no-op step type (frame_enter) proves the loop mechanics themselves work outside the
  // dry-run path, without needing to mock the click-handler/gate dispatch chain.
  const page = mockRowsPage(["A", "B", "C"]);
  const bodyStep = { type: "frame_enter", intent: "noop" };
  const result = await runPlan(page, [forEachStep({ steps: [bodyStep] })], {}, 0, "for-each-realbody");
  assert.strictEqual(result.dryRunSkipped.length, 0); // nothing destructive/dry-run here
  // No throw = every iteration's no-op body step ran to completion for all 3 rows.
});

test("for_each with zero matching rows is a no-op, not an error", async () => {
  const page = mockRowsPage([]);
  const result = await runPlan(page, [forEachStep()], {}, 0, "for-each-empty", { dryRun: true });
  assert.deepStrictEqual(result.dryRunSkipped, []);
});
