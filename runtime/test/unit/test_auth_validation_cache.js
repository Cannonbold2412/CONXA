// Auth-validation TTL cache (browser.js): a successful network validation is
// stamped per app key into SESSIONS_DIR/_auth_validation_cache.json; repeat
// runs within CONXA_AUTH_VALIDATION_TTL_MS skip the live check. The stamp is
// keyed on the session file's mtime so a rewritten session (fresh interactive
// login) invalidates the cached verdict. Offline unit tests — no Chromium.
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

// Isolate CONXA_DATA_DIR/CONXA_DIR before requiring browser.js (it reads env at
// module load). Short TTL so the expiry case can be exercised by sleeping.
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-auth-cache-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;
process.env.CONXA_AUTH_VALIDATION_TTL_MS = "300";

const browser = require("../../app/browser");
const { _readValidationCache, _writeValidationCache, AUTH_VALIDATION_TTL_MS } = browser;

function sessionFile(name) {
  const p = path.join(tmpDataDir, name);
  fs.writeFileSync(p, JSON.stringify({ cookies: [] }));
  return p;
}

async function run() {
  console.log("auth-validation TTL cache:");
  assert.strictEqual(AUTH_VALIDATION_TTL_MS, 300, "TTL env override should apply at module load");

  await check("missing/corrupt cache reads as no stamp", () => {
    assert.strictEqual(_readValidationCache("k", sessionFile("s1.json")), 0);
  });

  await check("written stamp reads back within TTL", () => {
    const p = sessionFile("s2.json");
    _writeValidationCache("app_a", p);
    assert.ok(_readValidationCache("app_a", p) > 0);
    // A different key must not match
    assert.strictEqual(_readValidationCache("app_b", p), 0);
  });

  await check("rewritten session file (mtime change) invalidates the stamp", async () => {
    const p = sessionFile("s3.json");
    _writeValidationCache("app_c", p);
    const old = fs.statSync(p).mtimeMs / 1000;
    await new Promise((r) => setTimeout(r, 20));
    fs.utimesSync(p, old + 10, old + 10); // simulate a fresh interactive login rewriting the file
    assert.strictEqual(_readValidationCache("app_c", p), 0);
  });

  await check("stamp expires after TTL", async () => {
    const p = sessionFile("s4.json");
    _writeValidationCache("app_d", p);
    assert.ok(_readValidationCache("app_d", p) > 0);
    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(_readValidationCache("app_d", p), 0);
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
}

run();
