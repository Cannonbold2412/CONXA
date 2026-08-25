"use strict";
// Recovery cascade seam, extracted from run.js: the Tier 1 deterministic ladder
// and the Tier 2 zero-token mechanisms (a11y re-probe, fallback selectors,
// dialog scope, fuzzy text, re-hover), each closing through a verified action
// re-run. LLM fires at Tier 3+ only (AGENTS.md Key Invariants) — nothing in
// this module performs network I/O (CI-guarded by check_recovery_purity.js).
const { classifyException, remedyFor } = require("./recovery");
const { appendRecoveryEvent } = require("./recovery_log");
const { SECONDARY_ACTION_TIMEOUT_MS, CAPTURE_PRESTEP } = require("./run_config");
const { asObject, asArray, isNonIdempotent } = require("./step_utils");
const { rootCandidates } = require("./resolution");
const {
  stepWithSelector,
  fallbackSelectors,
  walkHoverChain,
  locatorEvaluateAll,
} = require("./locators");
const { executeStep } = require("./handlers");
const { verifyStep, hasRequiredAssertion, capturePreStepSignature, signatureChanged } = require("./assertions");
const { dismissKnownOverlay } = require("./dismiss_patterns");
const learnedDismissals = require("./learned_dismissals");

const INTERACTIVE_STEP_TYPES = new Set([
  "click", "dblclick", "right_click",
  "type", "fill", "focus", "select", "select_option",
  "set_checkbox", "set_radio", "date_pick",
  "drag_drop", "keyboard_shortcut", "upload",
]);

const DIALOG_CONTAINERS = ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', ".modal"];
const TEXT_MATCH_TAG_RE = /^(button|a|input|select|textarea)/i;

// ── EXEC-24: the action guard ────────────────────────────────────────────────────────────────
//
// The cascade below is a sequence of RESOLUTION STRATEGIES, but it is also — and this is what
// went unaccounted for — a sequence of ACTIONS. Each stage dispatches a real input event, and
// nothing between two stages ever asked whether the previous one already changed the page. So a
// Submit whose confirmation renders slower than its own poll got clicked again by the next stage.
//
// The fix is the deterministic equivalent of what browser-use and computer-use buy with a model
// call per attempt (re-perceive, then decide): before RE-dispatching a non-idempotent action, ask
// for local evidence that the previous attempt already landed. Two sources, in order of strength:
//
//   1. the step's own post-condition — if every assertion holds, the step already succeeded;
//   2. the pre-step page signature — if the page moved, something happened and we must not
//      guess what, so the ladder stops and the agent tier gets the page as it actually is.
//
// Zero-token by construction: both are DOM arithmetic already computed elsewhere in the runtime.
function createActionGuard(step, { acted = false, signature = null } = {}) {
  return {
    // Only step types where a second dispatch duplicates an effect are guarded at all; a
    // fill/select/hover recovers exactly as aggressively as it always has.
    guarded: isNonIdempotent(step),
    // Whether an action for THIS step may already have been dispatched (the primary attempt
    // threw from inside the action callback, or succeeded and only its verify failed).
    acted,
    // Page signature captured before the step's first action — the "before" of the delta.
    signature,
    // Set once the guard stops the ladder; surfaced on the failure so the agent is told the
    // page may already reflect a recovery attempt.
    blocked: null,
  };
}

// Decide whether a re-dispatch is allowed. Returns "recovered" when the step turns out to have
// already succeeded, "blocked" when acting again would risk doubling an effect, "go" otherwise.
async function guardDecision(page, step, inputs, baseline, guard) {
  if (!guard || !guard.guarded || !guard.acted) return "go";

  const verdict = await verifyStep(page, step, inputs, baseline);
  if (verdict.results.length) {
    // Post-conditions exist and ALL hold → the action landed; the earlier failure was a slow
    // render, not a broken step. Deliberately checks `results`, not `verdict.pass`: assertions
    // currently ship advisory-only, so `pass` stays true even when an advisory one fails.
    if (verdict.results.every(r => r.ok)) return "recovered";
    // A post-condition that does NOT hold is the author's own statement that the outcome did
    // not land — retry, exactly as before. This is the case test_recovery_verify.js pins.
    return "go";
  }

  // No post-condition to settle it. A page that moved after a possible dispatch is the only
  // evidence available, and it is ambiguous by nature — so treat it as "may already have acted"
  // and stop rather than clicking again to find out.
  const now = await capturePreStepSignature(page);
  if (signatureChanged(guard.signature, now)) {
    guard.blocked = "action-may-have-taken-effect";
    return "blocked";
  }
  return "go";
}

