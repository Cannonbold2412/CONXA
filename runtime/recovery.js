"use strict";

// Phase 9 — recovery cascade Layers 1 & 2 helpers (zero-token, deterministic).
//
// Layer 1 classifies a thrown error into a deterministic remedy so the runner can apply a
// targeted retry (re-resolve / scroll / wait-stable / wait-enabled / dismiss-overlay) instead
// of blindly re-running the whole cascade. Layer 2 mechanisms (a11y re-probe, anchor re-find,
// scroll-until-found, re-hover) live in run.js, which already has the locator plumbing; this
// module supplies the classifier and the structured repair_event payload builder.

const CLASS = {
  STALE: "stale",            // element detached between resolve and act
  INTERCEPTED: "intercepted", // overlay intercepts pointer events
  OUT_OF_BOUNDS: "out-of-bounds",
  NOT_STABLE: "not-stable",   // element still animating
  NOT_ENABLED: "not-enabled",
  VERIFY_FAIL: "verification-fail",
  BENIGN: "benign-noise",
  UNKNOWN: "unknown",
};

// Map a Playwright/runtime error to a recovery class (Layer 1 exception ladder).
function classifyException(err) {
  if (!err) return CLASS.UNKNOWN;
  if (err.verifyFail) return CLASS.VERIFY_FAIL;
  const msg = String(err.message || err).toLowerCase();

  if (/detached|not attached|element is not attached|stale/.test(msg)) return CLASS.STALE;
  if (/intercepts pointer events|intercepted|obscure/.test(msg)) return CLASS.INTERCEPTED;
  if (/outside of the viewport|out of bounds|not in viewport/.test(msg)) return CLASS.OUT_OF_BOUNDS;
  if (/not stable|did not stabilize|still animating/.test(msg)) return CLASS.NOT_STABLE;
  if (/disabled|not enabled|not editable/.test(msg)) return CLASS.NOT_ENABLED;
  if (/timeout.*exceeded|waiting for/.test(msg)) return CLASS.STALE; // most timeouts → re-resolve
  return CLASS.UNKNOWN;
}

// Remedy hint for a class — consumed by the Layer 1 ladder in run.js.
function remedyFor(klass) {
  switch (klass) {
    case CLASS.STALE: return "re-resolve";
    case CLASS.INTERCEPTED: return "dismiss-overlay";
    case CLASS.OUT_OF_BOUNDS: return "scroll-into-view";
    case CLASS.NOT_STABLE: return "wait-stable";
    case CLASS.NOT_ENABLED: return "wait-enabled";
    case CLASS.VERIFY_FAIL: return "descend-layer2";
    default: return "retry-cascade";
  }
}

// Build the structured repair_event telemetry payload (drift signal → Cloud aggregation).
// This is ephemeral per-run telemetry; the local signed pack is never mutated. A durable
// fix is only ever an admin-reviewed, manually published re-sign (see flywheel docs).
function buildRepairEvent(step, stepIndex, opts = {}) {
  const bundle = (step && step.identity_bundle) || {};
  return {
    step_id: stepIndex,
    tier: opts.tier || "L2",
    method: opts.method || "",
    signal_used: opts.signalUsed || "",
    score: typeof opts.score === "number" ? Number(opts.score.toFixed(3)) : null,
    margin: typeof opts.margin === "number" ? Number(opts.margin.toFixed(3)) : null,
    stable_hash_match: !!opts.stableHashMatch,
    stable_hash: bundle.stable_hash || "",
    drift_hint: opts.driftHint || remedyFor(opts.klass || CLASS.UNKNOWN),
    app_version_fingerprint: bundle.compat_fingerprint || (step && step.app_version_fingerprint) || "",
  };
}

module.exports = { CLASS, classifyException, remedyFor, buildRepairEvent };
