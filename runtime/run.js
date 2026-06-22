"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { mapErrorToCode } = require("./tracker");
const { classifyException, remedyFor, buildRepairEvent, CLASS } = require("./recovery");

const CONXA_DIR = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const HUMAN_PACING_ENABLED = process.env.CONXA_HUMAN_PACING !== "0";
const ACTION_TIMEOUT_MS = envNumber("CONXA_ACTION_TIMEOUT_MS", 700);
const SECONDARY_ACTION_TIMEOUT_MS = envNumber("CONXA_SECONDARY_ACTION_TIMEOUT_MS", 800);
const RECOVERY_LOCATOR_TIMEOUT_MS = envNumber("CONXA_RECOVERY_LOCATOR_TIMEOUT_MS", 1200);
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

function frameChain(step) {
  return asArray(asObject(step && step.frame).chain).filter(item => item && typeof item === "object");
}

function frameSelectors(spec, inputs, bundleFrameSpec) {
  // Phase 5: prefer IdentityBundle FrameFingerprint signals (durability-ordered) when available.
  // bundleFrameSpec is the matching FrameFingerprint from identity_bundle.frame_chain.
  const bundleSignals = bundleFrameSpec
    ? asArray(bundleFrameSpec.signals)
        .filter(s => s && s.selector)
        .sort((a, b) => (b.durability || 0) - (a.durability || 0))
        .map(s => interpolate(String(s.selector), inputs))
    : [];

  const legacySelectors = unique([
    spec.selector,
    ...asArray(spec.fallback_selectors),
  ].map(selector => interpolate(String(selector || ""), inputs)));

  return unique([...bundleSignals, ...legacySelectors]);
}

