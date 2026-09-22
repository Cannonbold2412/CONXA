// Remembered landing address (browser.js): docs/artifacts/login-desk.html "Follow the journey" —
// the first real stop after a sign-in is learned and stored in
// SESSIONS_DIR/_landing_urls.json, so a later run has a real protectedUrl to check even when the
// app has no configured success_url. Offline unit tests — no Chromium.
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; });
}

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-landing-urls-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../../app/browser");
const { _readLanding, _writeLanding, _protectedUrlOf } = browser;

async function run() {
  console.log("remembered landing address:");

  await check("missing key reads as empty", () => {
    assert.strictEqual(_readLanding("no_such_key"), "");
  });

  await check("a normal app page is remembered as its origin, path dropped", () => {
    _writeLanding("ws_a__app1", "https://app.acme-cloud.io/dashboard/reports?x=1");
    assert.strictEqual(_readLanding("ws_a__app1"), "https://app.acme-cloud.io/");
  });

  await check("a known sign-in-service host is never learned as the landing address", () => {
    _writeLanding("ws_a__app2", "https://accounts.google.com/signin/v2/identifier");
    assert.strictEqual(_readLanding("ws_a__app2"), "");
  });

  await check("a still login-shaped address is never learned", () => {
    _writeLanding("ws_a__app3", "https://app.acme.com/login");
    assert.strictEqual(_readLanding("ws_a__app3"), "");
  });

  await check("blank/empty input is a no-op", () => {
    _writeLanding("ws_a__app4", "");
    assert.strictEqual(_readLanding("ws_a__app4"), "");
  });

  await check("a later write for the same key overwrites the earlier one", () => {
    _writeLanding("ws_a__app1", "https://app2.acme-cloud.io/home");
    assert.strictEqual(_readLanding("ws_a__app1"), "https://app2.acme-cloud.io/");
  });

  await check("_protectedUrlOf prefers success_url, then the learned landing address, then login_url", () => {
    const app = { login_url: "https://login.acme.com/login" };
    assert.strictEqual(_protectedUrlOf(app, "ws_b__nothing_learned"), app.login_url, "falls back to login_url with nothing learned");

    _writeLanding("ws_b__learned", "https://app.acme-cloud.io/home");
    assert.strictEqual(_protectedUrlOf(app, "ws_b__learned"), "https://app.acme-cloud.io/", "prefers the learned landing address over login_url");

    const withSuccess = { ...app, success_url: "https://app.acme-cloud.io/{}" };
    assert.strictEqual(_protectedUrlOf(withSuccess, "ws_b__learned"), withSuccess.success_url, "an explicit success_url always wins");
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
}

run();
