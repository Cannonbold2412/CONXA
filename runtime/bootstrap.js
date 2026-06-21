"use strict";
const path   = require("path");
const fs     = require("fs");
const os     = require("os");
const semver = require("semver");

const HOST_VERSION = require("./package.json").host_version || "host-v1.0.0";
const CONXA_DIR    = process.env.CONXA_DIR || (
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), "conxa")
    : path.join(os.homedir(), ".conxa")
);
const APP_DIR = path.join(CONXA_DIR, "conxa-app");

// Register .jsc extension so Node can load V8 bytecode files from disk
require("bytenode");

// Expose bundled npm modules to disk-loaded app code.
// App JS files call (global.__hostRequire || require)('playwright') etc.
global.__hostRequire = (id) => require(id);
global.__hostPkg     = !!process.pkg;

function loadAppLayer() {
  const versionFile = path.join(APP_DIR, "version.json");
  if (!fs.existsSync(versionFile)) return false;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(versionFile, "utf8")); } catch (_) { return false; }

  const minHost = meta.min_host ? semver.coerce(meta.min_host) : null;
  const thisHost = semver.coerce(HOST_VERSION);
  if (minHost && thisHost && semver.lt(thisHost, minHost)) {
    process.stderr.write(
      `[bootstrap] app layer requires host >=${meta.min_host}, have ${HOST_VERSION} — using bundled fallback\n`
    );
    return false;
  }

  const entry = path.join(APP_DIR, "server.jsc");
  if (!fs.existsSync(entry)) return false;

  require(entry);
  return true;
}

if (!loadAppLayer()) {
  // Fallback: load bundled source from the pkg VFS.
  // This handles: first boot before any app-layer download, corrupted conxa-app/, host/app mismatch.
  // All app JS files are listed in pkg.scripts so they are included in the VFS at build time.
  require("./server");
}
