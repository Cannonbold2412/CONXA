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
  answerDialog,
} = require("./handlers");
const {
  recoverWithSelector,
  a11yRecoveryName,
  layer1Ladder,
  recoverStep,
  createActionGuard,
  maybeCapturePreStep,
} = require("./cascade");
const {
  resolveUploadPaths,
  extractZipOnce,
  uniqueDownloadName,
} = require("./uploads");
const { dismissAgentNominated } = require("./dismiss_patterns");
const learnedDismissals = require("./learned_dismissals");

// checkRetryBudget is exported for server.js's budget enforcement; kept under its
// own name to make the "budget is checked there, not here" split explicit.
const checkRetryBudget = _checkRetryBudget;

// Step types that may trigger a real page navigation and need waitForLoadState after them.
// tab_open/tab_switch/popup are included so the first real step after a tab-boundary marker
// gets a load wait too — the marker itself is a no-op, but the tab it names may still be
// mid-navigation (e.g. a target=_blank popup that opens at about:blank).
const NAVIGATION_STEP_TYPES = new Set([
  "navigate", "browser_back", "browser_forward", "click", "dblclick", "right_click",
  "keyboard_shortcut",
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
    // EXEC-24: the recovery cascade refused to act again because an earlier attempt may
    // already have taken effect. The agent tier needs to know that before it reasons about a
    // page whose state it cannot otherwise account for; a destructive step fails closed on it.
    if (cause.actionMayHaveTakenEffect) err.actionMayHaveTakenEffect = true;
    if (cause.recoveryHaltReason) err.recoveryHaltReason = cause.recoveryHaltReason;
    if (cause.destructiveHalt) err.destructiveHalt = true;
    if (cause.frameNotFound) err.frameNotFound = true;
    if (cause.entityNotFound) err.entityNotFound = true;
    if (cause.tabNotFound) err.tabNotFound = true;
    if (cause.failedPage) err.failedPage = cause.failedPage;
    // EXEC-30: Tier A's known-pattern ladder saw an INTERCEPTED failure and cleared nothing —
    // tell the agent tier this looks like an unrecognized overlay, not a plain missing element.
    if (cause.unknownOverlay) err.unknownOverlay = true;
  }
  return err;
}

