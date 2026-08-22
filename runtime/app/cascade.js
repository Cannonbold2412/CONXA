"use strict";
// Recovery cascade seam, extracted from run.js: the Tier 1 deterministic ladder
// and the Tier 2 zero-token mechanisms (a11y re-probe, fallback selectors,
// dialog scope, fuzzy text, re-hover), each closing through a verified action
// re-run. LLM fires at Tier 3+ only (AGENTS.md Key Invariants) — nothing in
// this module performs network I/O (CI-guarded by check_recovery_purity.js).
const { classifyException, remedyFor } = require("./recovery");
const { appendRecoveryEvent } = require("./recovery_log");
const { SECONDARY_ACTION_TIMEOUT_MS, CAPTURE_PRESTEP } = require("./run_config");
const { asObject, asArray } = require("./step_utils");
const { rootCandidates } = require("./resolution");
const {
  stepWithSelector,
  fallbackSelectors,
  walkHoverChain,
  locatorEvaluateAll,
} = require("./locators");
const { executeStep } = require("./handlers");
const { verifyStep, hasRequiredAssertion } = require("./assertions");

const INTERACTIVE_STEP_TYPES = new Set([
  "click", "dblclick", "right_click",
  "type", "fill", "focus", "select", "select_option",
  "set_checkbox", "set_radio", "date_pick",
  "drag_drop", "keyboard_shortcut", "upload",
]);

const DIALOG_CONTAINERS = ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', ".modal"];
const TEXT_MATCH_TAG_RE = /^(button|a|input|select|textarea)/i;

// The single choke point where recovery re-runs a step's action. Closing the "recovered but
// unverified" gap lives here: when the step carries a required (enforced) post-condition, a
// successful action re-run is not enough — the post-condition must re-hold before recovery is
// allowed to report success. Steps with no required assertion are unaffected (no new false
// failures on non-consequential steps).
async function recoverWithSelector(page, step, inputs, selector, onSuccess, baseline = null) {
  if (!selector) return false;

  try {
    await executeStep(page, stepWithSelector(step, selector), inputs);
    if (hasRequiredAssertion(step)) {
      const verdict = await verifyStep(page, step, inputs, baseline);
      if (!verdict.pass) return false;
    }
    if (onSuccess) onSuccess();
    return true;
  } catch (_) {
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

async function recoverWithA11y(page, step, inputs, slug, stepIndex, tracker, baseline = null) {
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

  try {
    await executeStep(page, a11yStep, inputs);
    if (hasRequiredAssertion(step)) {
      const verdict = await verifyStep(page, step, inputs, baseline);
      if (!verdict.pass) return false;
    }
    appendRecoveryEvent({ event: "tier2_a11y", slug, step_index: stepIndex, recovery_method: method });
    tracker.emit("tier_ok", { si: stepIndex, tier: "tier2_a11y", sel: method });
    return true;
  } catch (_) {
    return false;
  }
}

async function recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, skipSelector, tracker, baseline = null) {
  for (const selector of fallbackSelectors(step)) {
    if (skipSelector && selector === skipSelector) continue;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 2, slug, step_index: stepIndex, recovery_selector: selector });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    }, baseline);
    if (recovered) return true;
  }

  return false;
}

async function recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline = null) {
  if (step.type !== "click" || !primarySelector) return false;

  for (const container of DIALOG_CONTAINERS) {
    const selector = `${container} ${primarySelector}`;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 3, slug, step_index: stepIndex, mode: "dialog" });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    }, baseline);
    if (recovered) return true;
  }

  return false;
}

async function recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline = null) {
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
    }, baseline);
  } catch (_) {
    return false;
  }
}

// Layer 1 deterministic ladder: apply a single targeted remedy keyed off the exception class,
// then retry the primary selector once. Zero-token. Returns true if the retry succeeded.
async function layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr, baseline = null) {
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
      await page.keyboard.press("Escape").catch(() => {});
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
  }, baseline);
  return ok ? remedy : false;
}

async function recoverStep(page, step, inputs, slug, stepIndex, primarySelector, tracker, primaryErr = null, cancelCheck = null, baseline = null) {
  // Each Tier 1/2 stage is individually time-bounded, but the cascade as a whole can run for tens
  // of seconds. If the MCP client cancels mid-recovery (e.g. its request timed out), bail at the
  // next stage boundary instead of grinding through every remaining stage on a doomed run.
  const bail = () => { if (cancelCheck && cancelCheck()) throw Object.assign(new Error("Execution cancelled"), { cancelled: true }); };

  // Layer 1 — deterministic exception ladder (targeted single remedy).
  // (Alternate-signal recovery is inherent: resolveStep already walks all bundle signals in
  // durability order, so there is no separate legacy compiled-selector tier.)
  const l1 = await layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr, baseline);
  if (l1) {
    tracker.emit("tier_ok", { si: stepIndex, tier: "layer1", sel: l1 });
    return { tier: "L1", method: l1 };
  }

  bail();
  if (await recoverWithA11y(page, step, inputs, slug, stepIndex, tracker, baseline)) return { tier: "L2", method: "a11y" };

  bail();
  await page.waitForTimeout(250);
  if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "transient_recovered", slug, step_index: stepIndex });
  }, baseline)) return { tier: "L2", method: "transient" };

  // Layer 2 — re-hover-then-retry (menu reveals), then the existing fallback mechanisms.
  if (asArray(asObject(step.handler_hints).hover_chain).length) {
    bail();
    await walkHoverChain(page, step, inputs);
    if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
      appendRecoveryEvent({ event: "layer2_rehover", slug, step_index: stepIndex });
    }, baseline)) return { tier: "L2", method: "rehover" };
  }

  bail();
  if (await recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline)) return { tier: "L2", method: "fallback" };
  bail();
  if (await recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline)) return { tier: "L2", method: "dialog" };
  bail();
  return (await recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker, baseline)) ? { tier: "L2", method: "fuzzy" } : false;
}

async function maybeCapturePreStep(page, step) {
  if (!INTERACTIVE_STEP_TYPES.has(step.type) || !CAPTURE_PRESTEP) return null;
  return page.screenshot({ type: "jpeg", quality: 70, timeout: 1000 }).catch(() => null);
}

module.exports = {
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
