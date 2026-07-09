"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { CLASS, classifyException, remedyFor, buildRepairEvent } = require("../recovery");
const { a11yRecoveryName, gateLocator } = require("../run");

test("a11y recovery name prefers the element's own accessible name over label_text", () => {
  // Regression: the render 'create-a-service-from-github' blueprint link had its label_text
  // mis-captured as a sibling's text ("Project"). Recovery must use inner_text ("Blueprint"),
  // not label_text, or `role=link[name="Project"]` would click creation-button-project.
  assert.strictEqual(
    a11yRecoveryName({ role: "link", aria_label: "", name: "", inner_text: "Blueprint", label_text: "Project" }),
    "Blueprint",
  );
});

test("a11y recovery name falls back to label_text for label-only form controls", () => {
  // A textbox whose accessible name comes from its <label> (inner_text empty) must still resolve.
  assert.strictEqual(
    a11yRecoveryName({ role: "textbox", aria_label: "", name: "", inner_text: "", label_text: "Search repositories" }),
    "Search repositories",
  );
});

test("a11y recovery name prefers aria_label first", () => {
  assert.strictEqual(
    a11yRecoveryName({ aria_label: "Close dialog", inner_text: "X", label_text: "ignore" }),
    "Close dialog",
  );
});

test("classifies stale/detached error", () => {
  assert.strictEqual(classifyException(new Error("Element is not attached to the DOM")), CLASS.STALE);
});

test("classifies intercepted error", () => {
  assert.strictEqual(classifyException(new Error("<div> intercepts pointer events")), CLASS.INTERCEPTED);
});

test("classifies disabled error", () => {
  assert.strictEqual(classifyException(new Error("element is not enabled")), CLASS.NOT_ENABLED);
});

test("classifies verify-fail via flag", () => {
  const err = Object.assign(new Error("Verification failed: url_pattern"), { verifyFail: true });
  assert.strictEqual(classifyException(err), CLASS.VERIFY_FAIL);
});

test("plain locator timeout → timeout-element (skip straight to L2)", () => {
  assert.strictEqual(classifyException(new Error("Timeout 700ms exceeded waiting for locator")), CLASS.TIMEOUT_ELEMENT);
});

test("timeout carrying a navigation signature → timeout-navigation", () => {
  assert.strictEqual(
    classifyException(new Error("Timeout 700ms exceeded waiting for navigation")),
    CLASS.TIMEOUT_NAVIGATION,
  );
  assert.strictEqual(
    classifyException(new Error("Timeout 700ms exceeded waiting for locator: execution context was destroyed")),
    CLASS.TIMEOUT_NAVIGATION,
  );
});

test("unknown error → unknown", () => {
  assert.strictEqual(classifyException(new Error("some other thing")), CLASS.UNKNOWN);
});

test("remedyFor maps classes to remedies", () => {
  assert.strictEqual(remedyFor(CLASS.STALE), "re-resolve");
  assert.strictEqual(remedyFor(CLASS.INTERCEPTED), "dismiss-overlay");
  assert.strictEqual(remedyFor(CLASS.OUT_OF_BOUNDS), "scroll-into-view");
  assert.strictEqual(remedyFor(CLASS.NOT_STABLE), "wait-stable");
  assert.strictEqual(remedyFor(CLASS.NOT_ENABLED), "wait-enabled");
  assert.strictEqual(remedyFor(CLASS.TIMEOUT_NAVIGATION), "wait-navigation");
  assert.strictEqual(remedyFor(CLASS.TIMEOUT_ELEMENT), "descend-layer2");
  assert.strictEqual(remedyFor(CLASS.VERIFY_FAIL), "descend-layer2");
});

test("buildRepairEvent carries structured drift fields", () => {
  const step = { identity_bundle: { stable_hash: "abc", compat_fingerprint: "fp1" } };
  const evt = buildRepairEvent(step, 3, { tier: "L2", method: "a11y", klass: CLASS.STALE, score: 0.91234, margin: 0.2 });
  assert.strictEqual(evt.step_id, 3);
  assert.strictEqual(evt.tier, "L2");
  assert.strictEqual(evt.method, "a11y");
  assert.strictEqual(evt.stable_hash, "abc");
  assert.strictEqual(evt.app_version_fingerprint, "fp1");
  assert.strictEqual(evt.score, 0.912);
  assert.strictEqual(evt.drift_hint, "re-resolve");
});

test("buildRepairEvent tolerates missing identity_bundle", () => {
  const evt = buildRepairEvent({ type: "click" }, 0, {});
  assert.strictEqual(evt.stable_hash, "");
  assert.strictEqual(evt.tier, "L2");
});

test("gateLocator lets a detach error during the disabled-check escape instead of swallowing it", async () => {
  let calls = 0;
  const loc = {
    waitFor: async () => {},
    evaluate: async () => {
      calls += 1;
      if (calls === 1) return true; // RAF-stable check: element reports stable
      throw new Error("Element is not attached to the DOM"); // disabled-check: detached mid-flight
    },
  };
  await assert.rejects(() => gateLocator(loc, { confidence: 0.9 }), /not attached/);
});

test("gateLocator still swallows unrelated evaluate glitches on the disabled-check (best-effort)", async () => {
  let calls = 0;
  const loc = {
    waitFor: async () => {},
    evaluate: async () => {
      calls += 1;
      if (calls === 1) return true;
      throw new Error("some unrelated evaluate glitch");
    },
  };
  await assert.doesNotReject(() => gateLocator(loc, { confidence: 0.9 }));
});
