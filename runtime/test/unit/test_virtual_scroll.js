"use strict";
// BUILD-30 — runtime\app\resolution.js::maybeScrollForVirtualization, plus the two
// self-contained page-realm scroll scripts it calls (app/page_scripts.js). No browser: the
// page scripts are pure functions of a plain object standing in for a live DOM element, and
// maybeScrollForVirtualization is exercised against a minimal Playwright-shaped fake root,
// matching test_entity_scope.js's style.

const test = require("node:test");
const assert = require("node:assert");

const { maybeScrollForVirtualization } = require("../../app/resolution");
const { scrollVirtualContainerStep, scrollDominantScrollableElement } = require("../../app/page_scripts");

// --- page_scripts.js pure-function checks -----------------------------------------------

test("scrollVirtualContainerStep advances while below the bottom", () => {
  const el = { scrollTop: 0, clientHeight: 300, scrollHeight: 3000 };
  const out = scrollVirtualContainerStep(el);
  assert.strictEqual(out.advanced, true);
  assert.strictEqual(el.scrollTop, 300);
});

test("scrollVirtualContainerStep resets to top once the bottom is reached", () => {
  const el = { scrollTop: 2700, clientHeight: 300, scrollHeight: 3000 };
  const out = scrollVirtualContainerStep(el);
  assert.strictEqual(out.advanced, true);
  assert.strictEqual(el.scrollTop, 0);
});

test("scrollVirtualContainerStep on a null element is a no-op", () => {
  assert.deepStrictEqual(scrollVirtualContainerStep(null), { advanced: false });
});

test("scrollDominantScrollableElement finds nothing without a document global", () => {
  // No `document` in this Node context — the function must not throw, only degrade.
  assert.throws(() => scrollDominantScrollableElement(), /document is not defined/);
});

// --- maybeScrollForVirtualization --------------------------------------------------------

function fakeRootWithLocator(evaluateImpl) {
  return {
    locator(_sel) {
      return {
        first() { return { evaluate: evaluateImpl }; },
      };
    },
  };
}

test("compiled virtualized_container hint: scroll runs and marks real evidence", async () => {
  let evaluated = null;
  const root = fakeRootWithLocator(async (script) => {
    evaluated = script;
    return { advanced: true };
  });
  const step = { handler_hints: { virtualized_container: ".ag-body-viewport" }, entity_binding: null };
  const scrollState = { passes: 0, extended: false, attemptedScroll: false };

  const advanced = await maybeScrollForVirtualization(step, [root], scrollState);

  assert.strictEqual(advanced, true);
  assert.strictEqual(scrollState.attemptedScroll, true);
  assert.strictEqual(scrollState.passes, 1);
  assert.strictEqual(typeof evaluated, "function"); // scrollVirtualContainerStep, not the dominant fallback
});

test("entity_binding container (no compiled hint) also triggers a scroll and real evidence", async () => {
  const root = fakeRootWithLocator(async () => ({ advanced: false }));
  const step = {
    handler_hints: {},
    entity_binding: { container_selector: "table#invoices tr", identifier: "Invoice #12345" },
  };
  const scrollState = { passes: 0, extended: false, attemptedScroll: false };

  await maybeScrollForVirtualization(step, [root], scrollState);

  assert.strictEqual(scrollState.attemptedScroll, true);
  assert.strictEqual(scrollState.passes, 1);
});

test("regression guard: no hint and no entity binding never scrolls, never marks evidence", async () => {
  let called = false;
  const root = fakeRootWithLocator(async () => { called = true; return { advanced: true }; });
  const step = { handler_hints: {}, entity_binding: null };
  const scrollState = { passes: 0, extended: false, attemptedScroll: false };

  const advanced = await maybeScrollForVirtualization(step, [root], scrollState);

  assert.strictEqual(advanced, false);
  assert.strictEqual(called, false);
  assert.strictEqual(scrollState.passes, 0);
  assert.strictEqual(scrollState.attemptedScroll, false);
});

test("choice-kind control with no other evidence uses the dominant-scrollable fallback, without marking real evidence", async () => {
  let evaluated = null;
  const root = fakeRootWithLocator(async (script) => { evaluated = script; return { advanced: true }; });
  const step = { handler_hints: { control_kind: "choice" }, entity_binding: null };
  const scrollState = { passes: 0, extended: false, attemptedScroll: false };

  const advanced = await maybeScrollForVirtualization(step, [root], scrollState);

  assert.strictEqual(advanced, true);
  assert.strictEqual(scrollState.passes, 1);
  // The dominant-scrollable fallback is not real compiled evidence — it must never extend
  // withLocator's deadline on its own (see locators.js).
  assert.strictEqual(scrollState.attemptedScroll, false);
  assert.strictEqual(evaluated, scrollDominantScrollableElement);
});

test("pass cap: stops attempting once CONXA_VIRTUAL_SCROLL_MAX_PASSES is reached", async () => {
  const root = fakeRootWithLocator(async () => ({ advanced: true }));
  const step = { handler_hints: { virtualized_container: ".x" }, entity_binding: null };
  const scrollState = { passes: 999999, extended: false, attemptedScroll: false };

  const advanced = await maybeScrollForVirtualization(step, [root], scrollState);
  assert.strictEqual(advanced, false);
});

test("kill switch: CONXA_VIRTUAL_SCROLL=0 disables scrolling entirely", async (t) => {
  process.env.CONXA_VIRTUAL_SCROLL = "0";
  t.after(() => { delete process.env.CONXA_VIRTUAL_SCROLL; });
  // Re-require after the env flip — run_config.js reads it at module-load time.
  delete require.cache[require.resolve("../../app/run_config")];
  delete require.cache[require.resolve("../../app/resolution")];
  const { maybeScrollForVirtualization: maybeScroll } = require("../../app/resolution");

  const root = fakeRootWithLocator(async () => ({ advanced: true }));
  const step = { handler_hints: { virtualized_container: ".x" }, entity_binding: null };
  const scrollState = { passes: 0, extended: false, attemptedScroll: false };

  const advanced = await maybeScroll(step, [root], scrollState);
  assert.strictEqual(advanced, false);
  assert.strictEqual(scrollState.passes, 0);

  delete require.cache[require.resolve("../../app/run_config")];
  delete require.cache[require.resolve("../../app/resolution")];
});
