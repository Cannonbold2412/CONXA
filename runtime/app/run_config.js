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

module.exports = {
  envNumber,
  CAPTURE_PRESTEP,
  ACTION_TIMEOUT_MS,
  SECONDARY_ACTION_TIMEOUT_MS,
  RECOVERY_LOCATOR_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  DOWNLOAD_WAIT_TIMEOUT_MS,
  RUN_RETENTION_MS,
};
