"use strict";

// AUTH-6 — the "I'm done signing in" file-drop signal. Pure filesystem behavior: existence-only,
// consumed on the way past, rooted at CONXA_DIR (not CONXA_DATA_DIR — see browser.js's own
// comment on LOGIN_DONE_DIR for why: Conxa Execute's Electron process resolves and forwards
// CONXA_DIR but never learns CONXA_DATA_DIR, which only this runtime process computes).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-human-override-"));
process.env.CONXA_DIR = tmp;
process.env.CONXA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-human-override-data-"));

const { _checkHumanOverride, _humanOverrideFile, LOGIN_DONE_DIR } = require("../../app/browser");

test("_humanOverrideFile is rooted at CONXA_DIR, not CONXA_DATA_DIR — the CLI subcommand and Execute's button both write here", () => {
  assert.strictEqual(LOGIN_DONE_DIR, path.join(tmp, "login-done"));
  assert.strictEqual(_humanOverrideFile("ws__app_a"), path.join(tmp, "login-done", "ws__app_a.cmd"));
});

test("_checkHumanOverride is false with no file present", () => {
  assert.strictEqual(_checkHumanOverride("ws__nope"), false);
});

test("_checkHumanOverride fires once, then consumes the file (matches handover.js's own file-drop precedent)", () => {
  const file = _humanOverrideFile("ws__app_b");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "done"); // content is irrelevant — existence is the whole signal
  assert.strictEqual(_checkHumanOverride("ws__app_b"), true);
  assert.ok(!fs.existsSync(file), "consumed on the way past");
  assert.strictEqual(_checkHumanOverride("ws__app_b"), false, "a second check finds nothing left to fire");
});

test("_checkHumanOverride never throws even if the directory can't be created/read", () => {
  // A key with characters that can't form part of a path segment on this OS would normally be
  // impossible from the real key format (${workspace_id}__${appId}), but the function must still
  // degrade to false rather than throw for anything unexpected.
  assert.doesNotThrow(() => _checkHumanOverride(""));
});
