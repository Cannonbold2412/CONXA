"use strict";
const path   = require("path");
const fs     = require("fs");
const os     = require("os");
const semver = require("semver");

const HOST_VERSION = require("./package.json").host_version || "host-v1.0.0";
const CONXA_DIR    = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");
const APP_DIR = process.env.CONXA_APP_DIR || path.join(CONXA_DIR, "conxa-app");

// Expose bundled npm modules to disk-loaded app code.
// App JS files call (global.__hostRequire || require)('playwright') etc.
global.__hostRequire = (id) => require(id);
global.__hostPkg     = !!process.pkg;

function tryLoad(dir) {
  const versionFile = path.join(dir, "version.json");
  if (!fs.existsSync(versionFile)) return false;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(versionFile, "utf8")); } catch (_) { return false; }

  const minHost = meta.min_host ? semver.coerce(meta.min_host) : null;
  const thisHost = semver.coerce(HOST_VERSION);
  if (minHost && thisHost && semver.lt(thisHost, minHost)) {
    process.stderr.write(
      `[bootstrap] ${dir}: app layer requires host >=${meta.min_host}, have ${HOST_VERSION} — skipping\n`
    );
    return false;
  }

  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) return false;

  try {
    require(entry);
    return true;
  } catch (e) {
    process.stderr.write(
      `[bootstrap] failed to load ${entry}: ${e.message}\n`
    );
    return false;
  }
}

const APP_BAK = APP_DIR + ".bak";
if (!tryLoad(APP_DIR)) {
  if (tryLoad(APP_BAK)) {
    process.stderr.write(
      `[bootstrap] primary app layer unusable — running last-good fallback from ${APP_BAK}\n` +
      `  The app will re-download the latest version on next startup.\n`
    );
  } else {
    process.stderr.write(
      `[bootstrap] FATAL: no app layer found at ${APP_DIR} (or ${APP_BAK})\n` +
      `  Expected: ${path.join(APP_DIR, "server.js")}\n` +
      `  Reinstall or restore the conxa-app package.\n`
    );
    process.exit(1);
  }
}
