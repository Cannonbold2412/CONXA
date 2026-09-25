// A repeat call while a group's sign-in window is already open must only point at that window —
// no new session, no probe tabs, nothing that could reload the login page under the person.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-already-open-"));
process.env.CONXA_DATA_DIR = dir;
process.env.CONXA_DIR = dir;
const browser = require("../../app/browser");

const G = { id: "app_g", name: "Google", login_url: "https://accounts.google.com/signin" };
const H = { id: "app_h", name: "GitHub", login_url: "https://github.com/login" };

(async () => {
  browser._pendingAuth.set("ws__app_g", { status: "pending" });
  browser._pendingAuth.set("ws__app_h", { status: "pending" });
  const r = await browser.getGroupAuthContext("ws", { id: "g", name: "G", apps: [G, H] }, null, { headless: false });
  assert.strictEqual(r.authPending, true);
  assert.deepStrictEqual(r.apps.map((a) => a.reason), ["already_open", "already_open"]);
  assert.deepStrictEqual(r.apps.map((a) => a.key), ["ws__app_g", "ws__app_h"]);
  console.log("1 passed");
})().catch((e) => { console.log("✗", e.message); process.exitCode = 1; });
