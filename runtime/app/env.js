"use strict";
/**
 * Runtime environment resolver — the dev/prod switch for the MCP runtime.
 *
 * `apply()` runs ONCE at the very top of bootstrap.js (the host-exe entry) and
 * normalizes process.env with the resolved path roots, update channel, and cloud
 * API base for the active environment. Because bootstrap loads the disk-resident
 * app layer (server.js, run.js, …) in the *same* process, those files read the
 * already-normalized process.env and need no env.js of their own.
 *
 * SAFETY DEFAULT = prod. Unlike the cloud/Studio-side Python config (which
 * defaults to dev so a developer workstation never touches prod), a *shipped*
 * runtime on a customer machine must default to the prod tree (~/.conxa) and the
 * `stable` update channel — otherwise an already-deployed install with no
 * CONXA_ENV set could relocate its data or start pulling untested dev builds.
 * Dev is therefore opt-in, only via an explicit CONXA_ENV=dev.
 *
 * Every value still honors an explicit override (CONXA_DIR, CONXA_DATA_DIR,
 * CONXA_APP_DIR, CONXA_UPDATE_CHANNEL, CONXA_API_URL) — the NSIS installer sets
 * CONXA_DIR + CONXA_ENV + CONXA_UPDATE_CHANNEL per install, so both lanes can run
 * side by side under Claude Desktop.
 */
const path = require("path");
const os   = require("os");

function isExplicitDev() {
  const raw = String(process.env.CONXA_ENV || "").trim().toLowerCase();
  return raw === "dev" || raw === "development" || raw === "local";
}

function resolve() {
  const dev  = isExplicitDev();
  const env  = dev ? "dev" : "prod";
  const home = os.homedir();

  // Install root (read-only tree): honor explicit CONXA_DIR, else per-env default.
  const conxaDir = process.env.CONXA_DIR || path.join(home, dev ? ".conxa-dev" : ".conxa");

  // Writable data root: honor explicit, else per-env, per-platform.
  const dataDir = process.env.CONXA_DATA_DIR || (
    process.platform === "win32"
      ? path.join(home, "AppData", "Roaming", dev ? "Conxa-Dev" : "Conxa")
      : conxaDir
  );

  // App-layer component root (contains <version>/ + current/).
  const appDir = process.env.CONXA_APP_DIR || path.join(conxaDir, "conxa-app");

  // Update channel: explicit wins; else dev only when dev is explicitly requested,
  // otherwise stable — so deployed prod runtimes never fetch dev prereleases.
  const channel = String(process.env.CONXA_UPDATE_CHANNEL || (dev ? "dev" : "stable"))
    .trim().toLowerCase();

  // Cloud API base (self-update manifest + telemetry): explicit CONXA_API_URL wins.
  const apiUrl = process.env.CONXA_API_URL || (dev ? "http://127.0.0.1:8000" : "https://apis.conxa.in");

  return { env, dev, conxaDir, dataDir, appDir, channel, apiUrl };
}

/** Normalize process.env in place so all disk-loaded layers + child spawns agree. */
function apply() {
  const r = resolve();
  process.env.CONXA_ENV            = r.env;
  process.env.CONXA_DIR            = r.conxaDir;
  process.env.CONXA_DATA_DIR       = r.dataDir;
  process.env.CONXA_APP_DIR        = r.appDir;
  process.env.CONXA_UPDATE_CHANNEL = r.channel;
  process.env.CONXA_API_URL        = r.apiUrl;
  return r;
}

module.exports = { resolve, apply, isExplicitDev };
