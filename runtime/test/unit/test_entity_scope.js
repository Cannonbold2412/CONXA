"use strict";
// PROD-3 entity binding — runtime\app\resolution.js::entityRoots / isEntityNotFound.

const test = require("node:test");
const assert = require("node:assert");

const { entityRoots, isEntityNotFound } = require("../../app/resolution");

// Minimal Playwright-shaped fake: root.locator(sel) -> a "rows" locator whose .filter({hasText})
// returns a narrowed locator supporting .count()/.first(), matching the real chain entityRoots
// drives (root.locator(container_selector).filter({hasText}).count()/.first()).
function fakeRoot(rowTexts) {
  return {
    locator(containerSelector) {
      return {
        _containerSelector: containerSelector,
        filter({ hasText }) {
          const matches = rowTexts.filter(t => t.includes(hasText));
          return {
            async count() { return matches.length; },
            first() { return { _row: matches[0] }; },
          };
        },
      };
    },
  };
}

const STEP = {
  entity_binding: { container_selector: "table#invoices tr", identifier: "Invoice #12345", source: "literal", confirmed: true },
};

test("no binding on the step: roots pass through unchanged", async () => {
  const roots = [fakeRoot(["Invoice #1"])];
  const out = await entityRoots(roots, { entity_binding: null }, {});
  assert.strictEqual(out, roots);
});

test("exactly one match: narrows to that one row", async () => {
  const root = fakeRoot(["Invoice #12344", "Invoice #12345", "Invoice #12346"]);
  const out = await entityRoots([root], STEP, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0]._row, "Invoice #12345");
});

test("zero matches: fails closed to []", async () => {
  const root = fakeRoot(["Invoice #99999"]);
  const out = await entityRoots([root], STEP, {});
  assert.deepStrictEqual(out, []);
});

test("two matches (ambiguous): fails closed to [], never picks one", async () => {
  const root = fakeRoot(["Invoice #12345 (draft)", "Invoice #12345 (final)"]);
  const out = await entityRoots([root], STEP, {});
  assert.deepStrictEqual(out, []);
});

test("unresolved {{input}} identifier: fails closed without querying the page", async () => {
  const step = { entity_binding: { container_selector: "table tr", identifier: "{{invoice_no}}" } };
  const out = await entityRoots([fakeRoot(["anything"])], step, {});
  assert.deepStrictEqual(out, []);
});

test("identifier resolves from a run input via interpolate", async () => {
  const step = { entity_binding: { container_selector: "table tr", identifier: "{{invoice_no}}" } };
  const root = fakeRoot(["Invoice #55555"]);
  const out = await entityRoots([root], step, { invoice_no: "55555" });
  assert.strictEqual(out.length, 1);
});

test("isEntityNotFound: true only when a binding exists and narrowing produced zero roots", () => {
  assert.strictEqual(isEntityNotFound(STEP, []), true);
  assert.strictEqual(isEntityNotFound(STEP, [{}]), false);
  assert.strictEqual(isEntityNotFound({ entity_binding: null }, []), false);
});

test("multiple frame-scoped roots: each narrowed independently, non-matching roots drop out", async () => {
  const rootA = fakeRoot(["Invoice #99999"]);       // no match
  const rootB = fakeRoot(["Invoice #12345"]);        // exactly one match
  const out = await entityRoots([rootA, rootB], STEP, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0]._row, "Invoice #12345");
});
