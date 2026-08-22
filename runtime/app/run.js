"use strict";
// run.js — run-plan ORCHESTRATION and the stable public barrel for the run engine.
//
// The engine was decomposed along its natural seams (behavior-preserving); the
// one-way dependency direction is:
//   run_plan (this file)
//     → cascade.js        (Tier 1/2 recovery ladder + remedies)
//     → handlers.js       (action dispatch table, branch primitives, executeStep)
//     → assertions.js     (post-condition VERIFY family)
//     → locators.js       (withLocator modes, selector derivation, action helpers)
//     → resolution.js     (frame roots, identity-bundle resolution, GATE, override gate)
//       → interpolate.js · step_utils.js · run_config.js · recovery_log.js
//         uploads.js · retry_budget.js (leaves)
//
// Everything below remains exported from here unchanged — server.js and the
// test suite import through this barrel.

const { mapErrorToCode } = require("./tracker");
const { classifyException, remedyFor, buildRepairEvent } = require("./recovery");
const { detectPreExecDrift } = require("./drift");
const { createTabRegistry, resolveStepPage, stepInheritsPage } = require("./tabs");

const { appendRecoveryEvent } = require("./recovery_log");
const { interpolate } = require("./interpolate");
const { PAGE_LOAD_TIMEOUT_MS, RUN_RETENTION_MS } = require("./run_config");
const { checkRetryBudget: _checkRetryBudget, clearRetryBudget } = require("./retry_budget");
const {
  rootCandidates,
  frameScopedInventory,
  captureEarlyDomSnapshot,
  gateLocator,
  validateOverrideSelector,
} = require("./resolution");
const {
  stepAssertions,
  capturePreStepSignature,
  verifyStep,
  hasRequiredAssertion,
  needsStateChangedBaseline,
} = require("./assertions");
const {
  tryLocator,
  baseSelector,
} = require("./locators");
const {
  NOOP_STEP_TYPES,
  probePresent,
  executeStep,
  enrichStepsWithRecovery,
  applyStepOverrides,
} = require("./handlers");
const {
  recoverWithSelector,
  a11yRecoveryName,
  layer1Ladder,
  recoverStep,
  maybeCapturePreStep,
} = require("./cascade");
const {
  resolveUploadPaths,
  extractZipOnce,
  uniqueDownloadName,
} = require("./uploads");

// checkRetryBudget is exported for server.js's budget enforcement; kept under its
// own name to make the "budget is checked there, not here" split explicit.
const checkRetryBudget = _checkRetryBudget;

// Step types that may trigger a real page navigation and need waitForLoadState after them.
// tab_open/tab_switch/popup are included so the first real step after a tab-boundary marker
// gets a load wait too — the marker itself is a no-op, but the tab it names may still be
// mid-navigation (e.g. a target=_blank popup that opens at about:blank).
const NAVIGATION_STEP_TYPES = new Set([
  "navigate", "click", "dblclick", "right_click", "keyboard_shortcut",
  "if_present", "try_dismiss", "wait_for_one_of",
  "tab_open", "tab_switch", "popup",
]);

// Only wait for page load when the previous step could have triggered navigation.
async function waitForPageLoad(page, prevType) {
  if (!prevType || !NAVIGATION_STEP_TYPES.has(prevType)) return;

  await page.waitForLoadState("domcontentloaded", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});
  if (process.env.CONXA_WAIT_NETWORKIDLE === "1") {
    // networkidle never fires on analytics-heavy sites, so it never inherits the full
    // page-load budget — capped independently of how high PAGE_LOAD_TIMEOUT_MS is set.
    await page.waitForLoadState("networkidle", { timeout: Math.min(PAGE_LOAD_TIMEOUT_MS, 8000) }).catch(() => {});
  }
}

// Nothing else ever deletes a finished run's workspace (W-7), so files accumulate under
// {CONXA_DATA_DIR}/runs/ forever. Sweep it at the start of every execution — rather than
// hooking success/failure/cancel/park separately — so cleanup runs no matter how the
// *previous* run ended. Never touches the run currently starting up.
function sweepOldRuns(runsBaseDir, maxAgeMs = RUN_RETENTION_MS, excludeRunId = null) {
  let entries;
  try { entries = require("fs").readdirSync(runsBaseDir, { withFileTypes: true }); }
  catch (_) { return; }
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === excludeRunId) continue;
    const dir = require("path").join(runsBaseDir, entry.name);
    try {
      if (require("fs").statSync(dir).mtimeMs < cutoff) {
        require("fs").rmSync(dir, { recursive: true, force: true });
      }
    } catch (_) { /* retried on next run */ }
  }
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
    if (cause.tabNotFound) err.tabNotFound = true;
    if (cause.failedPage) err.failedPage = cause.failedPage;
  }
  return err;
}

