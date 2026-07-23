"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { mapErrorToCode } = require("./tracker");
const { classifyException, remedyFor, buildRepairEvent, CLASS, STALE_RE } = require("./recovery");
const { resolve: resolveSignals, scoreCandidate } = require("./resolver");
const { signalToLocator, gatherCandidates, bundleFingerprint, _extractDescriptor } = require("./resolve_adapter");
const { detectPreExecDrift } = require("./drift");
const pageScripts = require("./page_scripts");

const CONXA_DIR = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const CAPTURE_PRESTEP      = process.env.CONXA_CAPTURE_PRESTEP !== "0";
const ACTION_TIMEOUT_MS = envNumber("CONXA_ACTION_TIMEOUT_MS", 2500);
const SECONDARY_ACTION_TIMEOUT_MS = envNumber("CONXA_SECONDARY_ACTION_TIMEOUT_MS", 2500);
const RECOVERY_LOCATOR_TIMEOUT_MS = envNumber("CONXA_RECOVERY_LOCATOR_TIMEOUT_MS", 3000);
const PAGE_LOAD_TIMEOUT_MS = envNumber("CONXA_PAGE_LOAD_TIMEOUT_MS", 8000);

const RETRY_BUDGET_MAX = 3;
const DOWNLOAD_WAIT_TIMEOUT_MS = envNumber("CONXA_DOWNLOAD_WAIT_MS", 120000);
const RECOVERY_LOG = path.join(CONXA_DIR, "logs", "recovery.log");
const RECOVERY_LOG_MAX = 10 * 1024 * 1024;

const INTERACTIVE_STEP_TYPES = new Set([
  "click", "dblclick", "right_click",
  "type", "fill", "focus", "select", "select_option",
  "set_checkbox", "set_radio", "date_pick",
  "drag_drop", "keyboard_shortcut", "upload",
]);

const NOOP_STEP_TYPES = [
  "tab_open", "tab_switch", "popup", "frame_enter", "frame_exit",
  "upload_intent", "dialog_appeared", "dialog_accept",
  "dialog_dismiss", "file_chooser_opened", "clipboard_copy", "clipboard_paste",
];

// Step types that may trigger a real page navigation and need waitForLoadState after them
const NAVIGATION_STEP_TYPES = new Set([
  "navigate", "click", "dblclick", "right_click", "keyboard_shortcut",
  "if_present", "try_dismiss", "wait_for_one_of",
]);

const DIALOG_CONTAINERS = ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', ".modal"];
const TEXT_MATCH_TAG_RE = /^(button|a|input|select|textarea)/i;

// Retry budget (L0)

const retryBudget = new Map();

function checkRetryBudget(slug, stepIndex) {
  const key = `${slug}:${stepIndex}`;
  const attempts = (retryBudget.get(key) || 0) + 1;
  retryBudget.set(key, attempts);

  if (attempts <= RETRY_BUDGET_MAX) return true;

  appendRecoveryEvent({ event: "retry_budget_exhausted", slug, step_index: stepIndex });
  return false;
}

function clearRetryBudget(slug) {
  for (const key of retryBudget.keys()) {
    if (key.startsWith(`${slug}:`)) retryBudget.delete(key);
  }
}

// Recovery log

function appendRecoveryEvent(event) {
  try {
    fs.mkdirSync(path.dirname(RECOVERY_LOG), { recursive: true });
    if (fs.existsSync(RECOVERY_LOG) && fs.statSync(RECOVERY_LOG).size > RECOVERY_LOG_MAX) {
      fs.renameSync(RECOVERY_LOG, `${RECOVERY_LOG}.1`);
    }
    fs.appendFileSync(RECOVERY_LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
  } catch (_) {}
}

// Only wait for page load when the previous step could have triggered navigation.
async function waitForPageLoad(page, prevType) {
  if (!prevType || !NAVIGATION_STEP_TYPES.has(prevType)) return;

  await page.waitForLoadState("domcontentloaded", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});
  if (process.env.CONXA_WAIT_NETWORKIDLE === "1") {
    await page.waitForLoadState("networkidle", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});
  }
}

// Selector helpers

