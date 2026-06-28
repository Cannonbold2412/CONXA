"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { resolve, scoreCandidate } = require("../resolver");

// Mock root: maps selector → node array.
function mockRoot(map) {
  return { queryAll: sel => map[sel] || [] };
}

const TESTID_SIG = { engine: "testid", selector: "internal:testid=[data-testid=\"submit\"]", durability: 0.99, orthogonality_class: "test-contract" };
const ROLE_SIG = { engine: "role", selector: "internal:role=button[name=\"Submit\"]", durability: 0.95, orthogonality_class: "semantic-aria" };
const TEXT_SIG = { engine: "text", selector: "internal:text=\"Submit\"", durability: 0.85, orthogonality_class: "visible-text" };

test("single match above threshold returns node", () => {
  const node = { testid: "submit", role: "button", name: "Submit", text: "Submit" };
  const root = mockRoot({ [TESTID_SIG.selector]: [node] });
  const fp = { data_testid: "submit", role: "button", aria_label: "Submit" };
  const r = resolve([TESTID_SIG], fp, root, {});
  assert.strictEqual(r.node, node);
  assert.strictEqual(r.signalUsed.engine, "testid");
});

test("durability order: testid tried before text", () => {
  const good = { testid: "submit", role: "button", name: "Submit", text: "Submit" };
  const root = mockRoot({
    [TESTID_SIG.selector]: [good],
    [TEXT_SIG.selector]: [good],
  });
  const fp = { data_testid: "submit", role: "button", aria_label: "Submit" };
  // Pass in reverse order to prove resolver re-sorts by durability.
  const r = resolve([TEXT_SIG, TESTID_SIG], fp, root, {});
  assert.strictEqual(r.signalUsed.engine, "testid");
});

test("multi-match below margin returns ambiguous", () => {
  // Two near-identical buttons → neither wins the margin gate.
  const a = { role: "button", name: "Save", text: "Save" };
  const b = { role: "button", name: "Save", text: "Save" };
  const root = mockRoot({ [ROLE_SIG.selector]: [a, b] });
  const fp = { role: "button", aria_label: "Save" };
  const r = resolve([ROLE_SIG], fp, root, { uniqueMargin: 0.15 });
  assert.strictEqual(r.ambiguous, true);
});

test("multi-match with clear winner returns best node and margin", () => {
  const winner = { role: "button", name: "Submit order", text: "Submit order", data_testid: "" };
  const loser = { role: "button", name: "Cancel", text: "Cancel" };
  const root = mockRoot({ [ROLE_SIG.selector]: [loser, winner] });
  const fp = { role: "button", aria_label: "Submit order", inner_text: "Submit order" };
  const r = resolve([ROLE_SIG], fp, root, { uniqueMargin: 0.1 });
  assert.strictEqual(r.node, winner);
  assert.ok(r.margin >= 0.1);
});

test("no match across all signals returns miss", () => {
  const root = mockRoot({});
  const fp = { data_testid: "submit" };
  const r = resolve([TESTID_SIG, ROLE_SIG], fp, root, {});
  assert.strictEqual(r.miss, true);
});

test("falls through ambiguous signal to a later unique signal", () => {
  const a = { role: "button", name: "Save", text: "Save" };
  const b = { role: "button", name: "Save", text: "Save" };
  const unique = { testid: "save-btn", role: "button", name: "Save", text: "Save" };
  const root = mockRoot({
    [ROLE_SIG.selector]: [a, b],          // ambiguous
    [TESTID_SIG.selector]: [unique],      // unique
  });
  const fp = { data_testid: "save-btn", role: "button", aria_label: "Save" };
  // testid has higher durability, so it's tried first and resolves uniquely.
  const r = resolve([ROLE_SIG, TESTID_SIG], fp, root, {});
  assert.strictEqual(r.node, unique);
  assert.strictEqual(r.signalUsed.engine, "testid");
});

test("stable_hash match acts as tie-breaker", () => {
  const a = { role: "button", name: "Go", text: "Go", stableHash: "hashA" };
  const b = { role: "button", name: "Go", text: "Go", stableHash: "hashB" };
  const root = mockRoot({ [ROLE_SIG.selector]: [a, b] });
  const fp = { role: "button", aria_label: "Go", stable_hash: "hashB" };
  const r = resolve([ROLE_SIG], fp, root, { uniqueMargin: 0.1 });
  assert.strictEqual(r.node, b);
});

test("scoreCandidate rewards testid agreement", () => {
  const fp = { data_testid: "x", role: "button", aria_label: "X" };
  const match = scoreCandidate({ testid: "x", role: "button", name: "X" }, fp);
  const mismatch = scoreCandidate({ testid: "y", role: "button", name: "X" }, fp);
  assert.ok(match > mismatch);
});

test("invalid root returns miss", () => {
  const r = resolve([TESTID_SIG], {}, null, {});
  assert.strictEqual(r.miss, true);
});

// Regression: form control whose compiled fingerprint records the TAG ("input") as the
// role and omits data_testid. The implicit ARIA role is "textbox" and the only positive
// signal is a unique testid. Pre-fix this scored 0 and resolved to {miss}, silently
// degrading every input step onto flaky string-selector recovery.
test("unique testid input resolves despite tag-role and empty fingerprint testid", () => {
  const INPUT_SIG = { engine: "testid", selector: "internal:testid=[data-testid=\"repo-input\"]", durability: 0.99, orthogonality_class: "test-contract" };
  const node = { role: "textbox", name: "", text: "", testid: "repo-input", anchorNeighbors: [] };
  const root = mockRoot({ [INPUT_SIG.selector]: [node] });
  const fp = { role: "input", data_testid: "", aria_label: "", name: "", inner_text: "" };
  const r = resolve([INPUT_SIG], fp, root, {});
  assert.strictEqual(r.node, node);
  assert.strictEqual(r.signalUsed.engine, "testid");
});

// A unique contract signal must still be REJECTED when the node positively contradicts
// the recorded fingerprint (different non-empty testid) — absence of agreement is trusted,
// active contradiction is not.
test("unique testid match is rejected when node testid contradicts fingerprint", () => {
  const SIG = { engine: "testid", selector: "internal:testid=[data-testid=\"a\"]", durability: 0.99 };
  const node = { role: "textbox", testid: "different-id" };
  const root = mockRoot({ [SIG.selector]: [node] });
  const fp = { role: "input", data_testid: "expected-id" };
  const r = resolve([SIG], fp, root, {});
  assert.strictEqual(r.miss, true);
});

// css-id is also a contract signal: #name with tag-role "input" and a label-derived name.
test("css-id input resolves via role-alias agreement", () => {
  const SIG = { engine: "css-id", selector: "#name", durability: 0.45, orthogonality_class: "structural" };
  const node = { role: "textbox", name: "name", text: "", testid: "" };
  const root = mockRoot({ [SIG.selector]: [node] });
  const fp = { role: "input", name: "name", data_testid: "" };
  const r = resolve([SIG], fp, root, {});
  assert.strictEqual(r.node, node);
});
