// _filterRequiredApps gates on the apps a skill's manifest actually declared;
// getGroupAuthContext seeds the merged session from every VALID app in the group
// but gates (and interrupts) only on the required ones — one interruption naming
// every missing/expired required app, not one login window at a time. See
// CLAUDE.md's group-auth notes and browser.js's getGroupAuthContext docstring.
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
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-group-required-apps-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../../app/browser");
const { _filterRequiredApps, getGroupAuthContext } = browser;

const RENDER = { id: "app_render", name: "Render", login_url: "https://dashboard.render.com/login" };
const HUBSPOT = { id: "app_hubspot", name: "HubSpot", login_url: "https://app.hubspot.com/login" };

async function run() {
  console.log("_filterRequiredApps:");

  await check("undefined requiredAppIds gates on every app (legacy manifests)", () => {
    const apps = _filterRequiredApps([RENDER, HUBSPOT], undefined);
    assert.deepStrictEqual(apps, [RENDER, HUBSPOT]);
  });

  await check("empty requiredAppIds means this skill needs none of the group's apps", () => {
    const apps = _filterRequiredApps([RENDER, HUBSPOT], []);
    assert.deepStrictEqual(apps, []);
  });

  await check("requiredAppIds scopes the gate to only the apps this skill declared", () => {
    const apps = _filterRequiredApps([RENDER, HUBSPOT], ["app_hubspot"]);
    assert.deepStrictEqual(apps, [HUBSPOT]);
  });

  // getGroupAuthContext: both apps below have no saved session file at all, so
  // _validateGroupApp resolves "invalid" without launching a browser (see its
  // `if (!stored) return ...` early exit) — this exercises the missing-apps path
  // without needing Playwright/chromium to actually work in the test environment.
  console.log("\ngetGroupAuthContext (missing-app gating):");

  await check("missing required apps open one interruption naming all of them, not one at a time", async () => {
    const group = { id: "g1", name: "Sales", apps: [RENDER, HUBSPOT] };
    const result = await getGroupAuthContext("acme-required-apps-test", group, null, {
      headless: true,
      requiredAppIds: ["app_render", "app_hubspot"],
    });
    assert.strictEqual(result.authPending, true);
    assert.ok(result.message.includes("Render"));
    assert.ok(result.message.includes("HubSpot"));
    assert.strictEqual(result.apps.length, 2);
    assert.deepStrictEqual(new Set(result.apps.map((a) => a.id)), new Set(["app_render", "app_hubspot"]));
  });

  await check("a sibling app not in requiredAppIds does not block — only required apps gate", async () => {
    const group = { id: "g2", name: "Sales", apps: [RENDER, HUBSPOT] };
    // Only Render is required; HubSpot has no session either, but must not appear
    // in the interruption since it was never gated on.
    const result = await getGroupAuthContext("acme-required-apps-test-2", group, null, {
      headless: true,
      requiredAppIds: ["app_render"],
    });
    assert.strictEqual(result.authPending, true);
    assert.strictEqual(result.apps.length, 1);
    assert.strictEqual(result.apps[0].id, "app_render");
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
