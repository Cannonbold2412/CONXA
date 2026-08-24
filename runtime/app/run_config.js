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
const RUN_RETENTION_MS             = envNumber("CONXA_RUN_RETENTION_DAYS", 7) * 86400000;
// tabs.js's per-step page settle (domcontentloaded wait on every tab switch/navigation).
const SETTLE_TIMEOUT_MS            = envNumber("CONXA_SETTLE_TIMEOUT_MS", 60000);
// Cap on tabs.js's "wait for a site-opened tab to navigate itself off about:blank" — a real
// popup navigates within a couple seconds of opening; one that hasn't in NAV_SETTLE_CAP_MS
// isn't going to, so this bounds that wait independently of the full settle/page-load budget
// (same pattern as run.js's networkidle cap below).
const NAV_SETTLE_CAP_MS            = envNumber("CONXA_NAV_SETTLE_CAP_MS", 10000);

module.exports = {
  envNumber,
  CAPTURE_PRESTEP,
  ACTION_TIMEOUT_MS,
  SECONDARY_ACTION_TIMEOUT_MS,
  RECOVERY_LOCATOR_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  DOWNLOAD_WAIT_TIMEOUT_MS,
  RUN_RETENTION_MS,
  SETTLE_TIMEOUT_MS,
  NAV_SETTLE_CAP_MS,
};
