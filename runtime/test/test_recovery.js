"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { CLASS, classifyException, remedyFor, buildRepairEvent } = require("../recovery");

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

test("timeouts map to stale (re-resolve)", () => {
  assert.strictEqual(classifyException(new Error("Timeout 700ms exceeded waiting for locator")), CLASS.STALE);
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
