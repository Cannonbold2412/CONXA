"use strict";
// The deterministic cascade may change WHEN or WHERE it looks — never WHICH element it settles
// for. Two stages used to break that: a fallback-selector walk (which clicked `.first()` on
// text-derived selectors, its own comment conceding "Each fallback is a DIFFERENT element") and a
// fuzzy text match (which accepted `intent.includes(text) || text.includes(intent)`, so the intent
// "Save changes and continue" matched a bare "Save" button elsewhere on the page, then clicked
// `tag >> nth=N`). Both were deleted.
//
// This matters beyond the wrong click itself: a wrong click MUTATES the page, and the agent tier
// runs afterwards. A guessing stage that misses doesn't merely fail — it hands the most capable
// tier a page that no longer matches the recording, and nothing downstream can undo that. So the
// invariant under test is not "guessing is rare", it is "the deterministic tier never dispatches
// at an element it has not verified is the recorded one".
//
// Guard against reintroduction: this test hands recoverStep a step LOADED with every text-ish
// field the deleted stages fed on, and asserts none of them ever reaches the page.

const test = require("node:test");
const assert = require("node:assert");

const cascade = require("../../app/cascade");
const locators = require("../../app/locators");

const { recoverStep } = cascade;

// Records every selector string the cascade asks the page for. Every action throws, so no stage
// can report success — we are testing which elements are ATTEMPTED, not which one wins.
function recordingPage(asked) {
  const fail = async () => { throw new Error("no browser in unit test"); };
  const mkLocator = (sel) => {
    asked.push(sel);
    const l = {
      first: () => l,
      nth: () => l,
      count: async () => 0,
      click: fail,
      evaluate: fail,
      evaluateAll: async () => [],
      waitFor: fail,
      scrollIntoViewIfNeeded: async () => {},
      locator: (s) => mkLocator(s),
    };
    return l;
  };
  return {
    url: () => "https://x.example/",
    locator: (s) => mkLocator(s),
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    keyboard: { press: async () => {} },
    evaluate: async () => null,
    frames: () => [],
    mainFrame: () => null,
    isClosed: () => false,
  };
}

// A step whose recorded target is `button.primary`, but which carries plenty of bait: text
// variants, an anchor, and alternate candidates that all point at a DESTRUCTIVE neighbour. The
// old fuzzy stage would have matched "Save" against the intent "Save changes and continue"; the
// old fallback walk would have tried the Delete candidate. Neither may be touched now.
function baitedStep() {
  return {
    type: "click",
    label: "Save changes and continue",
    value: "Save changes and continue",
    handler_hints: {},
    fallback_text_variants: ["Save", "Delete"],
    anchors: [{ text: "Delete", priority: 9 }],
    candidates: ['button[data-x="delete"]'],
    fallback_selectors: ["button.danger"],
  };
}

// verifyFail makes layer1Ladder resolve to "descend-layer2" and return immediately, so the test
// exercises the Layer 2 stages rather than the single-remedy L1 retry. No identity_bundle means
// the a11y stage has no accessible name and bails before dispatching — leaving exactly the
// stages this test is about.
const VERIFY_FAIL_ERR = { verifyFail: true };

test("Layer 2 never attempts an element derived from text variants, anchors or alternate candidates", async () => {
  const asked = [];
  const result = await recoverStep(
    recordingPage(asked), baitedStep(), {}, "no-guess", 0, "button.primary",
    { emit() {} }, VERIFY_FAIL_ERR, null, null, null,
  );

  assert.strictEqual(result, false, "nothing can succeed when every action throws");
  assert.ok(asked.length > 0, "the cascade did attempt recovery — otherwise this test proves nothing");

  // Every selector attempted must be the recorded one, or the recorded one re-scoped to a dialog.
  for (const sel of asked) {
    assert.ok(
      sel.endsWith("button.primary"),
      `cascade attempted a selector that is not the recorded target: ${sel}`,
    );
  }

  const joined = asked.join(" | ");
  assert.ok(!/text=/.test(joined), "no text-derived selector may be attempted");
  assert.ok(!/nth=/.test(joined), "no positional nth= selector may be attempted");
  assert.ok(!/delete|danger/i.test(joined), "the destructive neighbour must never be attempted");
});

test("dialog scoping is the only stage that changes where we look, and it keeps the same selector", async () => {
  const asked = [];
  await recoverStep(
    recordingPage(asked), baitedStep(), {}, "no-guess-dialog", 0, "button.primary",
    { emit() {} }, VERIFY_FAIL_ERR, null, null, null,
  );

  // Bare retry first, then each dialog container prefixing the SAME selector.
  assert.strictEqual(asked[0], "button.primary");
  assert.deepStrictEqual(asked.slice(1), [
    '[role="dialog"] button.primary',
    '[role="alertdialog"] button.primary',
    '[aria-modal="true"] button.primary',
    ".modal button.primary",
  ]);
});

test("the deleted guessing stages are not exported, and neither is the helper that fed them", () => {
  assert.strictEqual(cascade.recoverWithFallbackSelectors, undefined,
    "reintroducing an ungated fallback walk should fail this test");
  assert.strictEqual(cascade.recoverWithFuzzyText, undefined,
    "reintroducing an ungated fuzzy text match should fail this test");
  assert.strictEqual(locators.fallbackSelectors, undefined,
    "fallbackSelectors existed only to feed the deleted walk");

  // The stages that survived, for contrast — each either retries the recorded selector or clears
  // the same uniqueness gate primary resolution uses.
  assert.strictEqual(typeof cascade.recoverWithA11y, "function");
  assert.strictEqual(typeof cascade.recoverWithDialogScope, "function");
  assert.strictEqual(typeof cascade.layer1Ladder, "function");
});
