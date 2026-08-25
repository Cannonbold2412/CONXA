"use strict";
// Browser Back/Forward replay: the recorder captures history navigations as explicit
// browser_back/browser_forward steps (never guessed URL navigations). These pins make the
// dispatch wiring a visible decision — see conxa_compile/recorder/session.py for the
// record-side CDP navigation-history tracking.
const test   = require("node:test");
const assert = require("node:assert");

const { NAVIGATION_STEP_TYPES, NOOP_STEP_TYPES } = require("../../app/run");
const { HANDLERS } = require("../../app/handlers");

test("browser_back/browser_forward have real handlers, not no-ops", () => {
  assert.strictEqual(typeof HANDLERS.browser_back, "function");
  assert.strictEqual(typeof HANDLERS.browser_forward, "function");
  // They are real navigation steps — they must never leak into the blanket no-op list.
  assert.ok(!NOOP_STEP_TYPES.includes("browser_back"));
  assert.ok(!NOOP_STEP_TYPES.includes("browser_forward"));
});

test("browser_back/browser_forward count as navigation step types", () => {
  // The step AFTER a history navigation must wait for page load (run.js::waitForPageLoad).
  assert.ok(NAVIGATION_STEP_TYPES.has("browser_back"));
  assert.ok(NAVIGATION_STEP_TYPES.has("browser_forward"));
});
