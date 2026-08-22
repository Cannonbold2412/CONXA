"use strict";
// Action dispatch seam, extracted from run.js: the HANDLERS table, branch
// primitives (best-effort by invariant — never enter the recovery cascade),
// executeStep, recovery embedding, and agent-override injection.
const pageScripts = require("./page_scripts");
const { interpolate } = require("./interpolate");
const {
  PAGE_LOAD_TIMEOUT_MS,
  ACTION_TIMEOUT_MS,
  SECONDARY_ACTION_TIMEOUT_MS,
  DOWNLOAD_WAIT_TIMEOUT_MS,
} = require("./run_config");
const { asObject, asArray, unique } = require("./step_utils");
const { pollPositive } = require("./assertions");
const { DOWNLOAD_ONLY_PLACEHOLDER_RE, resolveUploadPaths } = require("./uploads");
const {
  locatorCandidates,
  resolveStep,
} = require("./resolution");
const {
  PRIMARY,
  withLocator,
  withLocatorPair,
  runLocatorStep,
  hasTarget,
  clickFirst,
  checkboxValue,
  walkHoverChain,
  parseDragSelectors,
  parseKeyboardShortcut,
  baseSelector,
  stepWithSelector,
  textSelector,
} = require("./locators");

// tab_open/tab_switch/popup are NOT here (see tabs.js): the tab switch they mark already
// happened via resolveStepPage() before executeStep() runs for any step, including these
// markers, so their own handlers really are empty — but they're declared explicitly below,
// not folded into this blanket list, so "no-op step type" isn't read as "nothing happens
// around this step" for the one category where something very much does.
const NOOP_STEP_TYPES = [
  "frame_enter", "frame_exit",
  // "upload_intent" (native-OS-file-picker provenance) never actually reaches this dispatch as
  // its own type in a real skill pack — skill_package_builder_saved_skill.py's
  // _saved_step_to_execution_step collapses it to type "upload" (real handler below) at build
  // time, same value/selector. Kept here only as defensive dead code in case that collapsing
  // rule ever regresses; don't read it as "upload_intent uploads are a no-op" — they aren't.
  "upload_intent", "dialog_appeared", "dialog_accept",
  "dialog_dismiss", "file_chooser_opened", "clipboard_copy", "clipboard_paste",
];

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
    await page.goto(interpolate(step.url || "", inputs), { timeout: PAGE_LOAD_TIMEOUT_MS, waitUntil: "domcontentloaded" });
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
    const rawValue = String(step.value || "");
    const resolved = interpolate(rawValue, inputs);
    // A bare {{downloaded_file...}}-style placeholder that resolved to "" isn't a missing
    // declared input — filter_runtime_only_inputs (compiler) deliberately never declares these,
    // so telling the user to "supply" one is a dead end. It means the recorded download for this
    // step didn't produce a file during this run (timed out, or the download never fired).
    if (!resolved.trim() && DOWNLOAD_ONLY_PLACEHOLDER_RE.test(rawValue.trim())) {
      throw new Error(
        "upload step has no file path — the recorded download for this step didn't produce a " +
        "file during this run (it may have timed out or never started)",
      );
    }
    const filePaths = resolveUploadPaths(resolved);

    await runLocatorStep(page, step, inputs, async locator => {
      // Whether this control takes one file or many is a property of the live page, not of
      // what happened to be picked while recording — so ask the element, which stays correct
      // for packs compiled before this existed and for a site that changes the control later.
      // Only worth a round-trip when more than one file is actually on the table.
      if (filePaths.length > 1) {
        // Unknown (detached, cross-origin, evaluate blocked) stays permissive: let
        // setInputFiles have its say rather than blocking an upload on a failed probe.
        const acceptsMultiple = await locator.evaluate(el => el.multiple === true).catch(() => true);
        if (!acceptsMultiple) {
          throw Object.assign(new Error(
            `this upload control accepts only one file, but ${filePaths.length} files were given ` +
            `— pass a single file path instead of a folder`,
          ), { badInput: true });
        }
      }
      return locator.setInputFiles(filePaths, { timeout: ACTION_TIMEOUT_MS });
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

// The `page` handed to these handlers is already the resolved target tab (resolveStepPage ran
// before executeStep for this step like every other) — there is nothing left to do here.
HANDLERS["tab_open"] = async () => {};
HANDLERS["tab_switch"] = async () => {};
HANDLERS["popup"] = async () => {};

HANDLERS["download_observed"] = async (_page, _step, inputs, ctx) => {
  const queue = ctx && ctx.downloadQueue;
  if (!queue) return;
  // server.js's `page.on("download", ...)` listener only pushes onto this queue once Playwright's
  // download event actually fires — which can trail the triggering click by real wall-clock time
  // (server round-trip, header negotiation). Checking the queue once and bailing when it's still
  // empty raced that arrival far too often: this step would silently skip binding
  // downloaded_file*, and a later upload step would fail with a "no file path" error that looked
  // like a missing input rather than a download that just hadn't started yet. Wait for an entry
  // to arrive, bounded by the same budget used below for the download itself to finish.
  if (!queue.length) {
    await pollPositive(() => queue.length > 0, DOWNLOAD_WAIT_TIMEOUT_MS);
  }
  if (!queue.length) return;
  const pending = queue.shift();
  const entry = await Promise.race([
    pending,
    new Promise(resolve => setTimeout(resolve, DOWNLOAD_WAIT_TIMEOUT_MS)),
  ]);
  // Bind the saved path into `inputs` so a later `upload` step in this same run can reference
  // it — `downloaded_file` always holds the latest download, `downloaded_file_N` (1-indexed,
  // in download order) disambiguates when several downloads happen in one run. See
  // conxa_compile/compiler/upload_binding.py's _BindingState for how the compiler decides which
  // one an upload step's value points at (EXEC-10/W-2 — previously a compiled skill had no way
  // to hand a file from one tab to another without an LLM round-trip per file).
  if (entry && entry.path) {
    inputs.downloaded_file = entry.path;
    const n = (inputs.__downloadCount = (inputs.__downloadCount || 0) + 1);
    inputs[`downloaded_file_${n}`] = entry.path;
    // A zip is always extracted at download time (server.js) — bind its sibling extraction
    // folder too, so an upload step the compiler matched against specific files inside that
    // zip (upload_binding.py's _BindingState) has somewhere to resolve `{{downloaded_file_dir}}`
    // / `{{downloaded_file_N_dir}}` against. Absent entirely for a non-zip download.
    if (entry.extractedDir) {
      inputs.downloaded_file_dir = entry.extractedDir;
      inputs[`downloaded_file_${n}_dir`] = entry.extractedDir;
    }
  }
};

async function executeStep(page, step, inputs, ctx = {}) {
  const handler = HANDLERS[step.type];
  if (handler) await handler(page, step, inputs, ctx);
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

module.exports = {
  NOOP_STEP_TYPES,
  probePresent,
  resolvableBranchStep,
  runBranchBody,
  HANDLERS,
  executeStep,
  enrichStepsWithRecovery,
  applyStepOverrides,
};