// Grammar must match conxa_compile/editor/placeholder_grammar.py PLACEHOLDER_RE exactly —
// a looser runtime grammar let hyphenated/spaced {{ids}} interpolate here while staying
// invisible to the compiler/UI scanners and always resolving to "" (audit finding C3).
function interpolate(value, inputs) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => String(inputs[key] ?? ""));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Frame roots are driven solely by identity_bundle.frame_chain (durability-ranked signals per
// iframe level). Each frame signal selector is a CSS attribute selector (iframe[name=…] etc.),
// so it feeds frameLocator() directly.
//
// Async because it must actually VERIFY each iframe element exists (root.locator(selector).count())
// before descending into it with frameLocator() — frameLocator() itself is lazy and happily hands
// back a usable-looking FrameLocator for a selector that matches nothing, so relying on it alone
// can never distinguish "the frame is gone/churned to a new identity" from "the frame exists and
// has content" (confirmed: a synthetic test with a frame_chain selector matching no real iframe
// still produced a non-empty roots array before this check was added, since frameLocator()
// construction never fails on its own).
async function rootCandidates(page, step, inputs) {
  const frameChain = asArray(asObject(step && step.identity_bundle).frame_chain);
  if (!frameChain.length) return [page];

  let roots = [page];
  for (const frameSpec of frameChain) {
    const sigs = asArray(frameSpec.signals)
      .filter(s => s && s.selector)
      .sort((a, b) => (b.durability || 0) - (a.durability || 0));
    const next = [];
    for (const root of roots) {
      if (!root || typeof root.frameLocator !== "function") continue;
      for (const s of sigs) {
        const selector = interpolate(String(s.selector), inputs);
        let exists = false;
        try { exists = (await root.locator(selector).count()) > 0; } catch (_) { exists = false; }
        if (!exists) continue;
        next.push(root.frameLocator(selector));
      }
    }
    roots = next;
    if (!roots.length) break;
  }

  // A non-empty frame_chain that resolved to zero roots means the containing iframe itself
  // could not be located (e.g. its identifying attribute churned to a new value on reattach).
  // This must NOT silently fall back to the top-level page — a same-selector element there
  // could be wrongly acted on in place of a target that actually lives in a frame we lost
  // track of. Return [] (distinct from the "no frame_chain at all" case above, which correctly
  // returns [page]) so callers can diagnose "frame not found" instead of a generic miss.
  return roots;
}

// True only when the step's own frame_chain exists but rootCandidates() came back empty — i.e.
// the frame lookup itself failed, not just "no frame_chain to resolve" (that returns [page]).
function isFrameNotFound(step, roots) {
  return asArray(asObject(step && step.identity_bundle).frame_chain).length > 0 && roots.length === 0;
}

async function locatorCandidates(page, step, inputs, selector) {
  const resolved = interpolate(selector || "", inputs);
  if (!resolved) return [];
  const roots = await rootCandidates(page, step, inputs);
  return roots.map(root => root.locator(resolved));
}

// Sentinel selector marking "resolve the step's primary target via identity_bundle.signals".
const PRIMARY = Symbol("primary-target");

// Resolve the step's primary target through the pure resolver over the live DOM.
// Returns a single Playwright locator for the chosen element, or throws a classified error.
async function resolveStep(page, step, inputs) {
  const bundle = asObject(step.identity_bundle);
  const signals = asArray(bundle.signals).filter(s => s && s.selector);
  if (!signals.length) {
    throw Object.assign(
      new Error("Step has no identity_bundle.signals — pack must be recompiled"),
      { recompileRequired: true },
    );
  }
  const roots = await rootCandidates(page, step, inputs);
  if (isFrameNotFound(step, roots)) {
    throw Object.assign(
      new Error("Containing frame could not be located (identity may have changed)"),
      { frameNotFound: true },
    );
  }
  const map = await gatherCandidates(roots, signals, interpolate, inputs);
  const fp = bundleFingerprint(bundle);
  const result = resolveSignals(signals, fp, { queryAll: sel => map[sel] || [] }, {});
  if (result && result.node && result.node._loc) {
    return result.node._loc;
  }
  if (result && result.ambiguous) {
    throw Object.assign(new Error("Ambiguous element resolution (no signal cleared uniqueness gate)"), { ambiguous: true });
  }
  throw Object.assign(new Error("Element not found (resolve miss)"), { resolveMiss: true });
}

const GATE_ENABLED = process.env.CONXA_GATE !== "0";
const GATE_BUDGET_MS = envNumber("CONXA_GATE_BUDGET_MS", 600);

// Phase 8: pre-action GATE — confirm the element is attached, visible, RAF-stable, and enabled
// before acting. Budget is confidence-adaptive (a high-confidence step gets a shorter wait).
// Best-effort: gate failures throw so the caller can try the next candidate / recovery.
async function gateLocator(loc, step) {
  if (!GATE_ENABLED) return;
  const conf = Number(asObject(step).confidence);
  const budget = Number.isFinite(conf) && conf >= 0.85
    ? Math.round(GATE_BUDGET_MS / 2)
    : GATE_BUDGET_MS;

  await loc.waitFor({ state: "visible", timeout: budget });

  // RAF-stable: bounding box must be unchanged across two animation frames.
  try {
    const stable = await loc.evaluate(pageScripts.rafStable);
    if (!stable) {
      await loc.waitFor({ state: "visible", timeout: budget }); // settle once more
    }
  } catch (_) {
    // evaluate may fail on detach — let the action path surface the real error.
  }

  // Enabled: reject disabled / aria-disabled controls.
  try {
    const disabled = await loc.evaluate(pageScripts.isDisabled);
    if (disabled) throw new Error("Element is disabled");
  } catch (err) {
    const msg = String((err && err.message) || "");
    // A detach here means the element vanished between the RAF-stability check and
    // this one — the caller must see that, not proceed to act on a stale locator.
    if (err && (/disabled/i.test(msg) || STALE_RE.test(msg.toLowerCase()))) throw err;
  }
}

// Matches resolver.js's DEFAULT_UNIQUE_MARGIN/DEFAULT_CONFIDENCE_THRESHOLD (not imported —
// those defaults are private to resolve()'s own control flow, which has different single-
// candidate semantics than the ad-hoc single-selector check below).
const OVERRIDE_UNIQUE_MARGIN = 0.15;
const OVERRIDE_CONFIDENCE_THRESHOLD = 0.5;

// Validates an agent-supplied recovery selector (`step._explicit_selector` + `_agent_override`)
// against the step's recorded fingerprint before it is allowed to act. Extends the "resolver
// never blindly picks candidate[0]" invariant (resolver.js) to the Tier 3/4 closing edge —
// without this, a multi-match override selector silently acted on whatever `.first()` returned.
async function validateOverrideSelector(page, step, inputs) {
  const selector = interpolate(step._explicit_selector || "", inputs);
  if (!selector) return { valid: false, reason: "missing-selector", candidates: [] };

  const roots = await rootCandidates(page, step, inputs);
  if (isFrameNotFound(step, roots)) {
    // Distinct from "no-match": the agent's selector was never even tried, because the
    // containing frame itself couldn't be located — telling the agent "no element matched"
    // here would be misleading (it would keep proposing element selectors forever, when the
    // real problem is the frame is gone/changed identity).
    return { valid: false, reason: "frame-not-found", candidates: [] };
  }

  const descriptors = [];
  for (const root of roots) {
    let all;
    try { all = await root.locator(selector).all(); } catch (_) { continue; }
    for (const item of all) {
      let d;
      try { d = await item.evaluate(_extractDescriptor); } catch (_) { continue; }
      if (!d) continue;
      d._loc = item;
      descriptors.push(d);
    }
  }

  if (!descriptors.length) return { valid: false, reason: "no-match", candidates: [] };
  if (descriptors.length === 1) return { valid: true, loc: descriptors[0]._loc };

  const fp = bundleFingerprint(asObject(step.identity_bundle));
  const scored = descriptors
    .map(d => ({ d, s: scoreCandidate(d, fp) }))
    .sort((a, b) => b.s - a.s);
  const margin = scored[0].s - (scored[1] ? scored[1].s : 0);
  if (margin >= OVERRIDE_UNIQUE_MARGIN && scored[0].s >= OVERRIDE_CONFIDENCE_THRESHOLD) {
    return { valid: true, loc: scored[0].d._loc };
  }
  return {
    valid: false,
    reason: "ambiguous",
    candidates: descriptors.slice(0, 20).map(d => ({ role: d.role, name: d.name, text: d.text, testid: d.testid })),
  };
}

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
        // Ambiguity / recompile-required cannot be fixed by waiting — surface immediately.
        if (err && (err.ambiguous || err.recompileRequired)) throw err;
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

// Recovery embedding

function enrichStepsWithRecovery(steps, recovery) {
  if (!Array.isArray(steps)) return steps;

  const recSteps = asArray(recovery && recovery.steps);
  return steps.map((step, idx) => {
    const rec = recSteps.find(item => Number(item && item.step_id) === idx + 1);
    if (!rec) return step;

    const selectorContext = asObject(rec.selector_context);
    const fallback = asObject(rec.fallback);
    const textVariants = asArray(fallback.text_variants)
      .filter(text => typeof text === "string" && text.trim());
    const recCandidates = unique([
      selectorContext.primary,
      ...asArray(selectorContext.alternatives),
    ]);

    return {
      ...step,
      candidates: unique([...asArray(step.candidates), ...recCandidates]),
      fallback_selectors: [
        ...asArray(step.fallback_selectors),
        ...textVariants.map(textSelector),
      ],
      anchors: asArray(rec.anchors).filter(anchor => anchor && typeof anchor.text === "string" && anchor.text.trim()),
      _intent: rec.intent || "",
      _visual_ref: rec.visual_ref || "",
    };
  });
}

// Agent-recovery overrides (Tier 3/4 closing edge)
//
// When the in-process cascade (T1/T2) is exhausted the runtime hands a structured recovery
// request to the MCP agent, which identifies the correct element and resumes with a corrected
// selector for the failing step. `step_overrides` is a map keyed by the 0-based step index
// (the same value passed as `resume_from`) → { selector }. We inject the chosen selector via
// the existing `_explicit_selector` channel so it flows through the normal string-mode path in
// withLocator — frame_chain, gating, and pacing are all preserved. This is the closing edge of
// the four-tier cascade: without it, T3/T4 can describe the fix but never apply it.
function applyStepOverrides(steps, overrides) {
  if (!Array.isArray(steps) || !overrides || typeof overrides !== "object") return steps;
  const out = steps.slice();
  for (const [rawKey, rawVal] of Object.entries(overrides)) {
    const idx = Number(rawKey);
    if (!Number.isInteger(idx) || idx < 0 || idx >= out.length) continue;
    const selector = rawVal && typeof rawVal === "object" ? rawVal.selector : rawVal;
    if (typeof selector !== "string" || !selector.trim()) continue;
    out[idx] = { ...out[idx], _explicit_selector: selector.trim(), _agent_override: true };
  }
  return out;
}

// Step executor

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

// Branch primitives (if_present, try_dismiss, wait_for_one_of): probe an element's presence
// without ever throwing, so callers stay outside the recovery cascade (recoverStep only fires
// on a throw escaping runPlan's per-step try — see Key Invariants). probeSpec is a step-shaped
// object: identity_bundle.signals take priority (resolved like a real target), else a plain
// selector/css_selector/target.css string. Polls up to timeoutMs via the existing pollPositive.
async function probePresent(page, probeSpec, inputs, timeoutMs) {
  const spec = asObject(probeSpec);
  const budget = Math.max(0, Number(timeoutMs) || 0);
  const bundle = asObject(spec.identity_bundle);
  if (asArray(bundle.signals).some(s => s && s.selector)) {
    return pollPositive(async () => {
      try { await resolveStep(page, spec, inputs); return true; } catch (_) { return false; }
    }, budget);
  }
  const selector = baseSelector(spec, inputs);
  if (!selector) return false;
  const candidates = await locatorCandidates(page, spec, inputs, selector);
  if (!candidates.length) return false;
  return pollPositive(async () => {
    for (const locator of candidates) {
      try {
        if ((await locator.count()) > 0) return true;
      } catch (_) {}
    }
    return false;
  }, budget);
}

// Interactive handlers (click/fill/...) always resolve PRIMARY via identity_bundle.signals and
// throw immediately if none exist (withLocator never falls back to a bare selector unless
// _explicit_selector is set — see withLocator). Branch bodies are hand-authored/foundation-scope
// steps that typically carry only a plain selector, so force string mode exactly like recovery's
// stepWithSelector does, or the nested action would always fail with "pack must be recompiled".
function resolvableBranchStep(step, inputs) {
  if (!step || step._explicit_selector) return step;
  if (asArray(asObject(step.identity_bundle).signals).some(s => s && s.selector)) return step;
  const selector = baseSelector(step, inputs);
  return selector ? stepWithSelector(step, selector) : step;
}

// Runs a branch body best-effort: each nested step's own failure is swallowed so the branch
// never escalates to recovery — a failed cookie-banner dismissal should not burn a paid Tier
// 3/4 recovery cycle. Nested steps use the same flat runtime step shape as top-level steps.
async function runBranchBody(page, steps, inputs, ctx) {
  for (const nested of asArray(steps)) {
    if (!nested || typeof nested !== "object") continue;
    try {
      await executeStep(page, resolvableBranchStep(nested, inputs), inputs, ctx);
    } catch (_) {
      // best-effort — do not propagate; branch bodies never enter Tier 1-4 recovery.
    }
  }
}

const HANDLERS = {
  wait: async (page, step) => {
    await page.waitForTimeout(Math.min(Number(step.ms) || 250, 1000));
  },

  navigate: async (page, step, inputs) => {
    await page.goto(interpolate(step.url || "", inputs), { timeout: 15000, waitUntil: "domcontentloaded" });
  },

  scroll: async (page, step, inputs) => {
    if (hasTarget(step, inputs)) {
      await withLocator(page, step, inputs, PRIMARY, 0, async locator => {
        await locator.first().scrollIntoViewIfNeeded({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
      }).catch(() => {});
    } else {
      const deltaX = Number(step.delta_x) || 0;
      const deltaY = Number(step.delta_y) || 0;
      await page.evaluate(pageScripts.scrollBy, [deltaX, deltaY]);
    }
  },

  fill: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.fill(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    });
  },

  type: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.fill(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    });
  },

  click: async (page, step, inputs) => {
    await walkHoverChain(page, step, inputs);
    await withLocator(page, step, inputs, PRIMARY, 0, async locator => {
      await clickFirst(locator, { timeout: ACTION_TIMEOUT_MS });
    });
  },

  dblclick: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.dblclick({ timeout: ACTION_TIMEOUT_MS });
    });
  },

  right_click: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.click({ button: "right", timeout: ACTION_TIMEOUT_MS });
    });
  },

  hover: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
    });
  },

  select: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.selectOption(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    });
  },

  select_option: async (page, step, inputs) => {
    await HANDLERS.select(page, step, inputs);
  },

  focus: async (page, step, inputs) => {
    if (hasTarget(step, inputs)) {
      await withLocator(page, step, inputs, PRIMARY, 0, async locator => {
        const first = locator.first();
        try {
          await first.click({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
        } catch (_) {
          await first.focus({ timeout: SECONDARY_ACTION_TIMEOUT_MS }).catch(() => {});
        }
      });
    }
  },

  set_checkbox: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.setChecked(checkboxValue(step, inputs), { timeout: ACTION_TIMEOUT_MS });
    });
  },

  set_radio: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.click({ timeout: ACTION_TIMEOUT_MS });
    });
  },

  date_pick: async (page, step, inputs) => {
    const value = interpolate(step.value || "", inputs);
    await runLocatorStep(page, step, inputs, async locator => {
      try {
        await locator.fill(value, { timeout: ACTION_TIMEOUT_MS });
      } catch (_) {
        await locator.click({ timeout: SECONDARY_ACTION_TIMEOUT_MS }).catch(() => {});
      }
    });
  },

  drag_drop: async (page, step, inputs) => {
    const { srcSelector, dstSelector } = parseDragSelectors(step, inputs);
    if (srcSelector && dstSelector) {
      await withLocatorPair(page, step, inputs, srcSelector, dstSelector, 0, (srcLoc, dstLoc) => {
        return srcLoc.first().dragTo(dstLoc.first(), { timeout: ACTION_TIMEOUT_MS });
      });
    }
  },

  keyboard_shortcut: async (page, step, inputs) => {
    const keyStr = parseKeyboardShortcut(interpolate(step.value || "", inputs));
    if (keyStr) await page.keyboard.press(keyStr, { delay: 50 });
  },

  check: async (page, step, inputs) => {
    const pattern = interpolate(step.pattern || step.check_pattern || "", inputs);
    if (pattern && !new RegExp(pattern).test(page.url())) {
      throw new Error(`URL check failed: ${page.url()} does not match ${pattern}`);
    }
  },

  assert: async (page, step, inputs) => {
    const kind = step.assert_kind || step.kind || "url";
    if (kind === "url") {
      const pattern = interpolate(step.pattern || step.value || "", inputs);
      if (pattern && !new RegExp(pattern).test(page.url())) {
        throw new Error(`Assert failed: URL ${page.url()} does not match ${pattern}`);
      }
      return;
    }

    const hasTgt = hasTarget(step, inputs);
    if ((kind === "selector" || kind === "visible") && hasTgt) {
      await withLocator(page, step, inputs, PRIMARY, step.timeout || SECONDARY_ACTION_TIMEOUT_MS, async locator => locator.first());
      return;
    }

    if (kind === "text" && hasTgt) {
      const expected = interpolate(step.value || "", inputs);
      if (!expected) return;

      const actual = await withLocator(page, step, inputs, PRIMARY, 0, locator => {
        return locator.first().innerText({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
      }).catch(() => "");
      if (!actual.includes(expected)) {
        throw new Error(`Assert text: "${actual}" does not include "${expected}"`);
      }
    }
  },

  screenshot: async (page) => {
    await page.screenshot({ type: "png", timeout: SECONDARY_ACTION_TIMEOUT_MS }).catch(() => null);
  },

  upload: async (page, step, inputs) => {
    const filePath = interpolate(step.value || "", inputs);
    if (!filePath) return;

    await runLocatorStep(page, step, inputs, locator => {
      return locator.setInputFiles(filePath, { timeout: ACTION_TIMEOUT_MS });
    });
  },

  // Optional interstitial handling (cookie/consent banners, session-expired screens, optional
  // MFA, A/B variants) — see Key Invariants: branch bodies are best-effort and never enter the
  // Tier 1-4 recovery cascade, since neither this handler nor runBranchBody ever throws.
  if_present: async (page, step, inputs, ctx) => {
    const timeout = Number(step.timeout_ms) || 1500;
    if (await probePresent(page, step, inputs, timeout)) {
      await runBranchBody(page, step.steps, inputs, ctx);
    }
  },

  try_dismiss: async (page, step, inputs) => {
    const timeout = Number(step.timeout_ms) || 800;
    const candidates = unique([...asArray(step.candidates), baseSelector(step, inputs)]);
    for (const selector of candidates) {
      if (!selector) continue;
      try {
        const probeSpec = { selector };
        if (!(await probePresent(page, probeSpec, inputs, timeout))) continue;
        const locator = (await locatorCandidates(page, probeSpec, inputs, selector))[0];
        if (!locator) continue;
        await locator.first().click({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
        return;
      } catch (_) {
        // best-effort — try the next candidate
      }
    }
    if (step.fallback_escape !== false) {
      await page.keyboard.press("Escape").catch(() => {});
    }
  },

  wait_for_one_of: async (page, step, inputs, ctx) => {
    const timeout = Number(step.timeout_ms) || 5000;
    const options = asArray(step.options);
    let matched = null;
    const found = await pollPositive(async () => {
      for (const option of options) {
        if (option && (await probePresent(page, option, inputs, 0))) {
          matched = option;
          return true;
        }
      }
      return false;
    }, timeout);
    if (found && matched) {
      await runBranchBody(page, matched.steps, inputs, ctx);
      return;
    }
    if (step.required) {
      throw new Error("wait_for_one_of: none of the candidate selectors appeared before timeout");
    }
  },
};

for (const type of NOOP_STEP_TYPES) {
  HANDLERS[type] = async () => {};
}

HANDLERS["download_observed"] = async (_page, _step, _inputs, ctx) => {
  const queue = ctx && ctx.downloadQueue;
  if (!queue || !queue.length) return;
  const pending = queue.shift();
  await Promise.race([
    pending,
    new Promise(resolve => setTimeout(resolve, DOWNLOAD_WAIT_TIMEOUT_MS)),
  ]);
};

async function executeStep(page, step, inputs, ctx = {}) {
  const handler = HANDLERS[step.type];
  if (handler) await handler(page, step, inputs, ctx);
}

// Phase 8: post-action VERIFY — check compiled post-condition assertions independently of the
// action's own success. Returns { pass, channel, evidence }. Absent assertions → pass (no-op).
function stepAssertions(step) {
  const v = asObject(step.validation);
  const fromValidation = asArray(v.assertions);
  const direct = asArray(step.assertions);
  return [...fromValidation, ...direct].filter(a => a && typeof a === "object");
}

// Normalize for value_equals comparison: trim, collapse internal whitespace, lowercase.
// Tolerates recorded values that differ only in incidental whitespace/case.
function normText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const STATE_CHANGED_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]';
// Tolerance on body-text length delta so timestamp/clock-driven page noise (e.g. a live "2s ago"
// widget) doesn't register as a state change on its own.
const STATE_CHANGED_TEXT_LEN_TOLERANCE = 20;

// Cheap, deterministic snapshot of page shape used only to answer "did anything happen" for the
// state_changed assertion. No LLM, no DOM diffing — three counters compared before vs. after.
async function capturePreStepSignature(page) {
  try {
    const url = page.url();
    const { textLen, interactiveCount } = await page.evaluate(pageScripts.preStepSignature, STATE_CHANGED_SELECTOR);
    return { url, textLen, interactiveCount };
  } catch (_) {
    return null;
  }
}

// Web-first polling for assertions that don't already poll internally (selector_present rides
// Playwright's own waitFor). Positive checks retry the predicate until it holds or the timeout
// elapses instead of sampling once — a slow render or an optimistic-UI update that lands 400ms
// after the action no longer reads as a required-assertion failure.
const VERIFY_POLL_INTERVAL_MS = 250;
// Negative checks (selector_absent, text_absent) can be trivially true while the page is still
// mid-load (nothing has rendered yet). Requiring the absence to hold through a short stabilization
// window after the first "absent" reading avoids a false pass that a moment later would flip back.
const NEGATIVE_STABILIZE_MS = 500;

async function pollPositive(checkFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let result = false;
    try { result = await checkFn(); } catch (_) { result = false; }
    if (result) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(r => setTimeout(r, Math.min(VERIFY_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()))));
  }
}

