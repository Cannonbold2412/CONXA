"use strict";

// Tier 3/4 override-validation gate (run.js:validateOverrideSelector) — extends the
// "resolver never blindly picks candidate[0]" invariant to the agent-recovery closing edge.
// Mocks Playwright's page.locator(selector).all() so no real browser is needed; scoring itself
// reuses the real resolver.js/resolve_adapter.js (not mocked).

const test = require("node:test");
const assert = require("node:assert");

const { validateOverrideSelector } = require("../run");

// Mock page: page.locator(selector).all() resolves to one "locator" per descriptor, whose
// .evaluate() returns that descriptor directly (bypassing real DOM extraction — the extraction
// logic itself, resolve_adapter.js's _extractDescriptor, is exercised in real browser tests).
function mockPage(descriptorsBySelector) {
  return {
    locator(selector) {
      const descriptors = descriptorsBySelector[selector] || [];
      return {
        async all() {
          return descriptors.map(d => ({ evaluate: async () => ({ ...d }) }));
        },
      };
    },
  };
}

test("validateOverrideSelector: no match is invalid", async () => {
  const page = mockPage({});
  const step = { _explicit_selector: "#missing", identity_bundle: {} };
  const result = await validateOverrideSelector(page, step, {});
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "no-match");
});

test("validateOverrideSelector: a single match is accepted even with an impoverished fingerprint", async () => {
  const page = mockPage({ "#go": [{ role: "button", name: "", text: "", testid: "" }] });
  const step = { _explicit_selector: "#go", identity_bundle: { fingerprint: {} } };
  const result = await validateOverrideSelector(page, step, {});
  assert.strictEqual(result.valid, true);
  assert.ok(result.loc);
});

test("validateOverrideSelector: multi-match resolves the clear winner via fingerprint scoring", async () => {
  const page = mockPage({
    ".btn": [
      { role: "button", name: "Cancel", text: "Cancel", testid: "" },
      { role: "button", name: "Submit order", text: "Submit order", testid: "go" },
    ],
  });
  const step = {
    _explicit_selector: ".btn",
    identity_bundle: { fingerprint: { role: "button", data_testid: "go", aria_label: "Submit order" } },
  };
  const result = await validateOverrideSelector(page, step, {});
  assert.strictEqual(result.valid, true);
  const winner = await result.loc.evaluate();
  assert.strictEqual(winner.testid, "go");
});

test("validateOverrideSelector: a genuine tie (no signal clears the margin) is rejected as ambiguous", async () => {
  const page = mockPage({
    "button": [
      { role: "button", name: "Submit Order", text: "Submit Order", testid: "" },
      { role: "button", name: "Also Button", text: "Also Button", testid: "" },
    ],
  });
  const step = {
    _explicit_selector: "button",
    identity_bundle: { fingerprint: { role: "button", aria_label: "Totally Different Button", data_testid: "vanished" } },
  };
  const result = await validateOverrideSelector(page, step, {});
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "ambiguous");
  assert.strictEqual(result.candidates.length, 2);
});

test("validateOverrideSelector: missing/blank selector is invalid without querying the page", async () => {
  const page = mockPage({});
  const result = await validateOverrideSelector(page, { _explicit_selector: "", identity_bundle: {} }, {});
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "missing-selector");
});
