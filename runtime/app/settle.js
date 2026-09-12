"use strict";
/**
 * settle.js — EXEC-37 failure-path settle detection.
 *
 * The compiled `wait_for` shape is inferred from ONE observed page load at record time
 * (validation_planner.py::infer_wait_for_shape) and never reaches the runtime directly — it is
 * lowered into `validation.assertions` at compile time (build.py::_build_assertions). A single
 * observation is calibrated to whatever network/server conditions happened to exist during that
 * one recording: it silently under- or over-waits on a slow morning, a cold cache, or a server
 * under load, and today there is no way to distinguish that from genuine breakage.
 *
 * This module adds settle detection as a FALLBACK on the failure path only — after an ordinary
 * resolution/verify miss, before recovery — never as a new inter-step wait. A currently-passing
 * run's timing is unaffected; only a run that was about to fail gets one more chance once the
 * page visibly stops changing.
 *
 * ponytail: a two-sample shape-counter poll (page_scripts.js::settleSignature), not a
 * MutationObserver bridge — upgrade only if a real site defeats this (a busy indicator with no
 * aria-busy/role=progressbar/spinner-class marker at all).
 */
const pageScripts = require("./page_scripts");
const { evalOn, EVAL_TIMED_OUT } = require("./page_eval");

// Mirrors assertions.js's STATE_CHANGED_TEXT_LEN_TOLERANCE so "settled" and "state changed" agree
// on how much incidental text noise (a live "2s ago" widget, a ticking clock) to tolerate.
const TEXT_LEN_TOLERANCE = 20;

function sameShape(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.textLen - b.textLen) <= TEXT_LEN_TOLERANCE &&
    a.interactiveCount === b.interactiveCount &&
    a.nodeCount === b.nodeCount &&
    a.busyCount === 0 &&
    b.busyCount === 0
  );
}

// Polls the page's shape (evalOn'd through the deadline seam, so a hung renderer can't hang this
// either) until two consecutive samples match with no visible busy indicator, or budgetMs
// elapses. Never throws. On an already-stable page this returns after a single poll interval —
// the smallest cost that still proves "waiting here wouldn't have changed anything."
async function waitForSettle(page, { budgetMs = 8000, pollMs = 250 } = {}) {
  const start = Date.now();
  const deadline = start + budgetMs;
  let prev = null;
  while (Date.now() < deadline) {
    const remaining = Math.max(50, Math.min(pollMs, deadline - Date.now()));
    let sig;
    try {
      sig = await evalOn(page, pageScripts.settleSignature, undefined, remaining);
    } catch (_) {
      return { settled: false, waitedMs: Date.now() - start, reason: "eval_error" };
    }
    if (sig === EVAL_TIMED_OUT) {
      return { settled: false, waitedMs: Date.now() - start, reason: "eval_timed_out" };
    }
    if (prev && sameShape(prev, sig)) {
      return { settled: true, waitedMs: Date.now() - start, reason: "stable" };
    }
    prev = sig;
    const sleepMs = Math.min(pollMs, Math.max(0, deadline - Date.now()));
    if (sleepMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
  return { settled: false, waitedMs: Date.now() - start, reason: "budget_exceeded" };
}

module.exports = { waitForSettle, sameShape, TEXT_LEN_TOLERANCE };
