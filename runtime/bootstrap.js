"use strict";
const path          = require("path");
const fs            = require("fs");
const os            = require("os");
const semver        = require("semver");
const versionManager = require("./version_manager");

const HOST_VERSION = require("./package.json").host_version || "host-v1.0.0";
const CONXA_DIR    = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");
// APP_ROOT is the component root (contains v1.0.0/, v1.1.0/, current/) — not the live dir itself.
const APP_ROOT = process.env.CONXA_APP_DIR || path.join(CONXA_DIR, "conxa-app");

// Expose bundled npm modules and host metadata to disk-loaded app code.
// App JS files use (global.__hostRequire || require)('playwright') etc.
// __runtimeVersion lets server.js (loaded from disk) read the version baked
// into the host exe without doing require('./package.json') relative to conxa-app/current/.
// __versionManager lets every disk-loaded layer (app, skill sync) share the exact same
// junction-handling code the host uses, instead of shipping/duplicating their own copy.
// __manifestPublicKey lets manifest_manager.js (loaded from disk) verify the signed
// manifest without shipping the key itself in the app-layer zip — it's baked into the
// host exe at build time (same stamping step as host_version/version).
global.__hostRequire      = (id) => require(id);
global.__hostPkg          = !!process.pkg;
global.__runtimeVersion   = require("./package.json").version;
global.__versionManager   = versionManager;
global.__manifestPublicKey = require("./package.json").ed25519_public_key || "";

function tryLoad(dir) {
  if (!dir) return false; // resolveCurrent()/rollback() return null when nothing is installed yet
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

const primaryDir = versionManager.resolveCurrent(APP_ROOT);
if (!tryLoad(primaryDir)) {
  const rolledBack = versionManager.rollback(APP_ROOT);
  const fallbackDir = rolledBack ? versionManager.resolveCurrent(APP_ROOT) : null;
  if (fallbackDir && tryLoad(fallbackDir)) {
    process.stderr.write(
      `[bootstrap] primary app layer unusable — rolled back to ${fallbackDir}\n` +
      `  The app will re-download the latest version on next startup.\n`
    );
  } else {
    process.stderr.write(
      `[bootstrap] FATAL: no usable app layer found under ${APP_ROOT}\n` +
      `  Expected: ${path.join(APP_ROOT, "current", "server.js")}\n` +
      `  Reinstall or restore the conxa-app package.\n`
    );
    process.exit(1);
  }
}
