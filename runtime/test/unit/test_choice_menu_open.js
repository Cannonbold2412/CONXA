"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { _ensureChoiceMenuOpen } = require("../../app/handlers");

// demoqa.com/automation-practice-form regression: a react-select popup listbox renders its
// [role="option"] children ONLY while the menu is open, and the click that opens it lands on a
// role-less, id-less container the recorder discards as noise. So no compiled step ever reopens
// the menu, and select_option's option click could only ever miss.
//
// The recorder now captures the listbox's owner (an [role=combobox][aria-controls=…], falling
// back to the nearest stable-id ancestor) as choice.opener_selector, and this helper clicks it
// when the option is not already on the page. It stays deterministic and zero-LLM: the opener is
// a recorded selector, never a guess.

// Minimal Playwright page double. `present` is the set of selectors currently "in the DOM";
// clicking `opener` adds `reveals` to it.
function fakePage({ present = [], opener = null, reveals = [], clickThrows = false } = {}) {
  const state = new Set(present);
  const calls = { clicked: [], waited: [] };
  const page = {
    calls,
    locator(sel) {
      return {
        count: async () => (state.has(sel) ? 1 : 0),
        first: () => ({
          click: async () => {
            calls.clicked.push(sel);
            if (clickThrows) throw new Error("not clickable");
            if (sel === opener) for (const r of reveals) state.add(r);
          },
          waitFor: async () => {
            calls.waited.push(sel);
            if (!state.has(sel)) throw new Error("timeout");
          },
        }),
      };
    },
  };
  return page;
}

const CHOICE = { kind: "aria_listbox", opener_selector: "#react-select-3-input" };
const OPTION = { value: "NCR", label: "NCR", selector: "#react-select-3-option-0" };

test("clicks the opener when the option is not yet in the DOM", async () => {
  const page = fakePage({ opener: CHOICE.opener_selector, reveals: [OPTION.selector] });
  await _ensureChoiceMenuOpen(page, CHOICE, OPTION);
  assert.deepStrictEqual(page.calls.clicked, [CHOICE.opener_selector]);
  assert.deepStrictEqual(page.calls.waited, [OPTION.selector]);
});

test("does nothing when the menu is already open", async () => {
  const page = fakePage({ present: [OPTION.selector], opener: CHOICE.opener_selector });
  await _ensureChoiceMenuOpen(page, CHOICE, OPTION);
  assert.deepStrictEqual(page.calls.clicked, [], "must not re-toggle an open menu shut");
});

test("no opener recorded is a no-op, not an error", async () => {
  // Skills compiled before openers were recorded, and always-visible groups (a native
  // <select>, a radio fieldset), both land here.
  const page = fakePage({ opener: null });
  await _ensureChoiceMenuOpen(page, { kind: "aria_listbox", opener_selector: "" }, OPTION);
  assert.deepStrictEqual(page.calls.clicked, []);
});

test("an unclickable opener is swallowed so the caller's own wait decides the outcome", async () => {
  const page = fakePage({ opener: CHOICE.opener_selector, clickThrows: true });
  await assert.doesNotReject(() => _ensureChoiceMenuOpen(page, CHOICE, OPTION));
});

test("an opener that never reveals the option does not throw", async () => {
  const page = fakePage({ opener: CHOICE.opener_selector, reveals: [] });
  await assert.doesNotReject(() => _ensureChoiceMenuOpen(page, CHOICE, OPTION));
});

test("a missing option selector is a no-op", async () => {
  const page = fakePage({ opener: CHOICE.opener_selector });
  await _ensureChoiceMenuOpen(page, CHOICE, { value: "x", label: "x", selector: "" });
  assert.deepStrictEqual(page.calls.clicked, []);
});
