// captureReAuth must resolve the DYING app by the failing page's own host, not the
// group's start app — a group pack's manifest.target_url is the app the workflow
// STARTS in, which is the wrong app when a sibling's session is the one that died
// mid-run. See CLAUDE.md's group-auth notes and server.js's call site.
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

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-reauth-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../browser.js");

const WORKSPACE_ID = "acme";
const RENDER = { id: "app_render", name: "Render", login_url: "https://dashboard.render.com/login", success_url: "https://dashboard.render.com/home" };
const BILLING = { id: "app_billing", name: "Billing", login_url: "https://billing.example.com/login", success_url: "https://billing.example.com/home" };

function writePack(groups) {
  const dir = path.join(tmpDataDir, "skill-packs", WORKSPACE_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({ workspace_id: WORKSPACE_ID, groups }));
}

async function run() {
  writePack([{ id: "g1", name: "Sales", apps: [RENDER, BILLING] }]);

  await check("resolves the app matching the failing page's own host, not the manifest's start app", async () => {
    const calls = [];
    const logFn = (_level, event, data) => calls.push({ event, data });
    // The failing page bounced to Billing's login screen — server.js passes that
    // page's live URL as loginUrl, ahead of manifest.target_url (Render, the start app).
    await browser.captureReAuth(WORKSPACE_ID, "https://billing.example.com/login", null, tmpDataDir, logFn, {
      groupId: "g1",
      fallbackUrl: "https://dashboard.render.com",
    });
    const resolved = calls.find((c) => c.event === "reauth_app_resolved");
    assert.ok(resolved, "expected a reauth_app_resolved log");
    assert.strictEqual(resolved.data.appId, "app_billing");
    assert.strictEqual(resolved.data.matchedBy, "failing-page-host");
  });

  await check("falls back to the manifest's fallback host when the failing-page host matches nothing", async () => {
    const calls = [];
    const logFn = (_level, event, data) => calls.push({ event, data });
    // A third-party OAuth hop landed on a host that matches no app in the group.
    await browser.captureReAuth(WORKSPACE_ID, "https://accounts.google.com/o/oauth2/auth", null, tmpDataDir, logFn, {
      groupId: "g1",
      fallbackUrl: "https://dashboard.render.com",
    });
    const resolved = calls.find((c) => c.event === "reauth_app_resolved");
    assert.ok(resolved);
    assert.strictEqual(resolved.data.appId, "app_render");
    assert.strictEqual(resolved.data.matchedBy, "manifest-fallback-host");
  });

  await check("falls back to the group's first app when nothing matches at all", async () => {
    const calls = [];
    const logFn = (_level, event, data) => calls.push({ event, data });
    await browser.captureReAuth(WORKSPACE_ID, "https://accounts.google.com/o/oauth2/auth", null, tmpDataDir, logFn, {
      groupId: "g1",
      fallbackUrl: "https://also-unmatched.example.net",
    });
    const resolved = calls.find((c) => c.event === "reauth_app_resolved");
    assert.ok(resolved);
    assert.strictEqual(resolved.data.appId, "app_render"); // group.apps[0]
    assert.strictEqual(resolved.data.matchedBy, "group-apps[0]-default");
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  if (process.exitCode) process.exit(process.exitCode);
  process.exit(0);
}

run();
