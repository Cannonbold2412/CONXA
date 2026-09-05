"use strict";
// Post-action VERIFY seam, extracted from run.js: compiled assertion access,
// polling primitives, per-type assertion evaluation, and verifyStep.
const pageScripts = require("./page_scripts");
const { interpolate } = require("./interpolate");
const { PAGE_LOAD_TIMEOUT_MS } = require("./run_config");
const { asObject, asArray, isNonIdempotent } = require("./step_utils");
const { rootCandidates } = require("./resolution");
const { withDeadline, evalOn, EVAL_TIMED_OUT } = require("./page_eval");

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
    const sig = await evalOn(page, pageScripts.preStepSignature, STATE_CHANGED_SELECTOR);
    if (!sig || sig === EVAL_TIMED_OUT) return { url, textLen: 0, interactiveCount: 0 };
    const { textLen, interactiveCount } = sig;
    return { url, textLen, interactiveCount };
  } catch (_) {
    return null;
  }
}

// EXEC-24 — "has the page moved since we last looked?" using the signature above. This is the
// zero-token stand-in for what browser-use/CUA get by re-perceiving before every action: when a
// step carries no post-condition, a moved page is the only local evidence that a prior recovery
// attempt may already have taken effect. Same tolerance as the state_changed assertion, so a
// live clock or a lazily-loaded image doesn't read as "the action worked".
// Missing either side → false: absent evidence must never be reported as movement.
function signatureChanged(before, after) {
  if (!before || !after) return false;
  if (before.url !== after.url) return true;
  if (before.interactiveCount !== after.interactiveCount) return true;
  return Math.abs(before.textLen - after.textLen) > STATE_CHANGED_TEXT_LEN_TOLERANCE;
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

// withDeadline moved to page_eval.js (EXEC-29 Guard A) so resolution.js/failure_response.js can
// share it without a require cycle through this file's own `rootCandidates` dependency.
// Re-exported below for existing callers of `require("./assertions").withDeadline`.

async function pollPositive(checkFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let result = false;
    try { result = await withDeadline(checkFn, deadline, false); } catch (_) { result = false; }
    if (result) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(r => setTimeout(r, Math.min(VERIFY_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()))));
  }
}

async function pollNegative(checkAbsentFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let absentNow = false;
    try { absentNow = await withDeadline(checkAbsentFn, deadline, false); } catch (_) { absentNow = false; }
    if (absentNow) {
      await new Promise(r => setTimeout(r, NEGATIVE_STABILIZE_MS));
      let stillAbsent = false;
      try { stillAbsent = await withDeadline(checkAbsentFn, deadline, false); } catch (_) { stillAbsent = false; }
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

const URL_ASSERTION_TYPES = new Set(["url_changed", "url_exact", "url_pattern", "url"]);

// Full navigations may need the page-load budget; same-document hash checks do not.
function assertionTimeout(type, target, declaredMs) {
  const declared = Number(declaredMs) || 0;
  if (!URL_ASSERTION_TYPES.has(type)) return declared || 3000;
  if (type === "url_pattern" || type === "url") {
    const raw = String(target || "");
    if (raw.startsWith("#")) return declared || 3000;
  }
  return Math.max(declared, PAGE_LOAD_TIMEOUT_MS);
}

async function evaluateAssertion(roots, page, a, inputs, baseline) {
  const type = String(a.type || "").toLowerCase();
  const target = interpolate(String(a.target || a.pattern || a.url || a.selector || a.text || ""), inputs);
  const required = a.required !== false;
  const timeout = assertionTimeout(type, target, a.timeout_ms);
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

async function verifyStep(page, step, inputs, baseline = null, dialogQueue = null) {
  // A native alert/confirm/prompt blocks the page's renderer thread until the *next* step
  // (dialog_accept/dialog_dismiss, which carries no assertions of its own) resolves it — no
  // DOM/URL/value check on THIS step can possibly answer while that's true, and every one of
  // them would hang forever on the CDP round-trip (see pollPositive/pollNegative's own
  // deadline guard above, which is the fallback for the case a dialog opens mid-poll instead
  // of before verification starts). This isn't a workaround: the step's real post-condition
  // ("a dialog opened") already happened, so skipping is the correct verdict, not a skipped one.
  if (dialogQueue && dialogQueue.length) {
    return { pass: true, channel: "dialog_pending", evidence: "a JS dialog is open", results: [] };
  }
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

// Whether a pre-action page signature must be captured for this step. Two reasons now:
// a state_changed assertion needs it as its baseline, and (EXEC-24) any non-idempotent step
// needs it as the evidence the recovery guard consults before re-dispatching. The `required`
// filter was dropped from the assertion arm deliberately — compiled assertions currently ship
// advisory-only, so requiring `required` here would leave every state_changed check baseline-less.
function needsStateChangedBaseline(step) {
  if (isNonIdempotent(step)) return true;
  return stepAssertions(step).some(a => a && String(a.type || "").toLowerCase() === "state_changed");
}

module.exports = {
  stepAssertions,
  normText,
  capturePreStepSignature,
  signatureChanged,
  VERIFY_POLL_INTERVAL_MS,
  pollPositive,
  pollNegative,
  evaluateAssertion,
  verifyStep,
  hasRequiredAssertion,
  needsStateChangedBaseline,
  withDeadline,
};