async function pollNegative(checkAbsentFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let absentNow = false;
    try { absentNow = await checkAbsentFn(); } catch (_) { absentNow = false; }
    if (absentNow) {
      await new Promise(r => setTimeout(r, NEGATIVE_STABILIZE_MS));
      let stillAbsent = false;
      try { stillAbsent = await checkAbsentFn(); } catch (_) { stillAbsent = false; }
      if (stillAbsent) return true;
      // Reappeared during the stabilization window — keep polling if time remains.
    }
    if (Date.now() >= deadline) return false;
    await new Promise(r => setTimeout(r, Math.min(VERIFY_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()))));
  }
}

// Presence-style locator check across every candidate frame root — true as soon as ANY root has
// a match. Used for selector_present/text_present, where the target is expected to exist
// SOMEWHERE among the roots (usually just [page], or the step's resolved frame chain).
async function anyRootHasMatch(roots, target) {
  for (const root of roots) {
    try {
      if ((await root.locator(target).count()) > 0) return true;
    } catch (_) { /* try next root */ }
  }
  return false;
}

async function evaluateAssertion(roots, page, a, inputs, baseline) {
  const type = String(a.type || "").toLowerCase();
  const target = interpolate(String(a.target || a.pattern || a.url || a.selector || a.text || ""), inputs);
  const required = a.required !== false;
  const timeout = Number(a.timeout_ms) || 3000;
  const startedAt = Date.now();
  let ok = true;

  try {
    if (type === "url_changed" || type === "url_exact") {
      ok = await pollPositive(() => page.url() === target || (!!target && page.url().startsWith(target)), timeout);
    } else if (type === "url_pattern" || type === "url") {
      ok = !target || await pollPositive(() => new RegExp(target).test(page.url()), timeout);
    } else if (type === "selector_present") {
      ok = await pollPositive(() => anyRootHasMatch(roots, target), timeout);
    } else if (type === "selector_absent") {
      // Absent must hold in EVERY root, not just one — otherwise a root where it never existed
      // would trivially satisfy "absent" while it's still very much present in another.
      ok = await pollNegative(async () => !(await anyRootHasMatch(roots, target)), timeout);
    } else if (type === "text_present") {
      ok = await pollPositive(() => anyRootHasMatch(roots, `text=${JSON.stringify(target)}`), timeout);
    } else if (type === "text_absent") {
      ok = await pollNegative(async () => !(await anyRootHasMatch(roots, `text=${JSON.stringify(target)}`)), timeout);
    } else if (type === "value_equals") {
      const expected = interpolate(String(a.expected ?? ""), inputs);
      const normExpected = normText(expected);
      ok = await pollPositive(async () => {
        for (const root of roots) {
          try {
            const actual = await root.locator(target).first().inputValue({ timeout: VERIFY_POLL_INTERVAL_MS });
            const normActual = normText(actual);
            // Normalized-exact match, else fall back to "field contains expected" — tolerates
            // masked/formatted fields (phone, currency) whose raw value never equals the typed text.
            if (normActual === normExpected || (!!normExpected && normActual.includes(normExpected))) return true;
          } catch (_) { /* try next root */ }
        }
        return false;
      }, timeout);
    } else if (type === "state_changed") {
      // No compile-time target — confirms the action produced SOME observable effect (URL,
      // interactive-element count, or a non-trivial body-text delta) rather than silently
      // no-opping. Only meaningful when a pre-action baseline was captured.
      if (!baseline) {
        ok = true; // no baseline captured (e.g. resumed mid-run) — don't fail on a technicality
      } else {
        ok = await pollPositive(async () => {
          const after = await capturePreStepSignature(page);
          return !after
            ? true
            : after.url !== baseline.url ||
              after.interactiveCount !== baseline.interactiveCount ||
              Math.abs(after.textLen - baseline.textLen) > STATE_CHANGED_TEXT_LEN_TOLERANCE;
        }, timeout);
      }
    }
  } catch (err) {
    ok = false;
  }

  return { type, target, required, ok, elapsed_ms: Date.now() - startedAt };
}

