"use strict";
// Runtime-side consumer of the unified, Ed25519-signed manifest.json (see
// conxa-cloud/backend/app/api/updates_routes.py + manifest_signer.py). Replaces the
// old _checkHostUpdate()/_checkAppUpdate() cold-start checks in server.js: one signed
// manifest instead of two unsigned ones, real percentage-based staged rollout instead
// of "always take the latest", and versioned directories (see version_manager.js)
// instead of the old .bak/.next single-backup dance.
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const httpClient = require("./http_client");

const versionManager = (typeof global !== "undefined" && global.__versionManager)
  ? global.__versionManager
  : require("./version_manager");

function _semver() {
  return (typeof global !== "undefined" && global.__hostRequire) ? global.__hostRequire("semver") : require("semver");
}

function _sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(_sortKeysDeep);
  if (obj && typeof obj === "object") {
    return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = _sortKeysDeep(obj[k]); return acc; }, {});
  }
  return obj;
}

// Mirrors manifest_signer.py's _canonical_json exactly: sorted keys, no whitespace,
// `signature` excluded (it cannot sign over its own value).
function _canonicalJSON(manifest) {
  const { signature, ...unsigned } = manifest;
  return JSON.stringify(_sortKeysDeep(unsigned));
}

// Verify manifest.signature (base64 Ed25519) against the base64 raw public key baked
// into the host exe at build time. A manifest that fails this check is treated exactly
// like a network failure — discarded outright, never read for any field.
function verifyManifestSignature(manifest, publicKeyB64) {
  if (!manifest || !manifest.signature || !publicKeyB64) return false;
  try {
    const keyObject = crypto.createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKeyB64, "base64").toString("base64url") },
      format: "jwk",
    });
    return crypto.verify(null, Buffer.from(_canonicalJSON(manifest), "utf8"), keyObject, Buffer.from(manifest.signature, "base64"));
  } catch (_) {
    return false;
  }
}

// Deterministic 0-99 bucket for (installId, componentName) — stable across polls so a
// staged rollout doesn't reshuffle which installs are "in" on every check, and salted
// per-component so one install isn't always first-or-last across every rollout at once.
function rolloutBucket(installId, componentName) {
  const digest = crypto.createHash("sha256").update(`${installId}:${componentName}`).digest();
  return digest.readUInt32BE(0) % 100;
}

function _coerce(v) { return v ? _semver().coerce(String(v)) : null; }
function _gt(a, b) { const pa = _coerce(a), pb = _coerce(b); return pa && pb ? _semver().gt(pa, pb) : false; }
function _lt(a, b) { const pa = _coerce(a), pb = _coerce(b); return pa && pb ? _semver().lt(pa, pb) : false; }

// Decide whether to take a component update: min_host floor (refuses outright — a host
// too old to run the new layer must never activate-then-rollback on every launch, see
// bootstrap.js's pre-load app update), version comparison, minimum_versions floor
// (forces update, ignoring rollout, if currently below the floor), `required` flag
// (bypasses rollout once newer), and percentage rollout bucketing otherwise.
function decideUpdate({ componentName, manifestEntry, currentVersion, installId, minimumVersion, hostVersion }) {
  if (!manifestEntry || !manifestEntry.version) return { update: false, reason: "no_manifest_entry" };

  if (manifestEntry.min_host && hostVersion) {
    const minHost = _coerce(manifestEntry.min_host);
    const host = _coerce(hostVersion);
    if (minHost && host && _semver().lt(host, minHost)) {
      return { update: false, reason: "host_too_old" };
    }
  }

  if (!currentVersion) return { update: true, reason: "not_installed" };
  if (!_gt(manifestEntry.version, currentVersion)) return { update: false, reason: "up_to_date" };

  if (minimumVersion && _lt(currentVersion, minimumVersion)) {
    return { update: true, reason: "below_minimum_version" };
  }
  if (manifestEntry.required) return { update: true, reason: "required" };

  const rollout = manifestEntry.rollout || { percentage: 100 };
  if (rollout.halted) return { update: false, reason: "rollout_halted" };
  const pct = typeof rollout.percentage === "number" ? rollout.percentage : 100;
  if (pct >= 100) return { update: true, reason: "rollout_100" };
  const bucket = rolloutBucket(installId, componentName);
  return { update: bucket < pct, reason: bucket < pct ? "rollout_in" : "rollout_out" };
}

function _fetchJSON(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = httpClient.get(url, { headers: { "User-Agent": "conxa-runtime/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.setTimeout(timeoutMs || 8000, () => { req.destroy(); reject(new Error("request timeout")); });
    req.on("error", reject);
  });
}

function _downloadBuffer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = httpClient.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs || 120000, () => { req.destroy(); reject(new Error("download timeout")); });
    req.on("error", reject);
  });
}

