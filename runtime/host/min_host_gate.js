"use strict";
/**
 * Pure evaluation of the app-layer min_host compatibility gate.
 *
 * Extracted verbatim from bootstrap.js's tryLoad() so the most fragile safety
 * net in the system (the semver check that refuses to load an app layer built
 * for a newer host) can be unit-tested without spawning a real exe or touching
 * the disk-resident app layer.
 *
 * All side effects are injectable:
 *   - existsSync / readFileSync default to fs
 *   - loadEntry defaults to require(entry)
 *   - warn defaults to writing to process.stderr
 *
 * Returns a structured result instead of throwing; callers decide how to react
 * (bootstrap.js falls through to version_manager.rollback() on failure).
 */
const path   = require("path");
const semver = require("semver");

function _defaultWarn(message) {
  process.stderr.write(message);
}

function evaluateAppLayer(dir, hostVersion, options = {}) {
  const existsSync  = options.existsSync || ((p) => require("fs").existsSync(p));
  const readFileSync = options.readFileSync || ((p) => require("fs").readFileSync(p, "utf8"));
  const loadEntry   = options.loadEntry || ((entry) => { require(entry); });
  const warn        = options.warn || _defaultWarn;

  // resolveCurrent()/rollback() return null when nothing is installed yet
  if (!dir) return { loaded: false, reason: "no-dir", message: "" };

  const versionFile = path.join(dir, "version.json");
  if (!existsSync(versionFile)) return { loaded: false, reason: "no-version-json", message: "" };

  let meta;
  try { meta = JSON.parse(readFileSync(versionFile)); } catch (_) {
    return { loaded: false, reason: "malformed-version-json", message: "" };
  }

  const minHost = meta.min_host ? semver.coerce(meta.min_host) : null;
  const thisHost = semver.coerce(hostVersion);
  if (minHost && thisHost && semver.lt(thisHost, minHost)) {
    const message =
      `[bootstrap] ${dir}: app layer requires host >=${meta.min_host}, have ${hostVersion} — skipping\n`;
    if (!options.quiet) warn(message);
    return { loaded: false, reason: "host-too-old", message, requiredMinHost: meta.min_host };
  }

  const entry = path.join(dir, "server.js");
  if (!existsSync(entry)) return { loaded: false, reason: "no-entry", message: "" };

  try {
    loadEntry(entry);
    return { loaded: true, reason: null, message: "", entry };
  } catch (e) {
    const message = `[bootstrap] failed to load ${entry}: ${e.message}\n`;
    warn(message);
    return { loaded: false, reason: "load-failed", message };
  }
}

module.exports = { evaluateAppLayer };
