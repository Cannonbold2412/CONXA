"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { mapErrorToCode } = require("./tracker");
const { classifyException, remedyFor, buildRepairEvent, CLASS } = require("./recovery");
const { resolve: resolveSignals } = require("./resolver");
const { signalToLocator, gatherCandidates, bundleFingerprint } = require("./resolve_adapter");
const { detectPreExecDrift } = require("./drift");

const CONXA_DIR = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const HUMAN_PACING_ENABLED = process.env.CONXA_HUMAN_PACING !== "0";
const CAPTURE_PRESTEP      = process.env.CONXA_CAPTURE_PRESTEP !== "0";
const ACTION_TIMEOUT_MS = envNumber("CONXA_ACTION_TIMEOUT_MS", 2500);
const SECONDARY_ACTION_TIMEOUT_MS = envNumber("CONXA_SECONDARY_ACTION_TIMEOUT_MS", 2500);
const RECOVERY_LOCATOR_TIMEOUT_MS = envNumber("CONXA_RECOVERY_LOCATOR_TIMEOUT_MS", 3000);
const PAGE_LOAD_TIMEOUT_MS = envNumber("CONXA_PAGE_LOAD_TIMEOUT_MS", 8000);

const RETRY_BUDGET_MAX = 3;
const DOWNLOAD_WAIT_TIMEOUT_MS = envNumber("CONXA_DOWNLOAD_WAIT_MS", 120000);
const RECOVERY_LOG = path.join(CONXA_DIR, "logs", "recovery.log");
const RECOVERY_LOG_MAX = 10 * 1024 * 1024;

const HUMAN_DELAYS = {
  click: [180, 300],
  fill:  [100, 200],
  type:  [100, 200],
  select:[160, 260],
  focus: [ 80, 160],
  scroll:[120, 220],
};

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
const NAVIGATION_STEP_TYPES = new Set(["navigate", "click", "dblclick", "right_click", "keyboard_shortcut"]);

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

// Human-like pacing

function randomDelayMs(type) {
  const range = HUMAN_DELAYS[type];
  if (!range) return 0;
  return range[0] + Math.random() * (range[1] - range[0]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function humanDelay(type) {
  if (!HUMAN_PACING_ENABLED) return;

  const ms = randomDelayMs(type);
  if (ms > 0) await sleep(ms);
}

async function waitForPageLoadAndPace(page, nextType, prevType, opts = {}) {
  // Only wait for page load when the previous step could have triggered navigation.
  if (prevType && NAVIGATION_STEP_TYPES.has(prevType)) {
    const start = Date.now();
    await page.waitForLoadState("domcontentloaded", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});
    if (process.env.CONXA_WAIT_NETWORKIDLE === "1") {
      await page.waitForLoadState("networkidle", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});
    }
    // Guarantee the viewer sees the new page for at least observerMs total.
    // If the page was already slow to load, the viewer already saw it — skip the pad.
    if (HUMAN_PACING_ENABLED) {
      const observerMs = opts.observerMs ?? 600;
      const remaining = observerMs - (Date.now() - start);
      if (remaining > 0) await sleep(remaining);
    }
    // The observer pause already covers "thinking time" before the next action —
    // don't also fire a per-type human delay after a navigation step.
    return;
  }

  if (!HUMAN_PACING_ENABLED) return;

  const ms = randomDelayMs(nextType);
  if (ms > 0) await page.waitForTimeout(ms);
}

// Selector helpers

function interpolate(value, inputs) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => String(inputs[key] ?? ""));
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
function rootCandidates(page, step, inputs) {
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
        next.push(root.frameLocator(interpolate(String(s.selector), inputs)));
      }
    }
    roots = next;
    if (!roots.length) break;
  }

  return roots.length ? roots : [page];
}

