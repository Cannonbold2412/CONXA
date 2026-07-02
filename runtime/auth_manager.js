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
// A unique random key is generated per machine per company on first use and
// stored in the OS keychain.  It is used as HKDF key material to encrypt the
// target-platform browser session at rest (AES-256-GCM).  Keeping it separate
// from the installer-embedded sync_token means a leaked installer cannot
// decrypt session files from individual users' machines.

const _SESSION_KEY_SVC = "conxa-session";
const HKDF_INFO = Buffer.from("conxa-session-v1");

async function getSessionKey(company, logFn) {
  const keytar = _getKeytar(logFn);
  let raw = await keytar.getPassword(_SESSION_KEY_SVC, company);
  if (!raw) {
    // First use: generate a fresh random 32-byte key, store as hex.
    const key = crypto.randomBytes(32).toString("hex");
    await keytar.setPassword(_SESSION_KEY_SVC, company, key);
    raw = key;
  }
  return raw;
}

function _deriveKey(sessionKeyHex) {
  return crypto.hkdfSync("sha256", Buffer.from(sessionKeyHex, "hex"), Buffer.alloc(32), HKDF_INFO, 32);
}

// Returns true on success, false on failure — callers must check this before
// deciding whether a plaintext fallback write is warranted (SG-11).
function saveEncryptedSession(company, state, sessionKeyHex, sessionsDir, logFn) {
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
    fs.writeFileSync(path.join(sessionsDir, `${company}_state.json`), payload);
    return true;
  } catch (e) {
    if (logFn) logFn("warn", "session_encryption_failed", { company, error: e.message });
    return false;
  }
}

function loadDecryptedSession(company, sessionKeyHex, sessionsDir) {
  const sessionPath = path.join(sessionsDir, `${company}_state.json`);
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
function saveRawSession(company, state, sessionsDir, logFn) {
  if (logFn) logFn("warn", "plaintext_session_written", { company });
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, `${company}_raw_state.json`),
      JSON.stringify(state, null, 2),
      { mode: 0o600 }
    );
  } catch (_) {}
}

function loadRawSession(company, sessionsDir, logFn) {
  const p = path.join(sessionsDir, `${company}_raw_state.json`);
  try {
    if (!fs.existsSync(p)) return null;
    if (logFn) logFn("warn", "plaintext_session_loaded", { company });
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
    const company = name.slice(0, -suffix.length);
    const rawPath = path.join(sessionsDir, name);
    let state;
    try {
      state = JSON.parse(fs.readFileSync(rawPath, "utf8"));
    } catch (_) {
      continue; // corrupted — leave it, don't lose the only copy
    }
    try {
      const sessionKey = await getSessionKeyFn(company, logFn);
      const ok = saveEncryptedSession(company, state, sessionKey, sessionsDir, logFn);
      if (ok) {
        fs.unlinkSync(rawPath);
        if (logFn) logFn("info", "plaintext_session_reencrypted", { company });
      } else if (logFn) {
        logFn("warn", "plaintext_session_reencrypt_failed", { company });
      }
    } catch (e) {
      if (logFn) logFn("warn", "plaintext_session_reencrypt_failed", { company, error: e.message });
    }
  }
}

// Max attempts before escalating to Tier 5 (human review).
const AUTH_REFRESH_MAX_ATTEMPTS = 3;
const _authRefreshAttempts = new Map();

/**
 * Attempt to re-authenticate an expired target-platform session.
 *
 * - Headed mode (Windows or DISPLAY set): opens Playwright to loginUrl, waits
 *   for the user to complete login (up to 3 min), saves fresh storageState.
 * - Headless (no DISPLAY on Linux): returns immediately with an error payload
 *   so Claude can surface "Re-login required" to the user — never hangs.
 *
 * Returns { ok: true } on success, { ok: false, session_expired: true, login_url, message } on failure.
 */
async function refreshSession(company, loginUrl, context, sessionsDir, logFn) {
  const attempts = (_authRefreshAttempts.get(company) || 0) + 1;
  _authRefreshAttempts.set(company, attempts);
  if (attempts > AUTH_REFRESH_MAX_ATTEMPTS) {
    return { ok: false, session_expired: true, login_url: loginUrl, message: "Auth refresh failed 3 times — escalating to human review." };
  }

  const headless = process.platform !== "win32" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  if (headless) {
    return { ok: false, session_expired: true, login_url: loginUrl, message: "Re-login required (headless mode — no browser available)." };
  }

  const MAX_CLOSE_RETRIES = 2;
  for (let retry = 0; retry <= MAX_CLOSE_RETRIES; retry++) {
    let authPage = null;
    try {
      authPage = await context.newPage();
      await authPage.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await authPage.waitForURL(
        (url) => !AUTH_FAILURE_URL_RE.test(url.pathname),
        { timeout: 180_000 }
      );
      const state = await context.storageState();
      const sessionKey = await getSessionKey(company, logFn);
      const encrypted = saveEncryptedSession(company, state, sessionKey, sessionsDir, logFn);
      if (!encrypted) saveRawSession(company, state, sessionsDir, logFn);
      _authRefreshAttempts.delete(company);
      return { ok: true };
    } catch (e) {
      const browserClosed = /Target page|context or browser|browser has been closed|page has been closed/i.test(e.message);
      if (browserClosed && retry < MAX_CLOSE_RETRIES) continue;
      return { ok: false, session_expired: true, login_url: loginUrl, message: `Re-login timed out or failed: ${e.message}` };
    } finally {
      if (authPage) await authPage.close().catch(() => {});
    }
  }
  return { ok: false, session_expired: true, login_url: loginUrl, message: "Re-login cancelled: login window was closed. Please run the skill again." };
}

// Regex re-export so run.js can share the same pattern without duplicating it.
const AUTH_FAILURE_URL_RE = /\/(login|signin|sign-in|auth|logout|session-expired)(\/|$|\?)/i;

module.exports = {
  getSessionKey,
  saveEncryptedSession,
  loadDecryptedSession,
  saveRawSession,
  loadRawSession,
  reencryptPlaintextSessions,
  refreshSession,
};