async function verifyStep(page, step, inputs, baseline = null) {
  const assertions = stepAssertions(step);
  if (!assertions.length) return { pass: true, channel: "none", evidence: "no-assertions", results: [] };

  // A post-condition for a step whose action happened inside an iframe is almost always about
  // that same iframe (a confirmation message, a field's new value, ...) — resolve assertions
  // against the step's own frame chain, not blindly the top-level page. Unlike action resolution
  // (rootCandidates/resolveStep), a broken frame lookup here falls back to [page] rather than
  // failing outright: verification has no "wrong click" risk, only a "checked the wrong document"
  // risk, which naturally surfaces as a failed assertion rather than corrupting page state.
  const frameRoots = await rootCandidates(page, step, inputs);
  const roots = frameRoots.length ? frameRoots : [page];

  // Every assertion is evaluated — not just up to the first required failure — so a failed step
  // carries a full audit of what held and what didn't (advisory included). This is the dataset the
  // fleet dashboard needs to see an assertion decaying before it becomes a hard failure.
  const results = [];
  let failing = null;
  for (const a of assertions) {
    const result = await evaluateAssertion(roots, page, a, inputs, baseline);
    results.push(result);
    if (!result.ok && result.required && !failing) failing = result;
  }

  if (failing) {
    return { pass: false, channel: failing.type, evidence: failing.target, results };
  }
  return { pass: true, channel: "all", evidence: `${assertions.length} assertion(s)`, results };
}