// Fetch + verify the unified manifest. Always hits the network — no local TTL cache —
// so a launch never silently skips the check the way the old 1-hour cache did; the
// cache file below exists purely as the network-failure/bad-signature fallback. On
// any such failure falls back to the last cache entry that itself passed verification —
// the cache file is only ever written after a successful verify, so re-serving it is
// always safe.
async function fetchManifest(apiUrl, cacheFile, options = {}) {
  const { publicKeyB64, log = () => {}, channel } = options;

  let manifest;
  try {
    const q = channel ? `?channel=${encodeURIComponent(channel)}` : "";
    manifest = await _fetchJSON(`${apiUrl}/api/v1/manifest.json${q}`, 3000);
  } catch (e) {
    log("warn", "manifest_fetch_failed", { reason: e.message });
    return _lastVerifiedCache(cacheFile);
  }

  if (!verifyManifestSignature(manifest, publicKeyB64)) {
    log("warn", "manifest_signature_invalid", {});
    return _lastVerifiedCache(cacheFile);
  }

  manifest._cached_at = Date.now();
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(manifest));
    fs.renameSync(tmp, cacheFile);
  } catch (_) {}
  return manifest;
}

function _lastVerifiedCache(cacheFile) {
  try { return JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (_) { return null; }
}

// Download with exponential backoff (500ms, 1s, 2s, 4s, capped at 8s; 5 attempts) and
// SHA-256 verification. Restart-from-scratch on failure rather than resuming partial
// downloads — GitHub Release asset Range-request support isn't consistent enough to
// build resumable logic around, and artifact sizes here don't warrant the complexity.
async function downloadArtifact(url, expectedSha256, options = {}) {
  const { maxRetries = 5, initialBackoffMs = 500, maxBackoffMs = 8000, timeoutMs = 120000, log = () => {} } = options;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(initialBackoffMs * Math.pow(2, attempt - 1), maxBackoffMs);
      await new Promise((r) => setTimeout(r, backoff));
    }
    try {
      const buf = await _downloadBuffer(url, timeoutMs);
      if (expectedSha256) {
        const actual = crypto.createHash("sha256").update(buf).digest("hex");
        if (actual.toLowerCase() !== String(expectedSha256).toLowerCase()) {
          throw new Error(`sha256 mismatch: expected ${expectedSha256}, got ${actual}`);
        }
      }
      return buf;
    } catch (e) {
      lastErr = e;
      log("warn", "artifact_download_retry", { url, attempt, error: e.message });
    }
  }
  throw new Error(`download failed after ${maxRetries} attempts: ${lastErr && lastErr.message}`);
}

