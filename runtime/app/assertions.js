"use strict";
// Post-action VERIFY seam, extracted from run.js: compiled assertion access,
// polling primitives, per-type assertion evaluation, and verifyStep.
const pageScripts = require("./page_scripts");
const { interpolate } = require("./interpolate");
const { PAGE_LOAD_TIMEOUT_MS } = require("./run_config");
const { asObject, asArray } = require("./step_utils");
const { rootCandidates } = require("./resolution");

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

const URL_ASSERTION_TYPES = new Set(["url_changed", "url_exact", "url_pattern", "url"]);

async function evaluateAssertion(roots, page, a, inputs, baseline) {
  const type = String(a.type || "").toLowerCase();
  const target = interpolate(String(a.target || a.pattern || a.url || a.selector || a.text || ""), inputs);
  const required = a.required !== false;
  // A URL assertion following navigation shares the page's real load budget, not the compiler's
  // narrower default (compiled packs can carry a short wait_for timeout from before the page-load
  // budget was raised) — otherwise a slow navigation fails its own assertion before the page ever
  // finishes loading.
  const timeout = URL_ASSERTION_TYPES.has(type)
    ? Math.max(Number(a.timeout_ms) || 0, PAGE_LOAD_TIMEOUT_MS)
    : (Number(a.timeout_ms) || 3000);
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

module.exports = {
  stepAssertions,
  normText,
  capturePreStepSignature,
  VERIFY_POLL_INTERVAL_MS,
  pollPositive,
  pollNegative,
  evaluateAssertion,
  verifyStep,
  hasRequiredAssertion,
  needsStateChangedBaseline,
};
