"use strict";
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

// keytar loaded at runtime (native .node file alongside exe or regular require)
let _keytar = null;
function _getKeytar(logFn) {
  if (_keytar) return _keytar;
  try {
    if (process.pkg) {
      // running as pkg bundle: keytar.node is a sibling of the exe
      const nativePath = path.join(path.dirname(process.execPath), "keytar.node");
      const mod = { exports: {} };
      process.dlopen(mod, nativePath);
      _keytar = mod.exports;
    } else {
      _keytar = require("keytar");
    }
  } catch (e) {
    // keytar unavailable — fall back to plaintext file (dev/testing only)
    if (logFn) logFn("warn", "keytar_unavailable_fallback", { error: e.message });
    _keytar = {
      // Honor the resolved CONXA_DATA_DIR (set per-env by bootstrap's env.apply())
      // so dev tokens land in the dev tree, never the prod ~/.conxa. Uses path.join
      // instead of the old string concat, which mis-joined the fallback.
      _file: path.join(process.env.CONXA_DATA_DIR || path.join(require("os").homedir(), ".conxa"), "cache", ".keytar.json"),
      _load() {
        try { return JSON.parse(fs.readFileSync(this._file, "utf8")); } catch (_) { return {}; }
      },
      async getPassword(svc, acct) { return this._load()[`${svc}:${acct}`] || null; },
      async setPassword(svc, acct, val) {
        const data = this._load();
        data[`${svc}:${acct}`] = val;
        fs.mkdirSync(path.dirname(this._file), { recursive: true });
        fs.writeFileSync(this._file, JSON.stringify(data, null, 2));
      },
    };
  }
  return _keytar;
}

// ─── Per-machine session-encryption key ──────────────────────────────────────
// A unique random key is generated per machine per workspace on first use and
// stored in the OS keychain.  It is used as HKDF key material to encrypt the
// target-platform browser session at rest (AES-256-GCM).  Keeping it separate
// from the installer-embedded sync_token means a leaked installer cannot
// decrypt session files from individual users' machines.

const _SESSION_KEY_SVC = "conxa-session";
const HKDF_INFO = Buffer.from("conxa-session-v1");

async function getSessionKey(workspace_id, logFn) {
  const keytar = _getKeytar(logFn);
  let raw = await keytar.getPassword(_SESSION_KEY_SVC, workspace_id);
  if (!raw) {
    // First use: generate a fresh random 32-byte key, store as hex.
    const key = crypto.randomBytes(32).toString("hex");
    await keytar.setPassword(_SESSION_KEY_SVC, workspace_id, key);
    raw = key;
  }
  return raw;
}

function _deriveKey(sessionKeyHex) {
  return crypto.hkdfSync("sha256", Buffer.from(sessionKeyHex, "hex"), Buffer.alloc(32), HKDF_INFO, 32);
}

// Returns true on success, false on failure — callers must check this before
// deciding whether a plaintext fallback write is warranted (SG-11).
function saveEncryptedSession(workspace_id, state, sessionKeyHex, sessionsDir, logFn) {
  try {
    const key    = _deriveKey(sessionKeyHex);
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc    = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
    const tag    = cipher.getAuthTag();
    const payload = JSON.stringify({
      iv:   iv.toString("base64"),
      tag:  tag.toString("base64"),
      data: enc.toString("base64"),
    });
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, `${workspace_id}_state.json`), payload);
    return true;
  } catch (e) {
    if (logFn) logFn("warn", "session_encryption_failed", { workspace_id, error: e.message });
    return false;
  }
}

function loadDecryptedSession(workspace_id, sessionKeyHex, sessionsDir) {
  const sessionPath = path.join(sessionsDir, `${workspace_id}_state.json`);
  if (!fs.existsSync(sessionPath)) return null;
  try {
    const { iv, tag, data } = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    const key     = _deriveKey(sessionKeyHex);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
    return JSON.parse(dec.toString());
  } catch (_) {
    return null; // corrupted or wrong key — fresh session needed
  }
}

// Save unencrypted session — only called as an explicit fallback once
// saveEncryptedSession() has reported failure (SG-11). Logs visibly since
// this leaves live target-platform credentials on disk unencrypted.
function saveRawSession(workspace_id, state, sessionsDir, logFn) {
  if (logFn) logFn("warn", "plaintext_session_written", { workspace_id });
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, `${workspace_id}_raw_state.json`),
      JSON.stringify(state, null, 2),
      { mode: 0o600 }
    );
  } catch (_) {}
}

function loadRawSession(workspace_id, sessionsDir, logFn) {
  const p = path.join(sessionsDir, `${workspace_id}_raw_state.json`);
  try {
    if (!fs.existsSync(p)) return null;
    if (logFn) logFn("warn", "plaintext_session_loaded", { workspace_id });
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) { return null; }
}

// One-time startup sweep: encrypt any stale plaintext session files left by
// prior keytar failures, and delete the plaintext originals on success (SG-11).
async function reencryptPlaintextSessions(sessionsDir, getSessionKeyFn, logFn) {
  let entries;
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch (_) {
    return; // sessions dir doesn't exist yet — nothing to do
  }
  const suffix = "_raw_state.json";
  for (const name of entries) {
    if (!name.endsWith(suffix)) continue;
    const workspace_id = name.slice(0, -suffix.length);
    const rawPath = path.join(sessionsDir, name);
    let state;
    try {
      state = JSON.parse(fs.readFileSync(rawPath, "utf8"));
    } catch (_) {
      continue; // corrupted — leave it, don't lose the only copy
    }
    try {
      const sessionKey = await getSessionKeyFn(workspace_id, logFn);
      const ok = saveEncryptedSession(workspace_id, state, sessionKey, sessionsDir, logFn);
      if (ok) {
        fs.unlinkSync(rawPath);
        if (logFn) logFn("info", "plaintext_session_reencrypted", { workspace_id });
      } else if (logFn) {
        logFn("warn", "plaintext_session_reencrypt_failed", { workspace_id });
      }
    } catch (e) {
      if (logFn) logFn("warn", "plaintext_session_reencrypt_failed", { workspace_id, error: e.message });
    }
  }
}

// A blocking, in-context mid-run re-login (open a page inside the LIVE execution context and
// wait up to 3 minutes for the user) used to live here as `refreshSession`. Removed — it had
// zero production callers (only its own now-removed test) and directly contradicted the
// pre-flight-only authentication model: authentication is validated once, before a run starts
// (see browser.js's getGroupAuthContext) and a mid-run auth failure always fails immediately
// (see run.js's isAuthFailure / server.js's session_expired handling) rather than attempting
// any in-place recovery. Do not reintroduce a mid-run re-login path.

module.exports = {
  getSessionKey,
  saveEncryptedSession,
  loadDecryptedSession,
  saveRawSession,
  loadRawSession,
  reencryptPlaintextSessions,
};