function locatorCandidates(page, step, inputs, selector) {
  const resolved = interpolate(selector || "", inputs);
  if (!resolved) return [];
  return rootCandidates(page, step, inputs).map(root => root.locator(resolved));
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
  const roots = rootCandidates(page, step, inputs);
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
    const stable = await loc.evaluate(el => new Promise(resolve => {
      const r1 = el.getBoundingClientRect();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r2 = el.getBoundingClientRect();
        resolve(Math.abs(r1.x - r2.x) < 1 && Math.abs(r1.y - r2.y) < 1
          && Math.abs(r1.width - r2.width) < 1 && Math.abs(r1.height - r2.height) < 1);
      }));
    }));
    if (!stable) {
      await loc.waitFor({ state: "visible", timeout: budget }); // settle once more
    }
  } catch (_) {
    // evaluate may fail on detach — let the action path surface the real error.
  }

  // Enabled: reject disabled / aria-disabled controls.
  try {
    const disabled = await loc.evaluate(el =>
      el.disabled === true || el.getAttribute("aria-disabled") === "true");
    if (disabled) throw new Error("Element is disabled");
  } catch (err) {
    if (err && /disabled/i.test(String(err.message))) throw err;
  }
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

  // Explicit recovery selector (PRIMARY + _explicit_selector) or plain string mode.
  const candidates = selector === PRIMARY
    ? locatorCandidates(page, step, inputs, step._explicit_selector)
    : locatorCandidates(page, step, inputs, selector);
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
  for (const root of rootCandidates(page, step, inputs)) {
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
  for (const locator of locatorCandidates(page, step, inputs, selector)) {
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

async function runLocatorStep(page, step, inputs, action, paceType, selector = PRIMARY) {
  await withLocator(page, step, inputs, selector, 0, async locator => action(locator.first(), locator));
  await humanDelay(paceType);
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
  const roots = rootCandidates(page, step, inputs);
  for (const sig of chain) {
    try {
      for (const root of roots) {
        const loc = signalToLocator(root, sig, interpolate, inputs);
        if (!loc) continue;
        await loc.first().hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
        break;
      }
      await humanDelay("focus");
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
      await page.evaluate(([x, y]) => window.scrollBy(x, y), [deltaX, deltaY]);
    }
    await humanDelay("scroll");
  },

  fill: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.fill(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    }, "fill");
  },

  type: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.fill(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    }, "type");
  },

  click: async (page, step, inputs) => {
    await walkHoverChain(page, step, inputs);
    await withLocator(page, step, inputs, PRIMARY, 0, async locator => {
      await clickFirst(locator, { timeout: ACTION_TIMEOUT_MS });
    });
    await humanDelay("click");
  },

  dblclick: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.dblclick({ timeout: ACTION_TIMEOUT_MS });
    }, "click");
  },

  right_click: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.click({ button: "right", timeout: ACTION_TIMEOUT_MS });
    }, "click");
  },

  hover: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
    }, "focus");
  },

  select: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.selectOption(interpolate(step.value || "", inputs), { timeout: ACTION_TIMEOUT_MS });
    }, "select");
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
    await humanDelay("focus");
  },

  set_checkbox: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.setChecked(checkboxValue(step, inputs), { timeout: ACTION_TIMEOUT_MS });
    }, "click");
  },

  set_radio: async (page, step, inputs) => {
    await runLocatorStep(page, step, inputs, locator => {
      return locator.click({ timeout: ACTION_TIMEOUT_MS });
    }, "click");
  },

  date_pick: async (page, step, inputs) => {
    const value = interpolate(step.value || "", inputs);
    await runLocatorStep(page, step, inputs, async locator => {
      try {
        await locator.fill(value, { timeout: ACTION_TIMEOUT_MS });
      } catch (_) {
        await locator.click({ timeout: SECONDARY_ACTION_TIMEOUT_MS }).catch(() => {});
      }
    }, "fill");
  },

  drag_drop: async (page, step, inputs) => {
    const { srcSelector, dstSelector } = parseDragSelectors(step, inputs);
    if (srcSelector && dstSelector) {
      await withLocatorPair(page, step, inputs, srcSelector, dstSelector, 0, (srcLoc, dstLoc) => {
        return srcLoc.first().dragTo(dstLoc.first(), { timeout: ACTION_TIMEOUT_MS });
      });
    }
    await humanDelay("click");
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

async function verifyStep(page, step, inputs) {
  const assertions = stepAssertions(step);
  if (!assertions.length) return { pass: true, channel: "none", evidence: "no-assertions" };

  for (const a of assertions) {
    const type = String(a.type || "").toLowerCase();
    const target = interpolate(String(a.target || a.pattern || a.url || a.selector || a.text || ""), inputs);
    const required = a.required !== false;
    const timeout = Number(a.timeout_ms) || 3000;
    let ok = true;
    try {
      if (type === "url_changed" || type === "url_exact") {
        ok = page.url() === target || (!!target && page.url().startsWith(target));
      } else if (type === "url_pattern" || type === "url") {
        ok = !target || new RegExp(target).test(page.url());
      } else if (type === "selector_present") {
        await page.locator(target).first().waitFor({ state: "attached", timeout });
        ok = true;
      } else if (type === "selector_absent") {
        ok = (await page.locator(target).count()) === 0;
      } else if (type === "text_present") {
        ok = (await page.locator(`text=${JSON.stringify(target)}`).count()) > 0;
      } else if (type === "text_absent") {
        ok = (await page.locator(`text=${JSON.stringify(target)}`).count()) === 0;
      }
    } catch (err) {
      ok = false;
    }
    if (!ok && required) {
      return { pass: false, channel: type, evidence: target };
    }
  }
  return { pass: true, channel: "all", evidence: `${assertions.length} assertion(s)` };
}

// Recovery cascade

async function recoverWithSelector(page, step, inputs, selector, onSuccess) {
  if (!selector) return false;

  try {
    await executeStep(page, stepWithSelector(step, selector), inputs);
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

async function recoverWithA11y(page, step, inputs, slug, stepIndex, tracker) {
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
    appendRecoveryEvent({ event: "tier2_a11y", slug, step_index: stepIndex, recovery_method: method });
    tracker.emit("tier_ok", { si: stepIndex, tier: "tier2_a11y", sel: method });
    return true;
  } catch (_) {
    return false;
  }
}

async function recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, skipSelector, tracker) {
  for (const selector of fallbackSelectors(step)) {
    if (skipSelector && selector === skipSelector) continue;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 2, slug, step_index: stepIndex, recovery_selector: selector });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    });
    if (recovered) return true;
  }

  return false;
}