// The single choke point where recovery re-runs a step's action. Closing the "recovered but
// unverified" gap lives here: when the step carries a required (enforced) post-condition, a
// successful action re-run is not enough — the post-condition must re-hold before recovery is
// allowed to report success. Steps with no required assertion are unaffected (no new false
// failures on non-consequential steps).
async function recoverWithSelector(page, step, inputs, selector, onSuccess, baseline = null, guard = null) {
  if (!selector) return false;

  // EXEC-24: check BEFORE acting, not only after. Everything below this line may dispatch.
  const decision = await guardDecision(page, step, inputs, baseline, guard);
  if (decision === "blocked") return false;
  if (decision === "recovered") {
    if (onSuccess) onSuccess();
    return true;
  }

  try {
    await executeStep(page, stepWithSelector(step, selector), inputs);
    if (guard) guard.acted = true;
    if (hasRequiredAssertion(step)) {
      const verdict = await verifyStep(page, step, inputs, baseline);
      if (!verdict.pass) return false;
    }
    if (onSuccess) onSuccess();
    return true;
  } catch (err) {
    if (guard && err && err.mayHaveActed) guard.acted = true;
    return false;
  }
}

// Derive an element's accessible name from its recorded fingerprint for a11y recovery.
// Precedence must mirror the compiler's canonical derivation (identity_bundle.py:
// aria_label || name || inner_text || placeholder || label_text) and resolver.js's fpName.
// placeholder covers label-less inputs (e.g. a search box) that the compiler names from
// their placeholder text — without it here, recovery for exactly those elements sees an
// empty name and bails before ever trying. `label_text` is the nearest <label>/sibling
// context — for content elements (links, buttons) it is NOT the element's accessible name
// and can point at a neighbour (e.g. the blueprint link's label_text was mis-captured as
// "Project"), which would make `role=link[name="Project"]` recover the WRONG element. It
// stays only as a last resort for form controls whose accessible name legitimately comes
// from their label and whose inner_text/placeholder are both empty.
function a11yRecoveryName(fingerprint) {
  const fp = asObject(fingerprint);
  return String(fp.aria_label || fp.name || fp.inner_text || fp.placeholder || fp.label_text || "").trim();
}

async function recoverWithA11y(page, step, inputs, slug, stepIndex, tracker, baseline = null, guard = null) {
  const bundle = asObject(step.identity_bundle);
  const fingerprint = asObject(bundle.fingerprint);
  const role = String(fingerprint.role || "").trim();
  const name = a11yRecoveryName(fingerprint);
  if (!name) return false;

  // Re-probe by accessible name, but resolve THROUGH the pure matcher (fingerprint scoring +
  // strict uniqueness gate), never a raw `.first()` click. This is the architectural fix: a11y
  // recovery can no longer pick a wrong-but-name-matching node — a candidate must out-score the
  // recorded fingerprint and clear the uniqueness margin, exactly like primary resolution. We do
  // this by handing the matcher a synthetic bundle of the accessible-name signals while keeping
  // the recorded fingerprint + frame_chain so scoring and boundary context are unchanged.
  const signals = [];
  if (role) signals.push({ engine: "role", selector: `internal:role=${role}[name="${name}"]`, durability: 0.9 });
  signals.push({ engine: "text_based", selector: `internal:text="${name.slice(0, 80)}"`, durability: 0.8 });

  const method = role ? "a11y:role" : "a11y:text";
  const a11yStep = { ...step, identity_bundle: { ...bundle, signals } };
  delete a11yStep._explicit_selector;  // force the PRIMARY (matcher) path, not string mode

  // This stage calls executeStep directly rather than through recoverWithSelector, so it needs
  // the same pre-dispatch guard — it is a dispatch like any other (EXEC-24).
  const decision = await guardDecision(page, step, inputs, baseline, guard);
  if (decision === "blocked") return false;
  if (decision === "recovered") {
    appendRecoveryEvent({ event: "tier2_a11y", slug, step_index: stepIndex, recovery_method: "already-held" });
    return true;
  }

  try {
    await executeStep(page, a11yStep, inputs);
    if (guard) guard.acted = true;
    if (hasRequiredAssertion(step)) {
      const verdict = await verifyStep(page, step, inputs, baseline);
      if (!verdict.pass) return false;
    }
    appendRecoveryEvent({ event: "tier2_a11y", slug, step_index: stepIndex, recovery_method: method });
    tracker.emit("tier_ok", { si: stepIndex, tier: "tier2_a11y", sel: method });
    return true;
  } catch (err) {
    if (guard && err && err.mayHaveActed) guard.acted = true;
    return false;
  }
}

