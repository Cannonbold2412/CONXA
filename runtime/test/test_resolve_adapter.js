"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { signalToLocator, gatherCandidates, bundleFingerprint } = require("../resolve_adapter");
const { resolve } = require("../resolver");

const idInterp = (s) => s;  // identity interpolate for tests

// Mock root recording which builder was invoked.
function mockRoot() {
  const calls = [];
  const mk = (kind, arg, opts) => {
    calls.push({ kind, arg, opts });
    return { kind, arg, opts };
  };
  return {
    calls,
    getByTestId: (v) => mk("testid", v),
    getByRole: (r, o) => mk("role", r, o),
    getByText: (t, o) => mk("text", t, o),
    locator: (s) => mk("locator", s),
  };
}

test("signalToLocator maps testid → getByTestId", () => {
  const root = mockRoot();
  signalToLocator(root, { engine: "testid", selector: 'internal:testid=[data-testid="go"]' }, idInterp, {});
  assert.deepStrictEqual(root.calls[0], { kind: "testid", arg: "go", opts: undefined });
});

test("signalToLocator maps role+name → getByRole", () => {
  const root = mockRoot();
  signalToLocator(root, { engine: "role", selector: 'internal:role=button[name="Submit order"]' }, idInterp, {});
  assert.strictEqual(root.calls[0].kind, "role");
  assert.strictEqual(root.calls[0].arg, "button");
  assert.deepStrictEqual(root.calls[0].opts, { name: "Submit order" });
});

test("signalToLocator maps text → getByText exact", () => {
  const root = mockRoot();
  signalToLocator(root, { engine: "text_based", selector: 'internal:text="Save"' }, idInterp, {});
  assert.strictEqual(root.calls[0].kind, "text");
  assert.strictEqual(root.calls[0].arg, "Save");
  assert.deepStrictEqual(root.calls[0].opts, { exact: true });
});

test("signalToLocator relational falls back to base role+name", () => {
  const root = mockRoot();
  signalToLocator(root, {
    engine: "relational",
    selector: 'internal:role=button[name="X"] >> right-of=internal:text="Y"',
  }, idInterp, {});
  assert.strictEqual(root.calls[0].kind, "role");
  assert.deepStrictEqual(root.calls[0].opts, { name: "X" });
});

test("signalToLocator xpath gets xpath= prefix", () => {
  const root = mockRoot();
  signalToLocator(root, { engine: "xpath", selector: "//div/button" }, idInterp, {});
  assert.deepStrictEqual(root.calls[0], { kind: "locator", arg: "xpath=//div/button", opts: undefined });
});

test("signalToLocator css passes through to locator()", () => {
  const root = mockRoot();
  signalToLocator(root, { engine: "css-structural", selector: "button.submit" }, idInterp, {});
  assert.deepStrictEqual(root.calls[0], { kind: "locator", arg: "button.submit", opts: undefined });
});

// Mock an element-locator returned by .all() whose evaluate() yields a fixed descriptor.
function mockElement(descriptor) {
  return { evaluate: async () => ({ ...descriptor }), _id: descriptor.testid || descriptor.name };
}

// Build a mock root whose builders return a locator with .all() resolving to mock elements.
function rootWithCandidates(bySelectorKind) {
  const make = (els) => ({ all: async () => els });
  return {
    getByTestId: () => make(bySelectorKind.testid || []),
    getByRole: () => make(bySelectorKind.role || []),
    getByText: () => make(bySelectorKind.text || []),
    locator: () => make(bySelectorKind.locator || []),
  };
}

test("gatherCandidates + resolve picks the unique testid match", async () => {
  const winner = mockElement({ testid: "go", role: "button", name: "Go", text: "Go" });
  const root = rootWithCandidates({ testid: [winner] });
  const signals = [
    { engine: "testid", selector: 'internal:testid=[data-testid="go"]', durability: 0.99 },
    { engine: "role", selector: 'internal:role=button[name="Go"]', durability: 0.95 },
  ];
  const map = await gatherCandidates([root], signals, idInterp, {});
  const fp = bundleFingerprint({ fingerprint: { data_testid: "go", role: "button", aria_label: "Go" } });
  const result = resolve(signals, fp, { queryAll: (sel) => map[sel] || [] }, {});
  assert.ok(result.node, "should resolve a node");
  assert.strictEqual(result.node._hashPayload, undefined, "hash payload stripped");
  assert.strictEqual(result.signalUsed.engine, "testid");
  assert.strictEqual(result.node._loc, winner);
});

test("gatherCandidates computes a stableHash from the payload", async () => {
  const el = { evaluate: async () => ({ role: "button", name: "X", text: "X", testid: "", _hashPayload: "button||X" }) };
  const root = rootWithCandidates({ role: [el] });
  const signals = [{ engine: "role", selector: 'internal:role=button[name="X"]', durability: 0.95 }];
  const map = await gatherCandidates([root], signals, idInterp, {});
  const d = map[signals[0].selector][0];
  assert.strictEqual(typeof d.stableHash, "string");
  assert.strictEqual(d.stableHash.length, 64);  // sha256 hex
  assert.strictEqual(d._hashPayload, undefined);
});

test("bundleFingerprint folds stable_hash into the fingerprint", () => {
  const fp = bundleFingerprint({ fingerprint: { role: "button" }, stable_hash: "abc" });
  assert.strictEqual(fp.role, "button");
  assert.strictEqual(fp.stable_hash, "abc");
});
