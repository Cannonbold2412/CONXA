"use strict";
// Unit tests for candidate_digest.js — the browser-use-style ranked indexed
// digest for Tier 3 semantic recovery. Pure functions; no browser.
const test   = require("node:test");
const assert = require("node:assert");

const {
  affinity,
  scoreCandidateEntry,
  formatDigestLine,
  deriveSelectorForEntry,
  buildIndexedDigest,
  DIGEST_CHAR_BUDGET,
} = require("../../app/candidate_digest");

const TARGET = {
  tag: "button",
  role: "button",
  text: "Buy Now",
  data_testid: "buy-btn",
  anchors: ["Purchase button", "checkout"],
};

test("affinity: asymmetric token containment", () => {
  assert.strictEqual(affinity("buy now", "Buy Now"), 1);
  assert.strictEqual(affinity("buy now", "Purchase your order now — buy"), 1, "needle tokens all present in longer label");
  assert.ok(affinity("purchase", "Purchase order") === 1);
  assert.ok(affinity("buy now", "order history") < 0.5);
  assert.strictEqual(affinity("", "anything"), 0);
});

test("scoreCandidateEntry: testid outranks text, which outranks role/tag", () => {
  const exactTestid = scoreCandidateEntry({ tag: "div", text: "unrelated", "data-testid": "buy-btn" }, TARGET);
  const exactText   = scoreCandidateEntry({ tag: "button", role: "button", text: "Buy Now" }, TARGET);
  assert.ok(exactTestid > exactText, "a testid hit beats a text hit");

  const partialText = scoreCandidateEntry({ tag: "button", role: "button", text: "Buy your order now" }, TARGET);
  const roleOnly    = scoreCandidateEntry({ tag: "button", role: "button", text: "something else" }, TARGET);
  assert.ok(partialText > roleOnly, "partial anchor affinity still ranks above bare role/tag");
  assert.ok(roleOnly > 0);
});

test("deriveSelectorForEntry: preference order testid > id > internal:role > text", () => {
  assert.strictEqual(
    deriveSelectorForEntry({ "data-testid": "go", id: "gobtn", role: "button", text: "Go" }),
    '[data-testid="go"]'
  );
  assert.strictEqual(deriveSelectorForEntry({ id: "gobtn" }), "#gobtn");
  assert.strictEqual(
    deriveSelectorForEntry({ role: "button", text: 'Say "hi"' }),
    'internal:role=button[name="Say hi"]',
    "quotes are stripped from derived selectors"
  );
  assert.strictEqual(
    deriveSelectorForEntry({ role: "link", text: "Order history" }),
    'internal:role=link[name="Order history"]'
  );
  assert.strictEqual(deriveSelectorForEntry({ text: "Just text" }), 'text="Just text"');
  assert.strictEqual(deriveSelectorForEntry({}), null, "no signal → no derivable selector");
});

test("formatDigestLine: numbered, compact, label-truncated", () => {
  assert.strictEqual(formatDigestLine(3, { tag: "button", text: "Go" }), '[3] button "Go"');
  const long = "x".repeat(100);
  const line = formatDigestLine(0, { tag: "input", type: "text", text: long });
  assert.ok(line.startsWith("[0] input type=text"));
  assert.ok(line.length < 120, "labels truncated to keep rows bounded");
});

test("buildIndexedDigest: ranks strongest match first and indexes consecutively", () => {
  const inventory = [
    { tag: "a", text: "Order history" },
    { tag: "button", text: "Buy Now", "data-testid": "buy-btn" },
    { tag: "button", text: "Save draft" },
  ];
  const { text, map, total, shown } = buildIndexedDigest(inventory, TARGET);
  const lines = text.split("\n");
  assert.strictEqual(total, 3);
  assert.strictEqual(shown, 3);
  assert.match(lines[0], /\[0\] button testid=buy-btn "Buy Now"/, "strongest match is index 0");
  assert.deepStrictEqual(Object.keys(map), ["0", "1", "2"]);
  assert.strictEqual(map["0"].selector, '[data-testid="buy-btn"]');
});

test("buildIndexedDigest: char budget cuts by relevance, never mid-entry", () => {
  // Digest rows are label-truncated, so no single entry can overflow the
  // budget — the cut only engages across volume. 1,000 ~85-char rows ≈ 85k
  // chars: roughly half must survive, all whole, strongest-ranked first.
  const inventory = Array.from({ length: 1000 }, (_, i) => ({
    tag: "button",
    text: `item-${i} ${"w".repeat(60)}`,
  }));
  const { text, map, total, shown } = buildIndexedDigest(inventory, TARGET);
  const lines = text.split("\n");
  assert.strictEqual(total, 1000);
  assert.ok(shown < total, "budget forces a cut on high-volume pages");
  assert.ok(text.length <= DIGEST_CHAR_BUDGET, "output stays under budget");
  assert.strictEqual(lines.length, shown);
  for (const line of lines) {
    assert.match(line, /^\[\d+\] button "item-\d+ w+…?"$/, "every emitted row is a complete entry");
  }
  assert.deepStrictEqual(Object.keys(map), lines.map((_, i) => String(i)),
    "nomination map indexes match emitted rows exactly");
});

test("buildIndexedDigest: entries with no derivable selector are not offered for nomination", () => {
  const { map, shown } = buildIndexedDigest([{ tag: "div", text: "" }], TARGET);
  assert.strictEqual(shown, 0);
  assert.deepStrictEqual(map, {});
});
