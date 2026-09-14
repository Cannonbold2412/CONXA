// Session-file precedence (browser.js::_loadSessionForKey): a group app (or single
// workspace) session lives in two files — an encrypted `<key>_state.json` and a plaintext
// `<key>_raw_state.json` (written by Build Studio's _stage_runtime_auth, or a save that
// fell back to saveRawSession). The loader must pick whichever is NEWEST, not always the
// encrypted one — the bug this guards: a freshly re-authenticated group app stayed
// "expired" until the whole runtime process restarted, because the old code always
// preferred the encrypted file regardless of which was actually more recent. Offline unit
// tests — no Chromium.
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      pass++;
    })
    .catch((e) => {
      console.log(`  ✗ ${name}: ${e.message}`);
      process.exitCode = 1;
    });
}

// Isolate CONXA_DATA_DIR/CONXA_DIR before requiring browser.js/auth_manager.js (env read
// at module load / first keytar lookup). No real keytar in CI, so auth_manager falls back
// to a plaintext-key file under this same tmp dir — fine, this test only exercises
// session-file precedence, not key storage.
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-session-precedence-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../../app/browser");
const authManager = require("../../app/auth_manager");
const { _loadSessionForKey } = browser;

// Must match browser.js's own SESSIONS_DIR = CONXA_DATA_DIR/cache/sessions (module-level,
// computed from the env vars set above) — _loadSessionForKey builds its paths from that
// constant internally, so this test has to write into the same directory.
const sessionsDir = path.join(tmpDataDir, "cache", "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });

function encPath(key) { return path.join(sessionsDir, `${key}_state.json`); }
function rawPath(key) { return path.join(sessionsDir, `${key}_raw_state.json`); }

function writeRaw(key, cookieName) {
  fs.writeFileSync(rawPath(key), JSON.stringify({ cookies: [{ name: cookieName }] }));
}

async function writeEncrypted(key, cookieName) {
  const token = await authManager.getSessionKey(key);
  authManager.saveEncryptedSession(key, { cookies: [{ name: cookieName }] }, token, sessionsDir);
}

function bumpMtime(p, deltaMs) {
  const t = (fs.statSync(p).mtimeMs + deltaMs) / 1000;
  fs.utimesSync(p, t, t);
}

async function run() {
  console.log("session-file precedence:");

  await check("raw newer than encrypted: returns raw contents, promotes to encrypted, deletes raw", async () => {
    const key = "wsA__app1";
    await writeEncrypted(key, "old-cookie");
    bumpMtime(encPath(key), -10000); // make the encrypted file look older
    writeRaw(key, "new-cookie");

    const { stored, sessionPath } = await _loadSessionForKey(key, authManager);
    assert.strictEqual(stored.cookies[0].name, "new-cookie");
    assert.strictEqual(sessionPath, encPath(key));
    assert.ok(!fs.existsSync(rawPath(key)), "raw file should be deleted after promotion");

    // The encrypted file must now decrypt to the promoted (new) contents.
    const token = await authManager.getSessionKey(key);
    const reloaded = authManager.loadDecryptedSession(key, token, sessionsDir);
    assert.strictEqual(reloaded.cookies[0].name, "new-cookie");
  });

  await check("encrypted newer than raw: returns encrypted, raw left untouched", async () => {
    const key = "wsB__app1";
    writeRaw(key, "stale-raw");
    bumpMtime(rawPath(key), -10000);
    await writeEncrypted(key, "current-cookie");

    const { stored, sessionPath } = await _loadSessionForKey(key, authManager);
    assert.strictEqual(stored.cookies[0].name, "current-cookie");
    assert.strictEqual(sessionPath, encPath(key));
    assert.ok(fs.existsSync(rawPath(key)), "raw file must not be touched");
  });

  await check("raw only: returns raw contents, promoted to encrypted", async () => {
    const key = "wsC__app1";
    writeRaw(key, "only-raw");

    const { stored, sessionPath } = await _loadSessionForKey(key, authManager);
    assert.strictEqual(stored.cookies[0].name, "only-raw");
    assert.strictEqual(sessionPath, encPath(key));
    assert.ok(!fs.existsSync(rawPath(key)));
  });

  await check("encrypted only: returns encrypted contents (no regression on the common path)", async () => {
    const key = "wsD__app1";
    await writeEncrypted(key, "enc-only");

    const { stored, sessionPath } = await _loadSessionForKey(key, authManager);
    assert.strictEqual(stored.cookies[0].name, "enc-only");
    assert.strictEqual(sessionPath, encPath(key));
  });

  await check("neither file exists: returns null stored/sessionPath", async () => {
    const { stored, sessionPath } = await _loadSessionForKey("wsE__app1", authManager);
    assert.strictEqual(stored, null);
    assert.strictEqual(sessionPath, null);
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
}

run();
