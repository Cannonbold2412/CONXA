"use strict";
// page_eval.js — EXEC-29 Guard A. A leaf module (no dependency on resolution.js/assertions.js,
// so both can require it without a cycle) providing the one seam every page/locator `.evaluate()`
// call in runtime/app should go through.
//
// Why this exists: `page.evaluate()`/`locator.evaluate()` is a CDP round-trip into the page's own
// JS thread. A native dialog (window.alert/confirm/prompt), a synchronous `beforeunload` prompt,
// or simply a backgrounded/throttled tab can leave that thread unable to respond — and Playwright
// gives evaluate() no timeout of its own, so the call never resolves and never rejects. Recovery's
// own `EXECUTION_DEADLINE_MS` watchdog (server.js) is poll-based, checked only between operations
// (see its comment there), so it cannot interrupt a call that is itself stuck. See docs/TRD.md's
// runtime-timeout section and TODO.md EXEC-29 for the incident this closes.
//
// The abandoned call is never cancelled — CDP calls aren't cancelable — it just stops being
// awaited here. Promise.race still attaches a handler, so a late rejection/resolution is not an
// unhandled rejection, it is simply ignored.

const DEFAULT_EVAL_DEADLINE_MS = 5000;

function withDeadline(fn, deadline, fallback) {
  const remaining = Math.max(0, deadline - Date.now());
  return Promise.race([
    fn(),
    new Promise(resolve => setTimeout(() => resolve(fallback), remaining)),
  ]);
}

// Sentinel distinguishable from any real evaluate() result (which can legitimately be
// `undefined`/`null`/`false`) so callers can tell "timed out" apart from "the page really
// returned that".
const EVAL_TIMED_OUT = Symbol("page_eval_timed_out");

// `target` is anything with an `.evaluate(script, arg)` method — a Page or a Locator. `ms`
// defaults to DEFAULT_EVAL_DEADLINE_MS, deliberately short: every caller here is a best-effort
// probe (gate check, dom inventory, overlay probe), never the step's own required action.
async function evalOn(target, script, arg, ms = DEFAULT_EVAL_DEADLINE_MS) {
  const deadline = Date.now() + ms;
  return withDeadline(
    () => (arg === undefined ? target.evaluate(script) : target.evaluate(script, arg)),
    deadline,
    EVAL_TIMED_OUT,
  );
}

module.exports = {
  DEFAULT_EVAL_DEADLINE_MS,
  withDeadline,
  evalOn,
  EVAL_TIMED_OUT,
};