async function runPlan(startPage, steps, inputs, startFrom, slug, { onStep, onPhase, cancelCheck, tracker, downloadQueue, dialogQueue, structuralFingerprint, watch } = {}) {
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
        // prevPage gates tabs.js's settle-on-page-switch: a step that moves execution to a
        // different page (including back to the initial page) gets a load wait and, under
        // watch mode, a bringToFront — without it the return leg of A→B→A replays invisibly
        // against a background tab.
        page = await resolveStepPage(tabs, step, { watch, loadTimeoutMs: PAGE_LOAD_TIMEOUT_MS, prevPage, onPhase });
      } catch (tabErr) {
        t.emit("step_fail", { si: i, fc: "tab_not_found" });
        throw stepFailure(step, i, tabErr, null);
      }
    }

    if (hasExecutedStep && page === prevPage) await waitForPageLoad(page, prevStepType);

    // EXEC-13: ai_review is a planned pause (author-placed reasoning checkpoint), not a page
    // action and not a Tier 1-4 recovery candidate — it carries no selector/identity_bundle, so
    // it must never reach executeStep/HANDLERS or recoverStep. server.js validates a resumed
    // review answer against the step's output_schema and binds it under `__ai_review_answer_<i>`
    // in `inputs` *before* calling runPlan (see the `_resumeReviewStep` block); this interception
    // just consumes it and moves on. A fresh arrival (no bound answer yet) throws a distinct,
    // non-recovery signal that server.js's catch block special-cases (like `cancelled`/
    // `session_expired`) to park the page and return a review request instead of a failure.
    if (step.type === "ai_review") {
      const answerKey = `__ai_review_answer_${i}`;
      if (Object.prototype.hasOwnProperty.call(inputs, answerKey)) {
        const outputName = step.output_name || `ai_review_output_${i}`;
        inputs[outputName] = inputs[answerKey];
        delete inputs[answerKey];
        hasExecutedStep = true;
        prevStepType = step.type;
        prevPage = page;
        continue;
      }
      throw Object.assign(new Error("ai_review_pause"), { reviewPause: true, stepIndex: i, step, page });
    }

    // EXEC-30 — agent-nominated overlay dismissal (Tier B closing edge). applyStepOverrides
    // (handlers.js) stamped this step with _dismiss_selector/_dismiss_escape when the previous
    // failure response's step_overrides carried a `dismiss` entry for this index. Runs exactly
    // once — the override only ever lands on the resumed index — BEFORE the step's own action,
    // never in place of it: whether or not the dismissal actually clicked something, the
    // recorded step still runs immediately after.
    if (step._dismiss_selector || step._dismiss_escape) {
      if (step._dismiss_escape) {
        await page.keyboard.press("Escape").catch(() => {});
        appendRecoveryEvent({ event: "tierb_overlay_dismissed", slug, step_index: i, method: "escape", source: "agent" });
        t.emit("overlay_dismissed", { si: i, src: "agent" });
      } else {
        const result = await dismissAgentNominated(page, step._dismiss_selector).catch(err => ({ ok: false, reason: "error", message: err && err.message }));
        if (result.ok) {
          learnedDismissals.record(page.url(), result.selector);
          appendRecoveryEvent({ event: "tierb_overlay_dismissed", slug, step_index: i,
            selector: result.selector, label: result.label, source: "agent" });
          t.emit("overlay_dismissed", { si: i, src: "agent" });
        } else {
          appendRecoveryEvent({ event: "overlay_dismiss_rejected", slug, step_index: i, reason: result.reason });
          t.emit("overlay_dismiss_rejected", { si: i, why: result.reason });
          // Ride along on the step object (already carried forward as err.failedStep on a
          // later failure) so the next failure response can explain the refusal — no new
          // plumbing through stepFailure needed.
          step._dismiss_rejected = result.reason;
        }
      }
      await page.waitForTimeout(150).catch(() => {}); // let the DOM settle before the real attempt
    }

    const preShot = await maybeCapturePreStep(page, step);
    const primarySelector = baseSelector(step, inputs);
    // Pre-action baseline for the state_changed assertion (only captured when the step actually
    // carries one — cheap, but no reason to pay it on every step).
    const stateBaseline = needsStateChangedBaseline(step) ? await capturePreStepSignature(page) : null;

    // EXEC-29 — a native dialog blocks the very Playwright call that opens it: click()/fill()/
    // etc. do not resolve until the dialog is answered (this is Chromium/CDP behavior, not
    // something Playwright can be told to skip). Waiting for the FOLLOWING dialog_accept/
    // dialog_dismiss step to drain ctx.dialogQueue — which is what a pack compiled before this
    // fix does, and which HANDLERS["dialog_accept"] still supports below for exactly that
    // reason — therefore deadlocks: that step can never run because this one's action promise
    // never returns. Arming the answer here, one step ahead of dispatch, means Chromium's
    // dialog resolves the instant it opens and THIS step's own action returns normally. Safe to
    // race with the old drain path (answerDialog tolerates being called twice on one dialog —
    // see its comment in handlers.js).
    const nextStep = steps[i + 1];
    let unarmDialog = null;
    if (nextStep && (nextStep.type === "dialog_accept" || nextStep.type === "dialog_dismiss")) {
      const onDialog = (dialog) => { answerDialog(dialog, nextStep, inputs).catch(() => {}); };
      page.once("dialog", onDialog);
      unarmDialog = () => { try { page.off("dialog", onDialog); } catch (_) {} };
    }

    let primaryErr = null;
    try {
      await executeStep(page, step, inputs, { downloadQueue, dialogQueue });
      // Phase 8: independent post-condition verification.
      const verdict = await verifyStep(page, step, inputs, stateBaseline, dialogQueue);
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
    } finally {
      // A dialog that never opened (this click didn't actually trigger one — drift, a wrong
      // element, whatever) must not stay armed into recovery or a later step: it would wrongly
      // auto-answer the NEXT real dialog this run happens to hit, with an answer meant for a
      // different one. `.once` already self-removes after firing; this is only load-bearing
      // for the case where it never fires.
      if (unarmDialog) unarmDialog();
    }

    // Same reasoning as the auth check below: the caller supplied input the page cannot accept
    // (a folder of 20 files for a single-file upload control). No amount of re-finding the
    // element fixes that, and letting it reach Tier 3+ would spend LLM tokens on a mistake the
    // error message already explains. Fail straight through with that message intact.
    if (primaryErr && primaryErr.badInput) {
      t.emit("step_fail", { si: i, fc: "bad_input" });
      throw stepFailure(step, i, primaryErr, preShot);
    }

    // PROD-3 — a bound step whose record can't be uniquely located isn't a selector problem the
    // cascade can fix: every stage re-resolves through the same identity_bundle + entity_binding,
    // so it would just fail the same way seven more times. Fail straight through rather than
    // burning the cascade (or worse, letting some stage relax scoping and act on the wrong row).
    if (primaryErr && primaryErr.entityNotFound) {
      t.emit("step_fail", { si: i, fc: "entity_not_found" });
      throw stepFailure(step, i, primaryErr, preShot);
    }

    // A login redirect is an auth condition, not a selector/DOM problem the T1/T2 cascade can
    // fix — running it anyway just burns ~10s against a login page before server.js's own
    // isAuthFailure check (which triggers the re-auth window) gets a turn. Skip straight to
    // stepFailure so that check runs immediately.
    if (await isAuthFailure(page, steps)) {
      t.emit("step_fail", { si: i, fc: "auth_failure" });
      throw stepFailure(step, i, primaryErr, preShot);
    }

    // EXEC-24 — seed the guard with what we already know about the primary attempt. Two ways
    // the step's action may already have run: it threw from inside the action callback
    // (`mayHaveActed`, set at the withLocator seam), or it completed and only its post-condition
    // failed (`verifyFail`) — that one definitely acted. `stateBaseline` is the page as it was
    // before this step touched anything, which is what the guard compares against.
    const guard = createActionGuard(step, {
      acted: !!(primaryErr && (primaryErr.mayHaveActed || primaryErr.verifyFail)),
      signature: stateBaseline,
    });

    const recovered = await recoverStep(page, step, inputs, slug, i, primarySelector, t, primaryErr, cancelCheck, stateBaseline, guard, dialogQueue);
    if (!recovered) {
      if (guard.blocked) {
        primaryErr.recoveryHaltReason = guard.blocked;
        if (guard.blocked !== "destructive-no-guess") primaryErr.actionMayHaveTakenEffect = true;
      }
      // PROD-3: an irreversible step recovery could not heal is never handed to the agent for a
      // candidate override, whichever stage it stopped at — a step_overrides pick is
      // re-identification by another name, the one thing a destructive step must never do. This
      // used to be implied by cascade.js halting before Layer 2 and setting `destructive-no-guess`
      // on the guard; now that the same-element Layer 2 stages run for destructive steps too, the
      // rule is stated here instead of inferred from where the cascade stopped.
      if (step.destructive === true) primaryErr.destructiveHalt = true;
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

// A skill can legitimately record a login page as an ordinary step — a demo app's /login form
// the workflow itself fills in. The heuristics above can't tell that apart from a session that
// died, and getting it wrong is expensive twice over: the step loses its whole Tier 1-4 recovery
// cascade (run.js short-circuits straight to stepFailure), and the user is told their saved
// sign-in expired for an app the failing step never touched. A URL the recording deliberately
// navigated to is not a redirect, so it is not a session expiry.
function _isRecordedUrl(steps, url) {
  if (!Array.isArray(steps) || !url) return false;
  const bare = (u) => String(u).split("#")[0].split("?")[0].replace(/\/$/, "");
  const live = bare(url);
  return steps.some((s) => s && s.type === "navigate" && s.url && bare(s.url) === live);
}

async function isAuthFailure(page, steps) {
  const url = page.url();
  if (_isRecordedUrl(steps, url)) return false;
  if (AUTH_FAILURE_URL_RE.test(url)) return true;
  try {
    const title = await page.title();
    if (AUTH_FAILURE_TITLE_RE.test(title)) return true;
  } catch (_) {}
  return false;
}

module.exports = {
  NOOP_STEP_TYPES,
  NAVIGATION_STEP_TYPES,
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