async function recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker) {
  if (step.type !== "click" || !primarySelector) return false;

  for (const container of DIALOG_CONTAINERS) {
    const selector = `${container} ${primarySelector}`;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "layer_recovered", layer: 3, slug, step_index: stepIndex, mode: "dialog" });
      tracker.emit("rec_ok", { si: stepIndex, sc: "selector" });
    });
    if (recovered) return true;
  }

  return false;
}

async function recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker) {
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
    });
  } catch (_) {
    return false;
  }
}

// Layer 1 deterministic ladder: apply a single targeted remedy keyed off the exception class,
// then retry the primary selector once. Zero-token. Returns true if the retry succeeded.
async function layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr) {
  const klass = classifyException(primaryErr);
  const remedy = remedyFor(klass);
  try {
    if (remedy === "scroll-into-view" && primarySelector) {
      await page.locator(primarySelector).first().scrollIntoViewIfNeeded({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
    } else if (remedy === "dismiss-overlay") {
      await page.keyboard.press("Escape").catch(() => {});
    } else if (remedy === "wait-stable" || remedy === "wait-enabled") {
      await page.waitForTimeout(300);
    } else {
      return false; // re-resolve / retry-cascade handled by the broader cascade below
    }
  } catch (_) {
    return false;
  }
  const ok = await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "layer1_ladder", slug, step_index: stepIndex, remedy });
  });
  return ok ? remedy : false;
}

