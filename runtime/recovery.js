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
  TIMEOUT_NAVIGATION: "timeout-navigation", // page was still navigating/loading
  TIMEOUT_ELEMENT: "timeout-element",       // plain locator-wait timeout, element never showed
  VERIFY_FAIL: "verification-fail",
  BENIGN: "benign-noise",
  UNKNOWN: "unknown",
};

// Shared vocabulary for "this element detached / is stale" — used both to classify
// exceptions (below) and by run.js's gateLocator to decide which evaluate() failures
// must not be silently swallowed (a detach there means the gate's enabled-check ran
// against an element that no longer exists, and the caller must be told).
const STALE_RE = /detached|not attached|element is not attached|stale/;

// A timeout whose message carries Playwright's in-flight-navigation signature — the
// page itself was still loading/navigating when the wait gave up, as opposed to a
// plain "this locator never appeared" timeout.
const NAVIGATION_TIMEOUT_RE = /navigat|execution context was destroyed|frame was detached/;

// Map a Playwright/runtime error to a recovery class (Layer 1 exception ladder).
function classifyException(err) {
  if (!err) return CLASS.UNKNOWN;
  if (err.verifyFail) return CLASS.VERIFY_FAIL;
  const msg = String(err.message || err).toLowerCase();

  if (STALE_RE.test(msg)) return CLASS.STALE;
  if (/intercepts pointer events|intercepted|obscure/.test(msg)) return CLASS.INTERCEPTED;
  if (/outside of the viewport|out of bounds|not in viewport/.test(msg)) return CLASS.OUT_OF_BOUNDS;
  if (/not stable|did not stabilize|still animating/.test(msg)) return CLASS.NOT_STABLE;
  if (/disabled|not enabled|not editable/.test(msg)) return CLASS.NOT_ENABLED;
  if (/timeout.*exceeded|waiting for/.test(msg)) {
    return NAVIGATION_TIMEOUT_RE.test(msg) ? CLASS.TIMEOUT_NAVIGATION : CLASS.TIMEOUT_ELEMENT;
  }
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
    case CLASS.TIMEOUT_NAVIGATION: return "wait-navigation";
    // Element genuinely never appeared — re-running the same wait would just re-fail
    // the same way. Skip straight to L2's resolution-changing mechanisms (this was
    // already today's de facto behavior via the "re-resolve" fallthrough; now explicit).
    case CLASS.TIMEOUT_ELEMENT: return "descend-layer2";
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

// Recovery-tier ceiling. The zero-token cascade (T1 ladder + T2 a11y/fallback) always runs
// in-process; T3 (LLM semantic) and T4 (vision) are agent-mediated and gated by this ceiling.
// CONXA_MAX_RECOVERY_TIER lets the Build Studio sandbox cap recovery at T2 for deterministic
// pack testing while live Claude/MCP execution gets the full T4 cascade.
const MAX_TIER = 4;

function clampRecoveryTier(raw, fallback = MAX_TIER) {
  // Treat unset / blank as "use the default" (Number("") is 0, which would otherwise clamp to 1).
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_TIER, Math.max(1, Math.trunc(n)));
}

module.exports = { CLASS, classifyException, remedyFor, buildRepairEvent, clampRecoveryTier, MAX_TIER, STALE_RE };