async function recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, skipSelector, tracker, baseline = null, guard = null) {
  for (const selector of fallbackSelectors(step)) {
    if (skipSelector && selector === skipSelector) continue;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 2, slug, step_index: stepIndex, recovery_selector: selector });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    }, baseline, guard);
    if (recovered) return true;
    // Each fallback is a DIFFERENT element; once the guard has stopped, walking the rest of the
    // list would be exactly the compounding-wrong-target case this whole change exists to stop.
    if (guard && guard.blocked) return false;
  }

  return false;
}

async function recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline = null, guard = null) {
  if (step.type !== "click" || !primarySelector) return false;

  for (const container of DIALOG_CONTAINERS) {
    const selector = `${container} ${primarySelector}`;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 3, slug, step_index: stepIndex, mode: "dialog" });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    }, baseline, guard);
    if (recovered) return true;
    if (guard && guard.blocked) return false;
  }

  return false;
}

async function recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline = null, guard = null) {
  const intent = [step.value, step.label, step.aria_label, step._intent]
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim())[0];
  const tagMatch = primarySelector.match(TEXT_MATCH_TAG_RE);
  const tagHint = tagMatch ? tagMatch[1].toLowerCase() : null;

  if (!intent || !tagHint) return false;

  try {
    const fuzzyIndex = await locatorEvaluateAll(page, step, inputs, tagHint, intent, (elements, needle) => {
      const lowerNeedle = needle.toLowerCase();
      return Array.from(elements).findIndex(element => {
        const text = (
          element.innerText ||
          element.value ||
          element.getAttribute("aria-label") ||
          element.getAttribute("placeholder") ||
          ""
        ).trim().toLowerCase();
        return text && (text === lowerNeedle || text.includes(lowerNeedle) || lowerNeedle.includes(text));
      });
    });

    if (fuzzyIndex < 0) return false;

    const selector = `${tagHint} >> nth=${fuzzyIndex}`;
    return await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 3, slug, step_index: stepIndex, mode: "fuzzy" });
      tracker.emit("rec_ok", { si: stepIndex, sc: "text_variant" });
    }, baseline, guard);
  } catch (_) {
    return false;
  }
}

// Layer 1 deterministic ladder: apply a single targeted remedy keyed off the exception class,
// then retry the primary selector once. Zero-token. Returns true if the retry succeeded.
async function layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr, baseline = null, guard = null) {
  const klass = classifyException(primaryErr);
  const remedy = remedyFor(klass);
  if (remedy === "descend-layer2") {
    // A verify-fail means the action itself already ran without throwing — the DOM is exactly
    // as it was when the post-condition check failed. Retrying the same primary selector here
    // would just re-run the identical action and re-fail the same check. Skip the single-remedy
    // L1 retry entirely and let the cascade fall through to L2's resolution-changing mechanisms
    // (a11y re-probe, fallback selectors, dialog scope, fuzzy text) below, each of which
    // re-verifies the post-condition via recoverWithSelector before reporting success.
    return false;
  }
  try {
    if (remedy === "scroll-into-view" && primarySelector) {
      // Scroll within the step's own resolved frame, not blindly the top-level page — a
      // selector match at top level (if any) is a different element than the one that's
      // actually out of view inside the iframe. If the frame chain itself can't be resolved
      // there's nothing sensible to scroll; fall through and let the retry below surface the
      // real failure instead of scrolling the wrong document.
      const scrollRoots = await rootCandidates(page, step, inputs);
      if (scrollRoots.length) {
        await scrollRoots[0].locator(primarySelector).first().scrollIntoViewIfNeeded({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
      }
    } else if (remedy === "dismiss-overlay") {
      // Historical remedy first, unchanged: Escape closes OS-style dialogs.
      await page.keyboard.press("Escape").catch(() => {});
      // EXEC-5 known-pattern ladder: a never-recorded popup is usually built from one of a
      // few ubiquitous consent toolkits — try their accept/close affordances (plus anything
      // previously learned on THIS host) before giving up on Tier 1. Zero-token by
      // construction; reactive only (we got here because something actually intercepted).
      try {
        const learned = learnedDismissals.selectorsFor(page.url());
        const hit = await dismissKnownOverlay(page, { learned });
        if (hit) {
          // Record every clicked candidate: the winning tail matters, and refreshing each
          // keeps the replay order stable for the next interception on this host.
          for (const selector of hit.selectors) learnedDismissals.record(page.url(), selector);
          appendRecoveryEvent({ event: "tier1_dismiss_pattern", slug,
            step_index: stepIndex, pattern: hit.selectors.join(" | "), source: hit.source });
        }
      } catch (_) {}
    } else if (remedy === "wait-stable" || remedy === "wait-enabled") {
      await page.waitForTimeout(300);
    } else if (remedy === "wait-navigation") {
      // The timeout carried Playwright's in-flight-navigation signature — give the page a
      // real chance to finish loading before retrying, instead of L2's fixed 250ms wait.
      await page.waitForLoadState("domcontentloaded", { timeout: SECONDARY_ACTION_TIMEOUT_MS }).catch(() => {});
    } else {
      return false; // re-resolve / retry-cascade handled by the broader cascade below
    }
  } catch (_) {
    return false;
  }
  const ok = await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "layer1_ladder", slug, step_index: stepIndex, remedy });
  }, baseline, guard);
  return ok ? remedy : false;
}

