"use strict";
// Locator seam, extracted from run.js: the three control-flow modes behind
// withLocator (PRIMARY retry loop / agent-override validation / plain string),
// selector derivation helpers, and the small action helpers handlers use.
const { signalToLocator } = require("./resolve_adapter");
const { interpolate } = require("./interpolate");
const {
  ACTION_TIMEOUT_MS,
  SECONDARY_ACTION_TIMEOUT_MS,
  RECOVERY_LOCATOR_TIMEOUT_MS,
} = require("./run_config");
const { asObject, asArray, unique } = require("./step_utils");
const {
  PRIMARY,
  resolveStep,
  gateLocator,
  validateOverrideSelector,
  locatorCandidates,
  rootCandidates,
} = require("./resolution");

async function withLocator(page, step, inputs, selector, timeout, fn) {
  // PRIMARY identity-bundle path: late-bind resolve → gate → act, RE-TRIED within the action
  // budget. A transient state (target still hydrating, a menu still opening/animating) re-resolves
  // a fresh locator on each attempt instead of dumping straight into recovery — restoring, for the
  // scored multi-signal path, the auto-wait that string selectors get via waitFor. (Fixes the
  // Tier-1 timing race where step N+1 fired before step N's menu had finished opening.)
  if (selector === PRIMARY && !step._explicit_selector) {
    const deadline = Date.now() + (timeout || ACTION_TIMEOUT_MS);
    let lastErr = null;
    for (;;) {
      try {
        const locator = await resolveStep(page, step, inputs);   // one attempt; loop owns the wait
        await gateLocator(locator.first(), step);
        return await fn(locator);
      } catch (err) {
        lastErr = err;
        // Ambiguity / recompile-required / bad input cannot be fixed by waiting — surface
        // immediately rather than re-resolving until the action deadline.
        if (err && (err.ambiguous || err.recompileRequired || err.badInput)) throw err;
        if (Date.now() >= deadline) throw err;
        await page.waitForTimeout(120);
      }
    }
  }

  let candidates;
  if (selector === PRIMARY && step._agent_override) {
    // Agent-supplied recovery selector (Tier 3/4 closing edge) — gate it the same way the
    // primary path gates every compiled signal, instead of falling straight into plain
    // string-mode's unguarded .first().
    const validation = await validateOverrideSelector(page, step, inputs);
    if (!validation.valid) {
      const message = validation.reason === "frame-not-found"
        ? "The containing frame/iframe could not be located — cannot validate an element selector inside it"
        : validation.reason === "no-match"
          ? "Agent recovery selector matched no element on the page"
          : "Agent recovery selector was ambiguous (no candidate cleared the uniqueness margin)";
      throw Object.assign(
        new Error(message),
        { overrideValidationFailed: true, overrideReason: validation.reason, overrideCandidates: validation.candidates },
      );
    }
    candidates = [validation.loc];
  } else {
    // Explicit recovery selector (PRIMARY + _explicit_selector, non-agent) or plain string mode.
    candidates = selector === PRIMARY
      ? await locatorCandidates(page, step, inputs, step._explicit_selector)
      : await locatorCandidates(page, step, inputs, selector);
  }
  if (!candidates.length) throw new Error("Missing selector");

  let lastErr = null;
  for (const locator of candidates) {
    try {
      if (timeout && selector !== PRIMARY) await locator.first().waitFor({ state: "visible", timeout });
      await gateLocator(locator.first(), step);
      return await fn(locator);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error(`Locator not found: ${String(selector)}`);
}

async function withLocatorPair(page, step, inputs, srcSelector, dstSelector, timeout, fn) {
  const src = interpolate(srcSelector || "", inputs);
  const dst = interpolate(dstSelector || "", inputs);
  if (!src || !dst) throw new Error("Missing selector");

  let lastErr = null;
  for (const root of await rootCandidates(page, step, inputs)) {
    try {
      const srcLoc = root.locator(src);
      const dstLoc = root.locator(dst);
      if (timeout) {
        await srcLoc.first().waitFor({ state: "visible", timeout });
        await dstLoc.first().waitFor({ state: "visible", timeout });
      }
      return await fn(srcLoc, dstLoc);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error(`Locator pair not found: ${src} -> ${dst}`);
}

async function locatorEvaluateAll(page, step, inputs, selector, arg, fn) {
  let lastErr = null;
  for (const locator of await locatorCandidates(page, step, inputs, selector)) {
    try {
      return await locator.evaluateAll(fn, arg);
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;
  return -1;
}

async function tryLocator(page, selector, timeout, step = {}, inputs = {}) {
  try {
    await withLocator(page, step, inputs, selector, timeout || RECOVERY_LOCATOR_TIMEOUT_MS, async locator => locator.first());
    return true;
  } catch (_) {
    return false;
  }
}

function compiledSelectors(step, inputs) {
  return asArray(step.compiled_selectors)
    .filter(selector => typeof selector === "string" && selector.trim())
    .map(selector => interpolate(selector, inputs));
}

function baseSelector(step, inputs) {
  return interpolate(step.selector || step.css_selector || (step.target && step.target.css) || "", inputs);
}

function stepSelector(step, inputs) {
  const compiled = compiledSelectors(step, inputs);
  return compiled[0] || baseSelector(step, inputs);
}

function stepWithSelector(step, selector) {
  // Recovery injects an explicit selector — force string mode in withLocator/PRIMARY.
  return { ...step, _explicit_selector: selector };
}

function textSelector(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? `text=${JSON.stringify(text)}` : "";
}

function fallbackSelectors(step) {
  return unique([
    ...asArray(step.candidates),
    ...asArray(step.fallback_selectors),
    ...asArray(step.fallback_text_variants).map(value => textSelector(String(value))),
    ...[step.value, step.label, step.aria_label]
      .filter(value => typeof value === "string" && value.trim() && value.length < 60)
      .map(textSelector),
    ...asArray(step.anchors)
      .filter(anchor => anchor && typeof anchor.text === "string" && anchor.text.trim())
      .map(anchor => textSelector(anchor.text)),
  ]);
}

// Step executor helpers

async function runLocatorStep(page, step, inputs, action, selector = PRIMARY) {
  await withLocator(page, step, inputs, selector, 0, async locator => action(locator.first(), locator));
}

// True when the step has a resolvable primary target (identity_bundle signals or an explicit
// recovery selector) — used by optional-target handlers (scroll/focus).
function hasTarget(step, inputs) {
  if (step._explicit_selector) return true;
  return asArray(asObject(step.identity_bundle).signals).some(s => s && s.selector);
}

async function clickFirst(locator, options) {
  try {
    return await locator.first().click(options);
  } catch (err) {
    if (String(err).includes("intercepts pointer events")) {
      return locator.last().click({ ...options, timeout: SECONDARY_ACTION_TIMEOUT_MS });
    }
    throw err;
  }
}

function checkboxValue(step, inputs) {
  return String(interpolate(step.value || "true", inputs)).toLowerCase() !== "false";
}

// Phase 7: hover each element in the precompiled hover_chain before acting (menu reveals, etc.).
// Hover signals use Playwright grammar, so resolve each via signalToLocator (not raw locator()).
async function walkHoverChain(page, step, inputs) {
  const chain = asArray(asObject(step.handler_hints).hover_chain)
    .filter(sig => sig && sig.selector)
    .sort((a, b) => (b.durability || 0) - (a.durability || 0));
  const roots = await rootCandidates(page, step, inputs);
  for (const sig of chain) {
    try {
      for (const root of roots) {
        const loc = signalToLocator(root, sig, interpolate, inputs);
        if (!loc) continue;
        await loc.first().hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
        break;
      }
    } catch (err) {
      // Hover is best-effort — if the reveal element is gone the target may already be visible.
    }
  }
}

function parseDragSelectors(step, inputs) {
  let srcSelector = interpolate(step.src_selector || "", inputs);
  let dstSelector = interpolate(step.dst_selector || stepSelector(step, inputs), inputs);

  if (!srcSelector && step.value) {
    try {
      const parsed = JSON.parse(step.value);
      srcSelector = parsed.src_css || "";
      if (!dstSelector) dstSelector = parsed.dst_css || "";
    } catch (_) {}
  }

  return { srcSelector, dstSelector };
}

function parseKeyboardShortcut(value) {
  let keyStr = value;
  try {
    const parsed = JSON.parse(keyStr);
    const modifiers = parsed.modifiers || {};
    const parts = [];
    if (modifiers.ctrl) parts.push("Control");
    if (modifiers.meta) parts.push("Meta");
    if (modifiers.shift) parts.push("Shift");
    if (modifiers.alt) parts.push("Alt");
    if (parsed.key) parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
    if (parts.length) keyStr = parts.join("+");
  } catch (_) {}
  return keyStr;
}

module.exports = {
  PRIMARY,
  withLocator,
  withLocatorPair,
  locatorEvaluateAll,
  tryLocator,
  compiledSelectors,
  baseSelector,
  stepSelector,
  stepWithSelector,
  textSelector,
  fallbackSelectors,
  runLocatorStep,
  hasTarget,
  clickFirst,
  checkboxValue,
  walkHoverChain,
  parseDragSelectors,
  parseKeyboardShortcut,
};