async function runPlan(startPage, steps, inputs, startFrom, slug, { onStep, cancelCheck, tracker, downloadQueue, structuralFingerprint, watch } = {}) {
  const t = tracker || { emit: () => {} };
  // Every invocation starts with a fresh budget. The success path also clears it, but a
  // *failed* run used to leave its attempt counts behind in this long-lived process, so the
  // next run of the same skill started already exhausted and recovery never engaged (EXEC-12).
  clearRetryBudget(slug);
  let recoveredSteps = 0;
  let hasExecutedStep = false;
  let prevStepType = null;
  let prevPage = null;

  // Multi-tab: each step declares which tab it runs on (step.tab — see tabs.js). The registry
  // binds tab_0 to startPage and starts listening for new pages immediately, before any step
  // runs, so a tab opened by an early step is queued even if a later step is the first to ask
  // for it.
  const tabs = createTabRegistry(startPage);

  // Settle the page before the first step so step 0 doesn't fire against a still-hydrating SPA.
  // Uses the same timeout constant as navigation waits; best-effort (catch swallowed).
  await startPage.waitForLoadState("domcontentloaded", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => {});

  // Pre-execution drift gate (advisory only). On a fresh run, check whether the
  // pack's recorded structural landmarks are still present. If most have vanished
  // the target app was likely redesigned — emit a signal for the fleet dashboard.
  // This NEVER blocks: execution proceeds and per-step recovery still applies.
  if (startFrom === 0 && structuralFingerprint && Array.isArray(structuralFingerprint.landmarks) && structuralFingerprint.landmarks.length) {
    try {
      const verdict = await detectPreExecDrift(startPage, structuralFingerprint);
      if (verdict.drift) {
        t.emit("drift_detected", {
          total: verdict.total,
          missing: verdict.missing,
          drift_ratio: Number(verdict.driftRatio.toFixed(3)),
          missing_intents: (verdict.missingIntents || []).slice(0, 5),
          url: (() => { try { return startPage.url(); } catch (_) { return ""; } })(),
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

    // Resolve which live page this step runs on. Never falls back to the previous step's page
    // on a miss (see resolveStepPage) — a same-looking element on the wrong tab is worse than
    // a clean failure here. Exception: a tab_open/tab_switch/popup marker that carries no `tab`
    // block names no tab at all (a recorder mis-stamp, e.g. a popup event attributed to the
    // page that was active when the event drained rather than the page that fired it) — treating
    // that as "go to tab_0" bounces execution back to wherever it started. Since these steps are
    // no-ops (see NOOP marker handlers below) and every real step still resolves its own tab
    // independently, simply staying on the current page is always safe here.
    let page;
    if (hasExecutedStep && prevPage && stepInheritsPage(step)) {
      page = prevPage;
    } else {
      try {
        page = await resolveStepPage(tabs, step, { watch, loadTimeoutMs: PAGE_LOAD_TIMEOUT_MS });
      } catch (tabErr) {
        t.emit("step_fail", { si: i, fc: "tab_not_found" });
        throw stepFailure(step, i, tabErr, null);
      }
    }

    if (hasExecutedStep && page === prevPage) await waitForPageLoad(page, prevStepType);

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
      prevPage = page;
      continue;
    } catch (err) {
      primaryErr = err;
      primaryErr.earlyDomSnapshot = await captureEarlyDomSnapshot(page, step, inputs);
      primaryErr.failedPage = page;
    }

    // Same reasoning as the auth check below: the caller supplied input the page cannot accept
    // (a folder of 20 files for a single-file upload control). No amount of re-finding the
    // element fixes that, and letting it reach Tier 3+ would spend LLM tokens on a mistake the
    // error message already explains. Fail straight through with that message intact.
    if (primaryErr && primaryErr.badInput) {
      t.emit("step_fail", { si: i, fc: "bad_input" });
      throw stepFailure(step, i, primaryErr, preShot);
    }

    // A login redirect is an auth condition, not a selector/DOM problem the T1/T2 cascade can
    // fix — running it anyway just burns ~10s against a login page before server.js's own
    // isAuthFailure check (which triggers the re-auth window) gets a turn. Skip straight to
    // stepFailure so that check runs immediately.
    if (await isAuthFailure(page)) {
      t.emit("step_fail", { si: i, fc: "auth_failure" });
      throw stepFailure(step, i, primaryErr, preShot);
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
    prevPage = page;
  }

  return { recoveredSteps };
}

// Auth-failure detection — login redirect or session-expired page heuristics. Deliberately
// broader/unanchored than browser.js's LOGIN_PATH_RE (which answers a different question —
// "has login-completion happened yet" — see its comment); don't merge them.
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
  NOOP_STEP_TYPES,
  appendRecoveryEvent,
  interpolate,
  resolveUploadPaths,
  extractZipOnce,
  tryLocator,
  enrichStepsWithRecovery,
  applyStepOverrides,
  executeStep,
  uniqueDownloadName,
  sweepOldRuns,
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
