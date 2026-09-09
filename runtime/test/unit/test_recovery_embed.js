"use strict";
// Unit tests for handlers.js::enrichStepsWithRecovery — maps recovery.json's
// per-step recovery data onto the live execution steps by step_id (1-based).
// BUILD-25 stage e adds `_phase`; this file otherwise had zero direct coverage.
const test   = require("node:test");
const assert = require("node:assert");

const { enrichStepsWithRecovery } = require("../../app/handlers");

test("enrichStepsWithRecovery: maps _phase from recovery.json onto the matching step", () => {
  const steps = [{ candidates: ["#a"] }, { candidates: ["#b"] }];
  const recovery = {
    steps: [
      { step_id: 1, intent: "login_submit", phase: "login" },
      { step_id: 2, intent: "fill_amount" },
    ],
  };

  const enriched = enrichStepsWithRecovery(steps, recovery);

  assert.strictEqual(enriched[0]._phase, "login");
  assert.strictEqual(enriched[1]._phase, "", "a step the second-opinion pass never labeled gets \"\", not undefined");
});

test("enrichStepsWithRecovery: a step with no matching recovery entry is returned unchanged", () => {
  const steps = [{ candidates: ["#a"] }];
  const enriched = enrichStepsWithRecovery(steps, { steps: [] });

  assert.strictEqual(enriched[0], steps[0]);
  assert.strictEqual(enriched[0]._phase, undefined);
});

test("enrichStepsWithRecovery: non-array steps pass through untouched", () => {
  assert.strictEqual(enrichStepsWithRecovery(null, {}), null);
  assert.strictEqual(enrichStepsWithRecovery(undefined, {}), undefined);
});