async function recoverStep(page, step, inputs, slug, stepIndex, primarySelector, tracker, primaryErr = null, cancelCheck = null) {
  // Each Tier 1/2 stage is individually time-bounded, but the cascade as a whole can run for tens
  // of seconds. If the MCP client cancels mid-recovery (e.g. its request timed out), bail at the
  // next stage boundary instead of grinding through every remaining stage on a doomed run.
  const bail = () => { if (cancelCheck && cancelCheck()) throw Object.assign(new Error("Execution cancelled"), { cancelled: true }); };

  // Layer 1 — deterministic exception ladder (targeted single remedy).
  // (Alternate-signal recovery is inherent: resolveStep already walks all bundle signals in
  // durability order, so there is no separate legacy compiled-selector tier.)
  const l1 = await layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr);
  if (l1) {
    tracker.emit("tier_ok", { si: stepIndex, tier: "layer1", sel: l1 });
    return { tier: "L1", method: l1 };
  }

  bail();
  if (await recoverWithA11y(page, step, inputs, slug, stepIndex, tracker)) return { tier: "L2", method: "a11y" };

  bail();
  await page.waitForTimeout(250);
  if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "transient_recovered", slug, step_index: stepIndex });
  })) return { tier: "L2", method: "transient" };

  // Layer 2 — re-hover-then-retry (menu reveals), then the existing fallback mechanisms.
  if (asArray(asObject(step.handler_hints).hover_chain).length) {
    bail();
    await walkHoverChain(page, step, inputs);
    if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
      appendRecoveryEvent({ event: "layer2_rehover", slug, step_index: stepIndex });
    })) return { tier: "L2", method: "rehover" };
  }

  bail();
  if (await recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, primarySelector, tracker)) return { tier: "L2", method: "fallback" };
  bail();
  if (await recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker)) return { tier: "L2", method: "dialog" };
  bail();
  return (await recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker)) ? { tier: "L2", method: "fuzzy" } : false;
}

async function maybeCapturePreStep(page, step) {
  if (!INTERACTIVE_STEP_TYPES.has(step.type) || !CAPTURE_PRESTEP) return null;
  return page.screenshot({ type: "jpeg", quality: 70, timeout: 1000 }).catch(() => null);
}

// Capture the interactive-element inventory at the exact moment of step failure, before the
// T1/T2 recovery cascade runs (~12 s). Transient elements like open dropdown menus auto-close
// during the cascade, leaving _buildFailureResponse with an empty DOM scan. Storing the snapshot
// on the error object lets _buildFailureResponse prefer it over a stale post-cascade query.
async function captureEarlyDomSnapshot(page) {
  try {
    return await page.evaluate(() => {
      const seen = new Set();
      return Array.from(document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]'
      )).map(el => {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80);
        const tag  = el.tagName.toLowerCase();
        const type = el.getAttribute("type")        || "";
        const role = el.getAttribute("role")        || "";
        const id   = el.id                          || undefined;
        const dt   = el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined;
        const key  = `${tag}|${type}|${text}`;
        if (!text && !type && !id && !dt) return null;
        if (seen.has(key)) return null;
        seen.add(key);
        return { tag, type: type || undefined, role: role || undefined, text: text || undefined, id, "data-testid": dt };
      }).filter(Boolean).slice(0, 50);
    });
  } catch (_) { return null; }
}

function stepFailure(step, stepIndex, cause, preShot) {
  const err = new Error(`Step ${stepIndex + 1} (${step.type}) failed: ${cause && cause.message ? cause.message : String(cause)}`);
  err.failedAt = stepIndex;
  err.failedStep = step;
  err.preShot = preShot;
  return err;
}

async function runPlan(page, steps, inputs, startFrom, slug, { onStep, cancelCheck, tracker, observerMs, downloadQueue, structuralFingerprint } = {}) {
  const t = tracker || { emit: () => {} };
  const paceOpts = { observerMs: observerMs ?? 600 };
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
    if (hasExecutedStep) await waitForPageLoadAndPace(page, step.type, prevStepType, paceOpts);

    const preShot = await maybeCapturePreStep(page, step);
    const primarySelector = baseSelector(step, inputs);

    let primaryErr = null;
    try {
      await executeStep(page, step, inputs, { downloadQueue });
      // Phase 8: independent post-condition verification.
      const verdict = await verifyStep(page, step, inputs);
      if (!verdict.pass) {
        t.emit("verify_fail", { si: i, ch: verdict.channel });
        throw Object.assign(new Error(`Verification failed: ${verdict.channel}`), { verifyFail: true });
      }
      t.emit("tier_ok", { si: i, tier: "tier1_compiled" });
      hasExecutedStep = true;
      prevStepType = step.type;
      continue;
    } catch (err) {
      primaryErr = err;
      primaryErr.earlyDomSnapshot = await captureEarlyDomSnapshot(page);
    }

    const recovered = await recoverStep(page, step, inputs, slug, i, primarySelector, t, primaryErr, cancelCheck);
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
};
