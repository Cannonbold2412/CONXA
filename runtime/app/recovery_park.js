"use strict";
/**
 * recovery_park.js — state for the parked failed page used by agent-mediated
 * (Tier 3/4) cross-call recovery, extracted from server.js.
 *
 * Agent-mediated recovery is inherently cross-call: the runtime fails a step → returns a
 * recovery request to Claude → Claude resumes with a corrected selector. If the failed page
 * were torn down, the resume would begin on a blank page and `resume_from` would skip the
 * navigation that established state — so the agent's *correct* selector would act on the WRONG
 * (blank) page and fail again. We instead PARK the live failed page (browser+context+page) and
 * resume the override on it, so recovery operates on the exact DOM the agent reasoned about. A
 * TTL closes the park if the agent never resumes, so a browser is never leaked.
 */
const crypto = require("crypto");
const pageScripts = require("./page_scripts");

// Small headroom so incidental noise (a live clock, an ad slot) doesn't false-flag divergence.
const PARK_DIVERGENCE_TOLERANCE = 3;

let _parkedRecovery = null;

function getParked() {
  return _parkedRecovery;
}

function setParked(park) {
  _parkedRecovery = park;
}

// Cheap page-state token (url + interactive-element count + a hash of visible body text) —
// the same page-fingerprint concept used for pre-exec drift detection, reused here to answer
// "has the parked page moved since the recovery request described it?" (SPA re-render, a
// background timer, a websocket push can all mutate a parked page while the agent reasons).
// Not a security/identity hash — collision tolerance is intentionally loose.
async function capturePageFingerprint(page) {
  try {
    const url = page.url();
    const { interactiveCount, text } = await page.evaluate(pageScripts.pageFingerprint);
    return { url, interactiveCount, domHash: crypto.createHash("sha256").update(text).digest("hex") };
  } catch (_) {
    return null;
  }
}

async function discardPark(reason, log) {
  const park = _parkedRecovery;
  _parkedRecovery = null;
  if (!park) return;
  clearTimeout(park.timer);
  if (log) log("info", "recovery_park_discarded", { slug: park.slug, reason });
  try { await park.page.close(); } catch (_) {}
  // Headless browsers are owned by browser.js's per-company cache (idle-closed there). A watch
  // (visible) browser is not cached, so close it here.
  if (park.watch) {
    try { await park.context.close(); } catch (_) {}
    try { await park.browser.close(); } catch (_) {}
  }
}

module.exports = {
  PARK_DIVERGENCE_TOLERANCE,
  getParked,
  setParked,
  capturePageFingerprint,
  discardPark,
};
