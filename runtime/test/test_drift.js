"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  detectPreExecDrift,
  assessDrift,
  bestLandmarkScore,
} = require("../drift");

// ── bestLandmarkScore (pure) ────────────────────────────────────────────────

test("bestLandmarkScore: matching descriptor scores high", () => {
  const lm = { intent: "click submit", data_testid: "submit", inner_text: "Submit" };
  const descriptors = [{ testid: "submit", name: "Submit", text: "Submit" }];
  assert.ok(bestLandmarkScore(lm, descriptors) >= 0.9);
});

test("bestLandmarkScore: no candidates scores zero", () => {
  const lm = { intent: "click submit", data_testid: "submit", inner_text: "Submit" };
  assert.strictEqual(bestLandmarkScore(lm, []), 0);
});

test("bestLandmarkScore: contradicting testid scores low", () => {
  const lm = { data_testid: "submit", inner_text: "Submit" };
  const descriptors = [{ testid: "cancel", name: "Cancel", text: "Cancel" }];
  assert.ok(bestLandmarkScore(lm, descriptors) < 0.5);
});

// ── assessDrift (pure aggregation) ──────────────────────────────────────────

test("assessDrift: all landmarks present → no drift", () => {
  const landmarks = [{ intent: "a" }, { intent: "b" }, { intent: "c" }];
  const r = assessDrift(landmarks, [0.9, 0.8, 1.0]);
  assert.strictEqual(r.drift, false);
  assert.strictEqual(r.missing, 0);
});

test("assessDrift: majority missing → drift", () => {
  const landmarks = [{ intent: "a" }, { intent: "b" }, { intent: "c" }];
  const r = assessDrift(landmarks, [0.9, 0.1, 0.0]);
  assert.strictEqual(r.drift, true);
  assert.strictEqual(r.missing, 2);
  assert.deepStrictEqual(r.missingIntents, ["b", "c"]);
});

test("assessDrift: exactly at ratio threshold trips drift", () => {
  const landmarks = [{ intent: "a" }, { intent: "b" }];
  const r = assessDrift(landmarks, [0.9, 0.1]); // 1/2 == 0.5 threshold
  assert.strictEqual(r.drift, true);
});

test("assessDrift: empty landmarks → no drift", () => {
  const r = assessDrift([], []);
  assert.strictEqual(r.drift, false);
  assert.strictEqual(r.total, 0);
});

// ── detectPreExecDrift (page-driven, with a fake page) ──────────────────────

// Fake Playwright page whose locators yield preset descriptors. Each descriptor
// is returned directly from item.evaluate() (bypassing the real browser extractor).
function fakePage(byLocator, byText) {
  const handles = (arr) => (arr || []).map((d) => ({ evaluate: async () => d }));
  return {
    url: () => "https://example.test/app",
    locator: (sel) => ({ all: async () => handles(byLocator[sel]) }),
    getByText: (txt) => ({ all: async () => handles(byText[txt]) }),
  };
}

test("detectPreExecDrift: landmarks present → no drift", async () => {
  const fp = {
    landmarks: [
      { intent: "open menu", data_testid: "menu", inner_text: "Menu" },
      { intent: "click submit", data_testid: "submit", inner_text: "Submit" },
    ],
    landmark_count: 2,
  };
  const page = fakePage(
    {
      '[data-testid="menu"], [data-test-id="menu"]': [{ testid: "menu", name: "Menu", text: "Menu" }],
      '[data-testid="submit"], [data-test-id="submit"]': [{ testid: "submit", name: "Submit", text: "Submit" }],
    },
    {},
  );
  const r = await detectPreExecDrift(page, fp);
  assert.strictEqual(r.drift, false);
  assert.strictEqual(r.missing, 0);
});

test("detectPreExecDrift: landmarks vanished → drift", async () => {
  const fp = {
    landmarks: [
      { intent: "open menu", data_testid: "menu", inner_text: "Menu" },
      { intent: "click submit", data_testid: "submit", inner_text: "Submit" },
    ],
    landmark_count: 2,
  };
  // Redesigned page: none of the recorded testids or texts resolve.
  const page = fakePage({}, {});
  const r = await detectPreExecDrift(page, fp);
  assert.strictEqual(r.drift, true);
  assert.strictEqual(r.missing, 2);
  assert.strictEqual(r.total, 2);
});

test("detectPreExecDrift: no landmarks → no drift, no throw", async () => {
  const r = await detectPreExecDrift(fakePage({}, {}), { landmarks: [] });
  assert.strictEqual(r.drift, false);
});

test("detectPreExecDrift: falls back to text when testid missing", async () => {
  const fp = {
    landmarks: [{ intent: "click cta", inner_text: "Get started" }],
    landmark_count: 1,
  };
  const page = fakePage({}, { "Get started": [{ name: "Get started", text: "Get started" }] });
  const r = await detectPreExecDrift(page, fp);
  assert.strictEqual(r.drift, false);
});