function _extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    let cmd, args;
    if (process.platform === "win32") {
      cmd = "powershell";
      args = ["-NonInteractive", "-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`];
    } else {
      cmd = "unzip";
      args = ["-o", zipPath, "-d", destDir];
    }
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`))));
    p.on("error", reject);
  });
}

// Spawn the new host exe with --selfcheck (server.js exits 0 immediately for this
// flag) before ever letting `current` point at it. Runs against an inert, non-running
// file — no lock/race concerns, purely "does this binary boot at all." CONXA_DIR is
// passed explicitly (not left to ambient env inheritance) so the check always exercises
// the exact install this update run is managing, matching whatever `conxaDir` the
// caller passed to checkForUpdates() rather than assuming process.env.CONXA_DIR agrees.
function _selfcheck(exePath, conxaDir, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    let settled = false;
    const p = spawn(exePath, ["--selfcheck"], { stdio: "ignore", env: { ...process.env, CONXA_DIR: conxaDir } });
    const timer = setTimeout(() => { if (!settled) { settled = true; try { p.kill(); } catch (_) {} resolve(false); } }, timeoutMs);
    p.on("close", (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve(code === 0); } });
    p.on("error", () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } });
  });
}

// conxa_runtime ships as raw files (exe + native addon), not a zip — download each
// into its own version directory, selfcheck the exe, then activate.
async function updateHostComponent(componentDir, entry, conxaDir, log = () => {}) {
  const versionDir = path.join(componentDir, entry.version);
  try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch (_) {}
  fs.mkdirSync(versionDir, { recursive: true });

  for (const file of entry.files || []) {
    const buf = await downloadArtifact(file.url, file.sha256, { log });
    fs.writeFileSync(path.join(versionDir, file.filename), buf);
  }
  fs.writeFileSync(path.join(versionDir, "version.json"), JSON.stringify({
    host_version: entry.version,
    released_at: entry.released_at || new Date().toISOString(),
  }));

  const exePath = path.join(versionDir, "conxa-runtime.exe");
  if (fs.existsSync(exePath)) {
    const ok = await _selfcheck(exePath, conxaDir);
    if (!ok) throw new Error(`new host exe failed --selfcheck: ${entry.version}`);
  }

  return versionManager.activate(componentDir, versionDir, { requiredFiles: ["conxa-runtime.exe"], keep: 3 });
}

// conxa_app ships as a single zip — download, extract, validate, activate. Called from
// two places with different consequences: bootstrap.js's pre-load caller flips `current`
// before server.js is ever require()'d, so that activation takes effect THIS launch (see
// checkForUpdates' components filter). server.js's post-load caller (host-exe leg only in
// practice now, but the function itself doesn't know that) can't do this — this process
// already has the old server.js in its module cache, so flipping `current` there only
// takes effect on the next cold start.
// downloadOptions lets bootstrap.js's pre-load caller tighten maxRetries/timeoutMs —
// that call sits on the launch path (see checkForUpdates below), so it can't accept
// downloadArtifact's default up-to-two-minute-per-attempt budget the post-load,
// non-blocking server.js caller can afford.
async function updateAppComponent(componentDir, entry, log = () => {}, downloadOptions = {}) {
  const zipFile = (entry.files || []).find((f) => f.filename.endsWith(".zip"));
  if (!zipFile) throw new Error("app manifest entry missing a .zip artifact");
  const buf = await downloadArtifact(zipFile.url, zipFile.sha256, { log, ...downloadOptions });

  const versionDir = path.join(componentDir, entry.version);
  const stageDir = `${versionDir}.staging-${process.pid}-${Date.now()}`;
  const zipPath = `${stageDir}.zip`;
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(zipPath, buf);
  await _extractZip(zipPath, stageDir);
  try { fs.unlinkSync(zipPath); } catch (_) {}

  try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch (_) {}
  fs.renameSync(stageDir, versionDir);

  if (!fs.existsSync(path.join(versionDir, "version.json"))) {
    fs.writeFileSync(path.join(versionDir, "version.json"), JSON.stringify({
      app_version: entry.version,
      min_host: entry.min_host || "",
      released_at: entry.released_at || new Date().toISOString(),
    }));
  }

  return versionManager.activate(componentDir, versionDir, { requiredFiles: ["server.js"], keep: 3 });
}

// Top-level orchestration, called from two places:
//   - bootstrap.js, pre-load, with components: ["conxa_app"] only — decides/activates
//     the app-layer update before server.js is ever require()'d, so it takes effect
//     THIS launch instead of the next one.
//   - server.js's startupSync, post-load, with components: ["conxa_runtime"] and
//     ctx.manifest passed through from bootstrap's fetch (when available) so the
//     manifest is fetched at most once per launch.
// Fetches the manifest (unless one is passed in), decides which of the requested
// components need updating, and activates them. Skill-pack artifacts are NOT handled
// here — sync.js's per-company/per-skill delta sync (see runtime/sync.js) remains the
// transport for skill content; the manifest's skill_packs section carries version/compat
// metadata only (no files[]), so it never broadcasts one company's proprietary workflow
// checksums to every other install.
async function checkForUpdates(ctx) {
  const {
    apiUrl, conxaDir, installId, publicKeyB64, channel, hostVersion,
    components = ["conxa_runtime", "conxa_app"],
    appDownloadOptions = {},
    isComponentBusy = () => false, // e.g. () => activeExecution !== null
    log = () => {},
  } = ctx;

  const cacheFile = path.join(conxaDir, "manifest.json");
  const manifest = ctx.manifest || await fetchManifest(apiUrl, cacheFile, { publicKeyB64, log, channel });
  if (!manifest) { log("warn", "manifest_unavailable", {}); return { manifest: null, results: {} }; }

  const minimums = manifest.minimum_versions || {};
  const results = {};

  if (components.includes("conxa_runtime")) {
    const hostDir = path.join(conxaDir, "conxa-runtime");
    const hostCurrent = versionManager.currentVersion(hostDir);
    const hostDecision = decideUpdate({
      componentName: "conxa_runtime", manifestEntry: manifest.conxa_runtime,
      currentVersion: hostCurrent, installId, minimumVersion: minimums.conxa_runtime,
    });
    if (hostDecision.update) {
      try {
        results.conxa_runtime = await updateHostComponent(hostDir, manifest.conxa_runtime, conxaDir, log);
        log("info", "host_update_activated", results.conxa_runtime);
      } catch (e) {
        log("warn", "host_update_failed", { error: e.message });
      }
    }
  }

  if (components.includes("conxa_app")) {
    const appDir = path.join(conxaDir, "conxa-app");
    const appCurrent = versionManager.currentVersion(appDir);
    const appDecision = decideUpdate({
      componentName: "conxa_app", manifestEntry: manifest.conxa_app,
      currentVersion: appCurrent, installId, minimumVersion: minimums.conxa_app, hostVersion,
    });
    if (appDecision.update && !isComponentBusy("conxa_app")) {
      try {
        results.conxa_app = await updateAppComponent(appDir, manifest.conxa_app, log, appDownloadOptions);
        log("info", "app_update_activated", results.conxa_app);
      } catch (e) {
        log("warn", "app_update_failed", { error: e.message });
      }
    }
  }

  return { manifest, results };
}

module.exports = {
  verifyManifestSignature,
  rolloutBucket,
  decideUpdate,
  fetchManifest,
  downloadArtifact,
  updateHostComponent,
  updateAppComponent,
  checkForUpdates,
};
