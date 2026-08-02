"use strict";
// Pure-node tests for Phase 5: auth-failure detection + refreshSession stub.
// Run with: node runtime/test/test_auth_recovery.js

const assert = require("assert");
const { isAuthFailure } = require("../run");
const { _reachedProtectedUrl } = require("../browser");

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function makePage(url, title = "My App") {
  return {
    url: () => url,
    title: async () => title,
  };
}

(async () => {
  console.log("isAuthFailure detection:");

  await test("login path → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/login")), true);
  });

  await test("signin path → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/signin?redirect=/dashboard")), true);
  });

  await test("session-expired path → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/session-expired")), true);
  });

  await test("auth path → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/auth/challenge")), true);
  });

  await test("normal dashboard path → not auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://dashboard.render.com/services")), false);
  });

  await test("title 'Sign in to Render' → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://render.com/other", "Sign in to Render")), true);
  });

  await test("title 'Session Expired' → auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/", "Session Expired")), true);
  });

  await test("normal page title → not auth failure", async () => {
    assert.equal(await isAuthFailure(makePage("https://app.example.com/dashboard", "Dashboard")), false);
  });

  await test("login in subpath of legitimate URL → not auth failure", async () => {
    // /app/login-history should NOT match — regex requires login at end, /, or ?
    assert.equal(await isAuthFailure(makePage("https://app.example.com/settings/login-history")), false);
  });

  console.log("\n_reachedProtectedUrl (interactive-login capture gate):");

  await test("lands on protectedUrl's host, off any login path → reached", async () => {
    assert.equal(_reachedProtectedUrl("https://dashboard.render.com/services", "https://dashboard.render.com/"), true);
  });

  await test("still on protectedUrl's own /login path → not reached", async () => {
    assert.equal(_reachedProtectedUrl("https://dashboard.render.com/login", "https://dashboard.render.com/"), false);
  });

  await test("mid-flow on Google OAuth host → not reached (but not a rejection either — different host)", async () => {
    // This is the bug this fix addresses: an OAuth leg's URL contains "auth"/"oauth"/"signin",
    // which the old whole-URL substring check flagged as "still on the login page" even after
    // the user finished signing in and Google redirected back. Hostname-scoping fixes that by
    // simply not treating an unrelated host as a verdict either way — capture waits for the
    // redirect back to protectedUrl's host instead.
    assert.equal(_reachedProtectedUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=x", "https://dashboard.render.com/"), false);
  });

  await test("redirected back to protectedUrl's host after OAuth → reached", async () => {
    assert.equal(_reachedProtectedUrl("https://dashboard.render.com/?authuser=0", "https://dashboard.render.com/"), true);
  });

  await test("different host entirely → not reached", async () => {
    assert.equal(_reachedProtectedUrl("https://example.com/", "https://dashboard.render.com/"), false);
  });

  await test("no protectedUrl known yet → never reached", async () => {
    assert.equal(_reachedProtectedUrl("https://dashboard.render.com/", ""), false);
  });

  console.log("\nrefreshSession headless mode:");
  const { refreshSession } = require("../auth_manager");

  await test("headless → returns ok:false session_expired without hanging", async () => {
    const origDisplay  = process.env.DISPLAY;
    const origWayland  = process.env.WAYLAND_DISPLAY;
    const origPlatform = process.platform;
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const result = await refreshSession("acme", "https://example.com/login", null, "/tmp");
    Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
    if (origDisplay)  process.env.DISPLAY = origDisplay;
    if (origWayland)  process.env.WAYLAND_DISPLAY = origWayland;
    assert.equal(result.ok, false);
    assert.equal(result.session_expired, true);
    assert.ok(result.login_url);
    assert.ok(result.message);
  });

  await test("attempt limit exceeded → ok:false without trying browser", async () => {
    // Call 4 times (limit is 3) to trigger the attempt guard
    const origPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    delete process.env.DISPLAY;
    const company = `test-limit-${Date.now()}`;
    for (let i = 0; i < 4; i++) {
      await refreshSession(company, "https://example.com/login", null, "/tmp");
    }
    // 4th call: attempt counter > 3, should hit the limit message
    const result = await refreshSession(company, "https://example.com/login", null, "/tmp");
    Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
    assert.equal(result.ok, false);
    assert.match(result.message, /3 times|limit|escalat/i);
  });

  console.log("\nsession encryption fallback logging (SG-11):");
  const authManager = require("../auth_manager");
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  await test("saveEncryptedSession returns false and logs a warning on failure", async () => {
    // A regular file in place of the sessions dir makes mkdirSync throw deterministically.
    const blockingFile = path.join(os.tmpdir(), `conxa-test-block-${Date.now()}`);
    fs.writeFileSync(blockingFile, "x");
    const warnings = [];
    const logFn = (level, msg) => { if (level === "warn") warnings.push(msg); };
    const ok = authManager.saveEncryptedSession("acme", { cookies: [] }, "aa".repeat(32), blockingFile, logFn);
    fs.unlinkSync(blockingFile);
    assert.equal(ok, false);
    assert.ok(warnings.includes("session_encryption_failed"));
  });

  await test("reencryptPlaintextSessions encrypts and deletes a planted plaintext session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-sessions-"));
    const company = "reencrypt-co";
    const rawPath = path.join(dir, `${company}_raw_state.json`);
    fs.writeFileSync(rawPath, JSON.stringify({ cookies: [] }));
    const events = [];
    const logFn = (level, msg) => events.push(`${level}:${msg}`);
    await authManager.reencryptPlaintextSessions(dir, async () => "bb".repeat(32), logFn);
    assert.ok(!fs.existsSync(rawPath), "plaintext original should be deleted");
    assert.ok(fs.existsSync(path.join(dir, `${company}_state.json`)), "encrypted file should exist");
    assert.ok(events.includes("info:plaintext_session_reencrypted"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test("reencryptPlaintextSessions leaves plaintext in place if key fetch fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-sessions-"));
    const company = "reencrypt-fail-co";
    const rawPath = path.join(dir, `${company}_raw_state.json`);
    fs.writeFileSync(rawPath, JSON.stringify({ cookies: [] }));
    const events = [];
    const logFn = (level, msg) => events.push(`${level}:${msg}`);
    await authManager.reencryptPlaintextSessions(dir, async () => { throw new Error("keytar down"); }, logFn);
    assert.ok(fs.existsSync(rawPath), "plaintext should remain when re-encryption fails");
    assert.ok(events.includes("warn:plaintext_session_reencrypt_failed"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const total = passed + failed;
  console.log(`\n${passed}/${total} passed`);
  process.exit(failed > 0 ? 1 : 0);
})();
