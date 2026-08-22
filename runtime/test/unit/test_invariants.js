"use strict";
// Invariant pin tests — these assert exact constant values and list memberships
// that other modules rely on implicitly. A change here should never happen by
// accident; if one of these fails, the change is a deliberate invariant change
// and must be reviewed as such (see AGENTS.md Key Invariants).
const test   = require("node:test");
const assert = require("node:assert");

const { DEFAULT_UNIQUE_MARGIN, DEFAULT_CONFIDENCE_THRESHOLD } = require("../../app/resolver");
const { NOOP_STEP_TYPES } = require("../../app/run");

test("resolver's default unique margin is pinned at 0.15", () => {
  // resolver.js: "never blindly picks candidate[0]" — the winner must beat the
  // runner-up by this margin or the signal falls through. Lowering it silently
  // loosens the gate for every skill execution.
  assert.strictEqual(DEFAULT_UNIQUE_MARGIN, 0.15);
});

test("resolver's default confidence threshold is pinned at 0.5", () => {
  assert.strictEqual(DEFAULT_CONFIDENCE_THRESHOLD, 0.5);
});

test("frame markers are declared no-recovery no-op step types", () => {
  // frame_enter/frame_exit are navigation markers, not interactable elements —
  // they must never get a recovery block (AGENTS.md Key Invariants).
  assert.ok(NOOP_STEP_TYPES.includes("frame_enter"));
  assert.ok(NOOP_STEP_TYPES.includes("frame_exit"));
});

test("tab/popup markers stay out of the blanket no-op list", () => {
  // Deliberate (see run.js comment above NOOP_STEP_TYPES): tab_open/tab_switch/
  // popup get their own explicit handling because something DOES happen around
  // those steps — folding them into the blanket list would hide that.
  assert.ok(!NOOP_STEP_TYPES.includes("tab_open"));
  assert.ok(!NOOP_STEP_TYPES.includes("tab_switch"));
  assert.ok(!NOOP_STEP_TYPES.includes("popup"));
});

test("upload_intent remains a defensive no-op entry", () => {
  // Defensive dead code per run.js's own comment: real packs collapse
  // upload_intent to type "upload" at build time. If this ever fires in a real
  // pack, that collapsing rule regressed — the pin makes the removal a visible
  // decision, not silent rot.
  assert.ok(NOOP_STEP_TYPES.includes("upload_intent"));
});
