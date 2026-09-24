// A group is the unit of sign-in: a workflow in a group runs only when EVERY app in that group is
// authenticated — there is no per-skill subset (the old manifest `required_apps` is gone, and a
// caller still passing `requiredAppIds` must not be able to narrow the gate). One interruption
// names every missing/expired app, not one login window at a time. See browser.js's
// getGroupAuthContext docstring.
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

// Isolate CONXA_DATA_DIR/CONXA_DIR before requiring browser.js (it reads env at module load).
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-group-gates-every-app-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../../app/browser");
const { getGroupAuthContext } = browser;

const RENDER = { id: "app_render", name: "Render", login_url: "https://dashboard.render.com/login" };
const HUBSPOT = { id: "app_hubspot", name: "HubSpot", login_url: "https://app.hubspot.com/login" };

async function run() {
  // Neither app has a saved session file, so each resolves "invalid" without launching a browser to
  // check it — this exercises the missing-apps gate without needing Playwright/chromium to work in
  // the test environment.
  console.log("getGroupAuthContext (every app gates):");

  await check("every missing app opens one interruption naming all of them, not one at a time", async () => {
    const group = { id: "g1", name: "Sales", apps: [RENDER, HUBSPOT] };
    const result = await getGroupAuthContext("acme-gates-every-app-1", group, null, { headless: true });
    assert.strictEqual(result.authPending, true);
    assert.ok(result.message.includes("Render"));
    assert.ok(result.message.includes("HubSpot"));
    assert.ok(result.message.includes("2 applications"), "the count is the whole group's, not a subset");
    assert.strictEqual(result.apps.length, 2);
    assert.deepStrictEqual(new Set(result.apps.map((a) => a.id)), new Set(["app_render", "app_hubspot"]));
  });

  await check("a legacy requiredAppIds option cannot narrow the gate — an app it omits still gates", async () => {
    const group = { id: "g2", name: "Sales", apps: [RENDER, HUBSPOT] };
    const result = await getGroupAuthContext("acme-gates-every-app-2", group, null, {
      headless: true,
      requiredAppIds: ["app_render"],
    });
    assert.strictEqual(result.authPending, true);
    assert.strictEqual(result.apps.length, 2);
  });

  await check("an explicitly empty requiredAppIds no longer skips the gate", async () => {
    const group = { id: "g3", name: "Sales", apps: [RENDER, HUBSPOT] };
    const result = await getGroupAuthContext("acme-gates-every-app-3", group, null, {
      headless: true,
      requiredAppIds: [],
    });
    assert.strictEqual(result.authPending, true, "used to return a usable 'group-no-required-apps' context");
    assert.strictEqual(result.apps.length, 2);
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  // getGroupAuthContext's missing-app path kicks off a real (background, un-awaited)
  // Chromium login-window launch per app — see beginInteractiveAuth. That's correct
  // runtime behavior but has no reason to finish in a test environment; force exit
  // instead of waiting on those background attempts to settle.
  process.exit(process.exitCode || 0);
}

run();