async function recoverStep(page, step, inputs, slug, stepIndex, primarySelector, tracker, primaryErr = null, cancelCheck = null, baseline = null, guard = null) {
  // Each Tier 1/2 stage is individually time-bounded, but the cascade as a whole can run for tens
  // of seconds. If the MCP client cancels mid-recovery (e.g. its request timed out), bail at the
  // next stage boundary instead of grinding through every remaining stage on a doomed run.
  const bail = () => { if (cancelCheck && cancelCheck()) throw Object.assign(new Error("Execution cancelled"), { cancelled: true }); };

  // EXEC-24 — a guard is always present so no stage has to null-check it. Callers that know
  // whether the primary attempt already dispatched (run.js) pass a seeded one.
  const g = guard || createActionGuard(step);
  // Once a stage refuses to re-dispatch, no later stage may act either: they differ only in HOW
  // they find an element, and the reason to stop is about the page, not the strategy.
  const stopped = () => !!g.blocked;

  // Layer 1 — deterministic exception ladder (targeted single remedy).
  // (Alternate-signal recovery is inherent: resolveStep already walks all bundle signals in
  // durability order, so there is no separate legacy compiled-selector tier.)
  const l1 = await layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr, baseline, g);
  if (l1) {
    tracker.emit("tier_ok", { si: stepIndex, tier: "layer1", sel: l1 });
    return { tier: "L1", method: l1 };
  }
  if (stopped()) return false;

  // EXEC-24 / the failure model's "no guess on irreversible actions" rule, implemented at last.
  // A destructive step (pay / delete / submit — flagged at compile time) gets Layer 1 and nothing
  // more: the L1 ladder's remedies are waits, scrolls and overlay dismissals plus ONE verified
  // retry of the recorded target. Everything below is "find something close" — a different
  // element chosen by accessible name, a positional nth= match, a fallback text variant — which
  // is the single worst thing to do to a Delete button. Fail closed and let a human or the agent
  // decide, rather than deleting the wrong row confidently.
  if (step.destructive === true) {
    g.blocked = g.blocked || "destructive-no-guess";
    appendRecoveryEvent({ event: "destructive_recovery_halted", slug, step_index: stepIndex });
    tracker.emit("rec_halt", { si: stepIndex, why: "destructive" });
    return false;
  }

  bail();
  if (await recoverWithA11y(page, step, inputs, slug, stepIndex, tracker, baseline, g)) return { tier: "L2", method: "a11y" };
  if (stopped()) return false;

  bail();
  await page.waitForTimeout(250);
  if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "transient_recovered", slug, step_index: stepIndex });
  }, baseline, g)) return { tier: "L2", method: "transient" };
  if (stopped()) return false;

  // Layer 2 — re-hover-then-retry (menu reveals), then the existing fallback mechanisms.
  if (asArray(asObject(step.handler_hints).hover_chain).length) {
    bail();
    await walkHoverChain(page, step, inputs);
    if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
      appendRecoveryEvent({ event: "layer2_rehover", slug, step_index: stepIndex });
    }, baseline, g)) return { tier: "L2", method: "rehover" };
    if (stopped()) return false;
  }

  bail();
  if (await recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline, g)) return { tier: "L2", method: "fallback" };
  if (stopped()) return false;
  bail();
  if (await recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline, g)) return { tier: "L2", method: "dialog" };
  if (stopped()) return false;
  bail();
  return (await recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline, g)) ? { tier: "L2", method: "fuzzy" } : false;
}

async function maybeCapturePreStep(page, step) {
  if (!INTERACTIVE_STEP_TYPES.has(step.type) || !CAPTURE_PRESTEP) return null;
  return page.screenshot({ type: "jpeg", quality: 70, timeout: 1000 }).catch(() => null);
}

module.exports = {
  createActionGuard,
  guardDecision,
  recoverWithSelector,
  a11yRecoveryName,
  recoverWithA11y,
  recoverWithFallbackSelectors,
  recoverWithDialogScope,
  recoverWithFuzzyText,
  layer1Ladder,
  recoverStep,
  maybeCapturePreStep,
};
