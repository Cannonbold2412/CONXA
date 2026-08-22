"use strict";
// Covers cli_sync.js's `conxa-runtime.exe sync` install-time hook: it must call
// the app layer's syncSkillPacks with the skill-packs dir under CONXA_DIR, and
// must never throw (an install-time failure falls back to first-launch sync).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const cliSync = require("../../host/cli_sync");

function mkAppDir(syncBody) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-sync-app-"));
  fs.writeFileSync(path.join(appDir, "sync.js"), syncBody);
  return appDir;
}

test("cli_sync.run calls syncSkillPacks with CONXA_DIR/skill-packs", async () => {
  const conxaDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-sync-conxa-"));
  const callsFile = path.join(conxaDir, "calls.json");
  const appDir = mkAppDir(`
    const fs = require("fs");
    module.exports.syncSkillPacks = async (dir, opts) => {
      fs.writeFileSync(${JSON.stringify(callsFile)}, JSON.stringify({ dir, timeoutMs: opts.timeoutMs }));
    };
  `);
  const versionManager = { resolveCurrent: () => appDir };

  await cliSync.run(conxaDir, "/unused/app-root", versionManager);

  const call = JSON.parse(fs.readFileSync(callsFile, "utf8"));
  assert.strictEqual(call.dir, path.join(conxaDir, "skill-packs"));
  assert.ok(call.timeoutMs >= 60000, "install-time sync should get a generous timeout, not server.js's 4s default");
});

test("cli_sync.run never throws when no app layer is staged", async () => {
  const versionManager = { resolveCurrent: () => null };
  await assert.doesNotReject(() => cliSync.run("/unused/conxa-dir", "/unused/app-root", versionManager));
});

test("cli_sync.run never throws when syncSkillPacks rejects", async () => {
  const appDir = mkAppDir(`
    module.exports.syncSkillPacks = async () => { throw new Error("network down"); };
  `);
  const versionManager = { resolveCurrent: () => appDir };
  await assert.doesNotReject(() => cliSync.run("/unused/conxa-dir", "/unused/app-root", versionManager));
});

test("cli_sync.run skips sync when the app layer requires a newer host", async () => {
  // The install-time sync path must enforce the same min_host floor as the
  // normal load path — an incompatible app layer must not execute against an
  // old host during installation (audit finding #2).
  const conxaDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-sync-conxa-"));
  const callsFile = path.join(conxaDir, "calls.json");
  const appDir = mkAppDir(`
    const fs = require("fs");
    module.exports.syncSkillPacks = async () => {
      fs.writeFileSync(${JSON.stringify(callsFile)}, "RAN");
    };
  `);
  fs.writeFileSync(
    path.join(appDir, "version.json"),
    JSON.stringify({ app_version: "app-v9.0.0", min_host: "host-v99.0.0" })
  );
  const versionManager = { resolveCurrent: () => appDir };

  let stderr = "";
  const _write = process.stderr.write;
  process.stderr.write = (s) => { stderr += s; return true; };
  try {
    await cliSync.run(conxaDir, "/unused/app-root", versionManager, "host-v2.0.0");
  } finally {
    process.stderr.write = _write;
  }

  assert.ok(!fs.existsSync(callsFile), "syncSkillPacks must not run against a too-old host");
  assert.match(stderr, /requires host >=host-v99\.0\.0/);
  assert.match(stderr, /skipping install-time sync/);
});
