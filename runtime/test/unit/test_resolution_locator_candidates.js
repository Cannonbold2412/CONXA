"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { locatorCandidates } = require("../../app/resolution");

// A minimal mock "page" acting as the sole root (no frame_chain/entity_binding on the step,
// so rootCandidates() resolves to [page] unchanged).
function mockPage() {
  const calls = [];
  const mk = (kind, arg, opts) => {
    const rec = { kind, arg, opts };
    calls.push(rec);
    return rec;
  };
  return {
    calls,
    getByRole: (r, o) => mk("role", r, o),
    getByText: (t, o) => mk("text", t, o),
    locator: (s) => mk("locator", s),
  };
}

test("locatorCandidates routes a role= string through getByRole, not an exact-match locator()", async () => {
  // Recovery's explicit-selector re-run hands locatorCandidates the compiled step's raw
  // "selector" string, which may be signal_to_display()'s unprefixed "role=…[name=\"…\"]"
  // form. It must resolve the same tolerant way as the primary resolver, not fall through
  // to Playwright's exact-match role selector engine.
  const page = mockPage();
  const [loc] = await locatorCandidates(page, {}, {}, 'role=menuitem[name="File upload"]');
  assert.strictEqual(page.calls[0].kind, "role");
  assert.strictEqual(page.calls[0].arg, "menuitem");
  assert.deepStrictEqual(page.calls[0].opts, { name: "File upload" });
  assert.strictEqual(loc, page.calls[0]);
});

test("locatorCandidates routes a text= string through getByText", async () => {
  const page = mockPage();
  await locatorCandidates(page, {}, {}, 'text="Save"');
  assert.strictEqual(page.calls[0].kind, "text");
  assert.strictEqual(page.calls[0].arg, "Save");
});

test("locatorCandidates falls back to locator() for css/attr/xpath selectors", async () => {
  const page = mockPage();
  await locatorCandidates(page, {}, {}, '[data-key="19"]');
  assert.deepStrictEqual(page.calls[0], { kind: "locator", arg: '[data-key="19"]', opts: undefined });
});

test("locatorCandidates returns [] for an empty/interpolated-empty selector", async () => {
  const page = mockPage();
  const result = await locatorCandidates(page, {}, {}, "");
  assert.deepStrictEqual(result, []);
});