function rootCandidates(page, step, inputs) {
  const chain = frameChain(step);
  if (!chain.length) return [page];

  const bundleChain = asArray(
    asObject(step && step.identity_bundle).frame_chain
  );

  let roots = [page];
  for (let i = 0; i < chain.length; i++) {
    const spec = chain[i];
    const bundleFrameSpec = bundleChain[i] || null;
    const next = [];
    for (const root of roots) {
      if (!root || typeof root.frameLocator !== "function") continue;
      for (const selector of frameSelectors(spec, inputs, bundleFrameSpec)) {
        next.push(root.frameLocator(selector));
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
  const candidates = locatorCandidates(page, step, inputs, selector);
  if (!candidates.length) throw new Error("Missing selector");

  let lastErr = null;
  for (const locator of candidates) {
    try {
      if (timeout) await locator.first().waitFor({ state: "visible", timeout });
      await gateLocator(locator.first(), step);
      return await fn(locator);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error(`Locator not found: ${selector}`);
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
  return { ...step, compiled_selectors: [], selector };
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

// Step executor

async function runLocatorStep(page, step, inputs, action, paceType, selector = stepSelector(step, inputs)) {
  await withLocator(page, step, inputs, selector, 0, async locator => action(locator.first(), locator));
  await humanDelay(paceType);
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
async function walkHoverChain(page, step, inputs) {
  const chain = asArray(asObject(step.handler_hints).hover_chain)
    .filter(sig => sig && sig.selector)
    .sort((a, b) => (b.durability || 0) - (a.durability || 0));
  for (const sig of chain) {
    try {
      await withLocator(page, step, inputs, sig.selector, 0, async locator => {
        await locator.first().hover({ timeout: SECONDARY_ACTION_TIMEOUT_MS });
      });
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
    const selector = stepSelector(step, inputs);
    if (selector) {
      await withLocator(page, step, inputs, selector, 0, async locator => {
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
    await withLocator(page, step, inputs, stepSelector(step, inputs), 0, async locator => {
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
    const selector = stepSelector(step, inputs);
    if (selector) {
      await withLocator(page, step, inputs, selector, 0, async locator => {
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

    const selector = stepSelector(step, inputs);
    if ((kind === "selector" || kind === "visible") && selector) {
      await withLocator(page, step, inputs, selector, step.timeout || SECONDARY_ACTION_TIMEOUT_MS, async locator => locator.first());
      return;
    }

    if (kind === "text" && selector) {
      const expected = interpolate(step.value || "", inputs);
      if (!expected) return;

      const actual = await withLocator(page, step, inputs, selector, 0, locator => {
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

async function recoverWithA11y(page, step, inputs, slug, stepIndex, tracker) {
  const fingerprint = asObject(step.element_fingerprint);
  const role = String(fingerprint.role || "").trim();
  const name = String(fingerprint.aria_label || fingerprint.name || fingerprint.label_text || fingerprint.inner_text || "").trim();

  const attempts = [];
  if (role && name) {
    attempts.push({ selector: `role=${role}[name="${name.replace(/"/g, '\\"')}"]`, method: "a11y:role" });
  }
  if (name) {
    attempts.push({ selector: textSelector(name.slice(0, 80)), method: "a11y:text" });
  }

  for (const { selector, method } of attempts) {
    if (!selector) continue;
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "tier2_a11y", slug, step_index: stepIndex, recovery_method: method });
      tracker.emit("tier_ok", { si: stepIndex, tier: "tier2_a11y", sel: method });
    });
    if (recovered) return true;
  }

  return false;
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

async function recoverStep(page, step, inputs, slug, stepIndex, primarySelector, tracker, primaryErr = null) {
  // Layer 1 — deterministic exception ladder (targeted single remedy).
  const l1 = await layer1Ladder(page, step, inputs, slug, stepIndex, primarySelector, primaryErr);
  if (l1) {
    tracker.emit("tier_ok", { si: stepIndex, tier: "layer1", sel: l1 });
    return { tier: "L1", method: l1 };
  }

  for (const selector of compiledSelectors(step, inputs).slice(1)) {
    const recovered = await recoverWithSelector(page, step, inputs, selector, () => {
      appendRecoveryEvent({ event: "tier1_compiled_alt", slug, step_index: stepIndex, recovery_selector: selector });
      tracker.emit("tier_ok", { si: stepIndex, tier: "tier1_compiled", sel: selector });
    });
    if (recovered) return { tier: "L1", method: "compiled_alt" };
  }

  if (await recoverWithA11y(page, step, inputs, slug, stepIndex, tracker)) return { tier: "L2", method: "a11y" };

  await page.waitForTimeout(250);
  if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
    appendRecoveryEvent({ event: "transient_recovered", slug, step_index: stepIndex });
  })) return { tier: "L2", method: "transient" };

  // Layer 2 — re-hover-then-retry (menu reveals), then the existing fallback mechanisms.
  if (asArray(asObject(step.handler_hints).hover_chain).length) {
    await walkHoverChain(page, step, inputs);
    if (await recoverWithSelector(page, step, inputs, primarySelector, () => {
      appendRecoveryEvent({ event: "layer2_rehover", slug, step_index: stepIndex });
    })) return { tier: "L2", method: "rehover" };
  }

  if (await recoverWithFallbackSelectors(page, step, inputs, slug, stepIndex, primarySelector, tracker)) return { tier: "L2", method: "fallback" };
  if (await recoverWithDialogScope(page, step, inputs, slug, stepIndex, primarySelector, tracker)) return { tier: "L2", method: "dialog" };
  return (await recoverWithFuzzyText(page, step, inputs, slug, stepIndex, primarySelector, tracker)) ? { tier: "L2", method: "fuzzy" } : false;
}

async function maybeCapturePreStep(page, step) {
  if (!INTERACTIVE_STEP_TYPES.has(step.type) || process.env.CONXA_CAPTURE_PRESTEP !== "1") return null;
  return page.screenshot({ type: "png", timeout: 1000 }).catch(() => null);
}

function stepFailure(step, stepIndex, cause, preShot) {
  const err = new Error(`Step ${stepIndex + 1} (${step.type}) failed: ${cause && cause.message ? cause.message : String(cause)}`);
  err.failedAt = stepIndex;
  err.failedStep = step;
  err.preShot = preShot;
  return err;
}

async function runPlan(page, steps, inputs, startFrom, slug, { onStep, cancelCheck, tracker, observerMs, downloadQueue } = {}) {
  const t = tracker || { emit: () => {} };
  const paceOpts = { observerMs: observerMs ?? 600 };
  let recoveredSteps = 0;
  let hasExecutedStep = false;
  let prevStepType = null;

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
    }

    const recovered = await recoverStep(page, step, inputs, slug, i, primarySelector, t, primaryErr);
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
  executeStep,
  runPlan,
  checkRetryBudget,
  clearRetryBudget,
  mapErrorToCode,
  isAuthFailure,
  verifyStep,
  gateLocator,
};