// Whether any assertion on this step is required (enforced) — gates the extra cost of capturing
// a pre-action baseline and of re-verifying after a recovery remedy.
function hasRequiredAssertion(step) {
  return stepAssertions(step).some(a => a && a.required !== false);
}

function needsStateChangedBaseline(step) {
  return stepAssertions(step).some(a => a && String(a.type || "").toLowerCase() === "state_changed" && a.required !== false);
}

// Recovery cascade

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
// aria_label || name || inner_text) and resolver.js's fpName. `label_text` is the nearest
// <label>/sibling context — for content elements (links, buttons) it is NOT the element's
// accessible name and can point at a neighbour (e.g. the blueprint link's label_text was
// mis-captured as "Project"), which would make `role=link[name="Project"]` recover the
// WRONG element. It stays only as a last resort for form controls whose accessible name
// legitimately comes from their label and whose inner_text is empty.
function a11yRecoveryName(fingerprint) {
  const fp = asObject(fingerprint);
  return String(fp.aria_label || fp.name || fp.inner_text || fp.label_text || "").trim();
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

const FRAME_INVENTORY_CAP = 50;
const FRAME_INVENTORY_PER_ROOT_CAP = 25;

// Frame-scoped counterpart of pageScripts.domInventory() — for a step whose target lives inside
// an iframe, document.querySelectorAll (what domInventory runs) cannot see into it at all, so
// the Tier 3+ agent's "ground truth" inventory would silently omit everything in that frame.
// Gathers the same kind of interactive-element summary, scoped to the step's own resolved frame
// chain, using the same Locator-based pattern resolve_adapter.js already uses for candidate
// gathering (root.locator(...).all() + per-item .evaluate()) — FrameLocator has no direct
// raw-Frame conversion, so this is the correct mechanism, not a workaround.
// Returns null when the step has no frame_chain (nothing extra to gather) or the frame couldn't
// be located at all (a distinct "frame not found" condition surfaced separately — see
// isFrameNotFound/frameNotFound — not silently reported as an empty inventory).
async function frameScopedInventory(page, step, inputs) {
  const frameChain = asArray(asObject(step && step.identity_bundle).frame_chain);
  if (!frameChain.length) return null;

  const roots = await rootCandidates(page, step, inputs);
  if (!roots.length) return null;

  const seen = new Set();
  const out = [];
  for (const root of roots) {
    if (out.length >= FRAME_INVENTORY_CAP) break;
    let items;
    try { items = await root.locator(pageScripts.INVENTORY_SELECTOR).all(); } catch (_) { continue; }
    for (const item of items.slice(0, FRAME_INVENTORY_PER_ROOT_CAP)) {
      if (out.length >= FRAME_INVENTORY_CAP) break;
      let entry;
      try { entry = await item.evaluate(pageScripts.inventoryEntryForElement); } catch (_) { continue; }
      if (!entry) continue;
      const key = `${entry.tag}|${entry.type || ""}|${entry.text || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

// Capture the interactive-element inventory at the exact moment of step failure, before the
// T1/T2 recovery cascade runs (~12 s). Transient elements like open dropdown menus auto-close
// during the cascade, leaving _buildFailureResponse with an empty DOM scan. Storing the snapshot
// on the error object lets _buildFailureResponse prefer it over a stale post-cascade query.
// Merges in the frame-scoped inventory (tagged in_frame: true) when the step targets an iframe.
async function captureEarlyDomSnapshot(page, step, inputs) {
  let top;
  try {
    top = await page.evaluate(pageScripts.domInventory);
  } catch (_) {
    return null;
  }
  if (!Array.isArray(top)) return null;
  let frameEntries = null;
  try { frameEntries = await frameScopedInventory(page, step, inputs); } catch (_) { frameEntries = null; }
  if (Array.isArray(frameEntries) && frameEntries.length) {
    return [...top, ...frameEntries.map(e => ({ ...e, in_frame: true }))];
  }
  return top;
}

function stepFailure(step, stepIndex, cause, preShot) {
  const err = new Error(`Step ${stepIndex + 1} (${step.type}) failed: ${cause && cause.message ? cause.message : String(cause)}`);
  err.failedAt = stepIndex;
  err.failedStep = step;
  err.preShot = preShot;
  // `cause` (primaryErr) carries fields the caller needs but that this wrapper Error previously
  // dropped — earlyDomSnapshot silently never reached _buildFailureResponse, so its "prefer the
  // failure-moment snapshot" comment was dead code; verifyResults/override-validation details
  // were similarly lost.
  if (cause) {
    if (Array.isArray(cause.earlyDomSnapshot)) err.earlyDomSnapshot = cause.earlyDomSnapshot;
    if (cause.verifyFail) {
      err.verifyFail = true;
      err.verifyResults = cause.verifyResults;
    }
    if (cause.overrideValidationFailed) {
      err.overrideValidationFailed = true;
      err.overrideReason = cause.overrideReason;
      err.overrideCandidates = cause.overrideCandidates;
    }
    if (cause.frameNotFound) err.frameNotFound = true;
  }
  return err;
}

async function runPlan(page, steps, inputs, startFrom, slug, { onStep, cancelCheck, tracker, downloadQueue, structuralFingerprint } = {}) {
  const t = tracker || { emit: () => {} };
  let recoveredSteps = 0;
  let hasExecutedStep = false;
  let prevStepType = null;

  // Settle the page before the first step so step 0 doesn't fire against a still-hydrating SPA.
  // Uses the same timeout constant as navigation waits; best-effort (catch swallowed).
  await page.waitForLoadState("domcontentloaded", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});

  // Pre-execution drift gate (advisory only). On a fresh run, check whether the
  // pack's recorded structural landmarks are still present. If most have vanished
  // the target app was likely redesigned — emit a signal for the fleet dashboard.
  // This NEVER blocks: execution proceeds and per-step recovery still applies.
  if (startFrom === 0 && structuralFingerprint && Array.isArray(structuralFingerprint.landmarks) && structuralFingerprint.landmarks.length) {
    try {
      const verdict = await detectPreExecDrift(page, structuralFingerprint);
      if (verdict.drift) {
        t.emit("drift_detected", {
          total: verdict.total,
          missing: verdict.missing,
          drift_ratio: Number(verdict.driftRatio.toFixed(3)),
          missing_intents: (verdict.missingIntents || []).slice(0, 5),
          url: (() => { try { return page.url(); } catch (_) { return ""; } })(),
        });
      }
    } catch (_) { /* advisory gate never affects execution */ }
  }

  for (let i = startFrom; i < steps.length; i++) {
    if (cancelCheck && cancelCheck()) {
      throw Object.assign(new Error("Execution cancelled"), { cancelled: true });
    }

    const step = steps[i];
    if (onStep) onStep(i);
    if (hasExecutedStep) await waitForPageLoad(page, prevStepType);

    const preShot = await maybeCapturePreStep(page, step);
    const primarySelector = baseSelector(step, inputs);
    // Pre-action baseline for the state_changed assertion (only captured when the step actually
    // carries one — cheap, but no reason to pay it on every step).
    const stateBaseline = needsStateChangedBaseline(step) ? await capturePreStepSignature(page) : null;

    let primaryErr = null;
    try {
      await executeStep(page, step, inputs, { downloadQueue });
      // Phase 8: independent post-condition verification.
      const verdict = await verifyStep(page, step, inputs, stateBaseline);
      // Fleet-visible audit: one event per step that actually carries assertions, pass or fail,
      // so advisory-assertion decay shows up as a drift signal before it becomes a hard failure.
      if (verdict.results.length) {
        t.emit("verify_result", {
          si: i,
          ok: verdict.pass,
          n: verdict.results.length,
          advFail: verdict.results.filter(r => !r.ok && !r.required).length,
        });
      }
      if (!verdict.pass) {
        t.emit("verify_fail", { si: i, ch: verdict.channel });
        throw Object.assign(new Error(`Verification failed: ${verdict.channel}`), {
          verifyFail: true,
          verifyResults: verdict.results,
        });
      }
      t.emit("tier_ok", { si: i, tier: "tier1_compiled" });
      hasExecutedStep = true;
      prevStepType = step.type;
      continue;
    } catch (err) {
      primaryErr = err;
      primaryErr.earlyDomSnapshot = await captureEarlyDomSnapshot(page, step, inputs);
    }

    const recovered = await recoverStep(page, step, inputs, slug, i, primarySelector, t, primaryErr, cancelCheck, stateBaseline);
    if (!recovered) {
      t.emit("step_fail", { si: i, fc: mapErrorToCode(primaryErr) });
      throw stepFailure(step, i, primaryErr, preShot);
    }

    // Phase 9: emit a structured drift signal for the fleet flywheel (admin-gated; never
    // mutates the local pack). `recovered` carries the winning tier/method when available.
    const klass = classifyException(primaryErr);
    t.emit("repair_event", buildRepairEvent(step, i, {
      tier: recovered && recovered.tier ? recovered.tier : "L2",
      method: recovered && recovered.method ? recovered.method : "",
      klass,
      driftHint: remedyFor(klass),
    }));

    recoveredSteps++;
    hasExecutedStep = true;
    prevStepType = step.type;
  }

  return { recoveredSteps };
}

// Auth-failure detection — login redirect or session-expired page heuristics.
const AUTH_FAILURE_URL_RE = /\/(login|signin|sign-in|auth|logout|session-expired)(\/|$|\?)/i;
const AUTH_FAILURE_TITLE_RE = /sign\s*in|log\s*in|session\s*expired|authentication\s*required/i;

async function isAuthFailure(page) {
  const url = page.url();
  if (AUTH_FAILURE_URL_RE.test(url)) return true;
  try {
    const title = await page.title();
    if (AUTH_FAILURE_TITLE_RE.test(title)) return true;
  } catch (_) {}
  return false;
}

module.exports = {
  appendRecoveryEvent,
  interpolate,
  tryLocator,
  enrichStepsWithRecovery,
  applyStepOverrides,
  executeStep,
  runPlan,
  checkRetryBudget,
  clearRetryBudget,
  mapErrorToCode,
  isAuthFailure,
  verifyStep,
  gateLocator,
  a11yRecoveryName,
  capturePreStepSignature,
  hasRequiredAssertion,
  needsStateChangedBaseline,
  recoverWithSelector,
  recoverStep,
  layer1Ladder,
  probePresent,
  validateOverrideSelector,
  stepAssertions,
  rootCandidates,
  frameScopedInventory,
};
