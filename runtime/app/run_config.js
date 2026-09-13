"use strict";
/**
 * run_config.js — environment-tunable execution constants for the run engine,
 * extracted from run.js. Pure data: each value honors its env override with the
 * exact same default it used to be hardcoded with (see envNumber).
 */

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const CAPTURE_PRESTEP              = process.env.CONXA_CAPTURE_PRESTEP !== "0";
const ACTION_TIMEOUT_MS            = envNumber("CONXA_ACTION_TIMEOUT_MS", 2500);
const SECONDARY_ACTION_TIMEOUT_MS  = envNumber("CONXA_SECONDARY_ACTION_TIMEOUT_MS", 2500);
const RECOVERY_LOCATOR_TIMEOUT_MS  = envNumber("CONXA_RECOVERY_LOCATOR_TIMEOUT_MS", 3000);
const PAGE_LOAD_TIMEOUT_MS         = envNumber("CONXA_PAGE_LOAD_TIMEOUT_MS", 60000);
const DOWNLOAD_WAIT_TIMEOUT_MS     = envNumber("CONXA_DOWNLOAD_WAIT_MS", 120000);
// An upload step's setInputFiles() only resolves once the browser has attached the file to the
// input — it says nothing about whether the page's own upload request (XHR/fetch to a server)
// has finished. There's no native Playwright "upload complete" event to queue on (unlike
// download_observed's real page.on("download", ...)), so networkidle after attaching the file
// is the best available proxy: best-effort, catches its own timeout, never fails the step.
const UPLOAD_SETTLE_TIMEOUT_MS     = envNumber("CONXA_UPLOAD_SETTLE_MS", 20000);
// A dialog_accept/dialog_dismiss step isn't guaranteed to find its dialog already queued the
// instant it runs, same reasoning as DOWNLOAD_WAIT_TIMEOUT_MS above — was ACTION_TIMEOUT_MS
// (2500ms) until a dialog arriving even slightly late made HANDLERS["dialog_accept"] silently
// no-op instead of resolving it.
const DIALOG_WAIT_TIMEOUT_MS       = envNumber("CONXA_DIALOG_WAIT_MS", 120000);
const RUN_RETENTION_MS             = envNumber("CONXA_RUN_RETENTION_DAYS", 7) * 86400000;
// tabs.js's per-step page settle (domcontentloaded wait on every tab switch/navigation).
const SETTLE_TIMEOUT_MS            = envNumber("CONXA_SETTLE_TIMEOUT_MS", 60000);
// Cap on tabs.js's "wait for a site-opened tab to navigate itself off about:blank" — a real
// popup navigates within a couple seconds of opening; one that hasn't in NAV_SETTLE_CAP_MS
// isn't going to, so this bounds that wait independently of the full settle/page-load budget
// (same pattern as run.js's networkidle cap below).
const NAV_SETTLE_CAP_MS            = envNumber("CONXA_NAV_SETTLE_CAP_MS", 10000);

// BUILD-30: a virtualized grid's target row isn't in the DOM until scrolled into range —
// resolution.js scrolls-and-re-gathers on a miss when the step carries real evidence of
// virtualization (a compiled handler_hints.virtualized_container hint, or an entity binding).
// Kill switch first: CONXA_VIRTUAL_SCROLL=0 disables the whole feature and restores today's
// behavior exactly (a virtualized row fails like any other miss, no cascade for entity_not_found).
const VIRTUAL_SCROLL_ENABLED       = process.env.CONXA_VIRTUAL_SCROLL !== "0";
// One-time extension of withLocator's PRIMARY deadline, applied only once a scroll pass backed
// by real evidence has actually run — an ordinary step's timing (ACTION_TIMEOUT_MS, 2500ms
// default) is unaffected. 15s at ~120ms per retry-and-scroll cycle covers a long grid.
const VIRTUAL_SCROLL_BUDGET_MS     = envNumber("CONXA_VIRTUAL_SCROLL_BUDGET_MS", 15000);
// Hard cap on scroll passes for one step, independent of the deadline above — belt-and-braces
// against a pathological container that never reports reaching bottom/top.
const VIRTUAL_SCROLL_MAX_PASSES    = envNumber("CONXA_VIRTUAL_SCROLL_MAX_PASSES", 40);

// EXEC-37: settle-detection fallback on the FAILURE path only (an ordinary resolution/verify
// miss, before recovery) — a currently-passing run never calls this, so its timing is unaffected.
// Kill switch first: CONXA_SETTLE_RETRY=0 disables the whole feature and restores today's
// behavior exactly (a miss goes straight to recovery, no settle-and-retry attempt).
const SETTLE_RETRY_ENABLED         = process.env.CONXA_SETTLE_RETRY !== "0";
const SETTLE_BUDGET_MS             = envNumber("CONXA_SETTLE_BUDGET_MS", 8000);
const SETTLE_POLL_MS               = envNumber("CONXA_SETTLE_POLL_MS", 250);

// EXEC-38: hard ceiling on a for_each loop's row count, independent of (and always <=) the
// step's own compiled max_iterations — belt-and-braces against a hand-edited/malformed pack
// shipping an unreasonably large cap. A loop step with no max_iterations at all refuses to run.
const MAX_LOOP_ITERATIONS          = envNumber("CONXA_MAX_LOOP_ITERATIONS", 100);

module.exports = {
  envNumber,
  CAPTURE_PRESTEP,
  ACTION_TIMEOUT_MS,
  SECONDARY_ACTION_TIMEOUT_MS,
  RECOVERY_LOCATOR_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  DOWNLOAD_WAIT_TIMEOUT_MS,
  UPLOAD_SETTLE_TIMEOUT_MS,
  DIALOG_WAIT_TIMEOUT_MS,
  RUN_RETENTION_MS,
  SETTLE_TIMEOUT_MS,
  NAV_SETTLE_CAP_MS,
  VIRTUAL_SCROLL_ENABLED,
  VIRTUAL_SCROLL_BUDGET_MS,
  VIRTUAL_SCROLL_MAX_PASSES,
  SETTLE_RETRY_ENABLED,
  SETTLE_BUDGET_MS,
  SETTLE_POLL_MS,
  MAX_LOOP_ITERATIONS,
};
