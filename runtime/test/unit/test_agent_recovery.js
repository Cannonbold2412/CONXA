"use strict";

// Tier 3/4 agent-recovery plumbing:
//   • clampRecoveryTier — the CONXA_MAX_RECOVERY_TIER ceiling (Studio=2, MCP=4).
//   • applyStepOverrides — the closing edge that lets the agent's chosen selector heal a step.

const test = require("node:test");
const assert = require("node:assert");

const { clampRecoveryTier, MAX_TIER } = require("../../app/recovery");
const { applyStepOverrides } = require("../../app/run");

test("clampRecoveryTier: default when unset / non-numeric", () => {
  assert.strictEqual(clampRecoveryTier(undefined, 4), 4);
  assert.strictEqual(clampRecoveryTier("", 4), 4);
  assert.strictEqual(clampRecoveryTier("abc", 4), 4);
  assert.strictEqual(clampRecoveryTier(null, 2), 2);
});

test("clampRecoveryTier: clamps to [1, MAX_TIER] and truncates", () => {
  assert.strictEqual(clampRecoveryTier("2"), 2);
  assert.strictEqual(clampRecoveryTier("0"), 1);
  assert.strictEqual(clampRecoveryTier("-5"), 1);
  assert.strictEqual(clampRecoveryTier("9"), MAX_TIER);
  assert.strictEqual(clampRecoveryTier("3.9"), 3);
});

test("applyStepOverrides: injects _explicit_selector at the keyed index", () => {
  const steps = [{ type: "click" }, { type: "fill" }, { type: "click" }];
  const out = applyStepOverrides(steps, { "2": { selector: "[data-testid='go']" } });
  assert.strictEqual(out[2]._explicit_selector, "[data-testid='go']");
  assert.strictEqual(out[2]._agent_override, true);
  // Other steps untouched; original array not mutated.
  assert.strictEqual(out[0]._explicit_selector, undefined);
  assert.strictEqual(steps[2]._explicit_selector, undefined);
});

test("applyStepOverrides: accepts a bare string selector value", () => {
  const out = applyStepOverrides([{ type: "click" }], { "0": "#submit" });
  assert.strictEqual(out[0]._explicit_selector, "#submit");
});

test("applyStepOverrides: ignores out-of-range, empty, and non-string selectors", () => {
  const steps = [{ type: "click" }];
  const out = applyStepOverrides(steps, {
    "5": { selector: "#x" },     // out of range
    "-1": { selector: "#y" },    // negative
    "0": { selector: "   " },    // blank
  });
  assert.strictEqual(out[0]._explicit_selector, undefined);
  const out2 = applyStepOverrides([{ type: "click" }], { "0": { selector: 123 } });
  assert.strictEqual(out2[0]._explicit_selector, undefined);
});

test("applyStepOverrides: trims selector whitespace", () => {
  const out = applyStepOverrides([{ type: "click" }], { "0": { selector: "  #a  " } });
  assert.strictEqual(out[0]._explicit_selector, "#a");
});

test("applyStepOverrides: no-op for missing/invalid overrides", () => {
  const steps = [{ type: "click" }];
  assert.strictEqual(applyStepOverrides(steps, null), steps);
  assert.strictEqual(applyStepOverrides(steps, undefined), steps);
  assert.strictEqual(applyStepOverrides(steps, "nope"), steps);
  assert.strictEqual(applyStepOverrides("notarray", { "0": "#x" }), "notarray");
});

// ── candidate_index nominations (Tier 3 reflection contract) ────────────────

test("applyStepOverrides: resolves candidate_index through the injected map lookup", () => {
  const steps = [{ type: "click" }];
  const resolveCandidateIndex = (stepIdx, candIdx) =>
    stepIdx === 0 && candIdx === 2 ? '[data-testid="ranked-2"]' : null;
  const out = applyStepOverrides(
    steps,
    { "0": { candidate_index: 2, confidence: 0.9 } },
    { resolveCandidateIndex },
  );
  assert.strictEqual(out[0]._explicit_selector, '[data-testid="ranked-2"]');
  assert.strictEqual(out[0]._agent_override, true);
});

test("applyStepOverrides: unresolvable candidate_index injects nothing (fresh digest next round)", () => {
  const steps = [{ type: "click" }, { type: "click" }];
  const out = applyStepOverrides(
    steps,
    {
      "0": { candidate_index: 99 },   // stale/unknown index
      "1": { selector: "#fallback" }, // explicit selector still honoured alongside
    },
    { resolveCandidateIndex: () => null },
  );
  assert.strictEqual(out[0]._explicit_selector, undefined);
  assert.strictEqual(out[1]._explicit_selector, "#fallback");
});

test("applyStepOverrides: explicit selector wins when both are given", () => {
  const out = applyStepOverrides(
    [{ type: "click" }],
    { "0": { selector: "#explicit", candidate_index: 5 } },
    { resolveCandidateIndex: () => "#from-map" },
  );
  assert.strictEqual(out[0]._explicit_selector, "#explicit");
});
