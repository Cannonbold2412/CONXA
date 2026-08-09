"use strict";
// Covers the pack.skills repopulation fix in sync.js: the server's delta response
// is the authoritative full skill list for a company, and must be written back to
// pack.json on every successful delta fetch — whether or not any skill actually
// changed — so that a thin installer (which ships with pack.skills empty) and any
// skill added to a company post-install both become visible to skill_loader.js's
// registry, which reads pack.skills off disk rather than scanning the directory.
//
// Network mocking follows test_manifest_manager.js's precedent of avoiding a real
// TLS round trip: https.get is mocked directly (module-cached, so the same object
// reference sync.js already captured), rather than spinning up a live HTTPS server.

const test = require("node:test");
const assert = require("node:assert");
const { mock } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const { syncSkillPacks } = require("../sync");

// A successful sync now also calls durable_context.updateDurableContext()
// (best-effort, see sync.js), which resolves its target paths from the REAL
// os.homedir()/APPDATA/LOCALAPPDATA unless overridden. Without isolating
// those here, every test below would write into this machine's actual
// ~/.claude/skills, ~/.cursor/rules, etc. — sandbox HOME the same way
// test_mcp_register.js and test_mcp_hosts.js do, so a passing test run never
// touches a real AI-agent config.
const ENV_KEYS = ["USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA"];
let savedEnv;
test.beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-home-"));
  process.env.USERPROFILE = sandboxHome;
  process.env.HOME = sandboxHome;
  process.env.APPDATA = path.join(sandboxHome, "AppData", "Roaming");
  process.env.LOCALAPPDATA = path.join(sandboxHome, "AppData", "Local");
});
test.afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function mkSkillPacksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
}

function writePack(skillPacksDir, company, overrides = {}) {
  const companyDir = path.join(skillPacksDir, company);
  fs.mkdirSync(companyDir, { recursive: true });
  const pack = {
    company,
    sync_endpoint: "https://cloud.example/api/v1/plugins/v2/" + company + "/skill-packs/delta",
    sync_token: "test-token",
    skills: [],
    ...overrides,
  };
  fs.writeFileSync(path.join(companyDir, "pack.json"), JSON.stringify(pack, null, 2));
  return path.join(companyDir, "pack.json");
}

function mockDeltaResponse(payload) {
  return mock.method(https, "get", (_url, _options, callback) => {
    const dataHandlers = [];
    const endHandlers = [];
    const res = {
      statusCode: 200,
      on(event, cb) {
        if (event === "data") dataHandlers.push(cb);
        if (event === "end") endHandlers.push(cb);
        return res;
      },
    };
    process.nextTick(() => {
      dataHandlers.forEach((cb) => cb(Buffer.from(JSON.stringify(payload))));
      endHandlers.forEach((cb) => cb());
    });
    callback(res);
    return { setTimeout() {}, on() {}, destroy() {} };
  });
}

test("no_change delta still repopulates pack.skills and pack.last_synced", async (t) => {
  const skillPacksDir = mkSkillPacksDir();
  const packPath = writePack(skillPacksDir, "acme", { skills: [] }); // thin-installer start state

  const getMock = mockDeltaResponse({
    skills: [{ name: "skill-a", action: "no_change" }],
  });
  t.after(() => getMock.mock.restore());

  await syncSkillPacks(skillPacksDir, { timeoutMs: 4000, log: () => {} });

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  assert.deepStrictEqual(pack.skills, ["skill-a"], "server's skill list must be written back even with no changes");
  assert.ok(pack.last_synced, "last_synced must be set even when nothing changed");
  assert.ok(!fs.existsSync(path.join(skillPacksDir, "acme", "skill-a")), "no_change must not create any skill directory");

  fs.rmSync(skillPacksDir, { recursive: true, force: true });
});

test("update delta downloads, activates, and repopulates pack.skills", async (t) => {
  const skillPacksDir = mkSkillPacksDir();
  const packPath = writePack(skillPacksDir, "acme", { skills: [] });

  const content = Buffer.from('{"skills":[]}');
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");

  const getMock = mockDeltaResponse({
    skills: [
      {
        name: "skill-a",
        action: "update",
        version: "1.0.0",
        files: [{ path: "manifest.json", sha256, content_base64: content.toString("base64") }],
      },
    ],
  });
  t.after(() => getMock.mock.restore());

  await syncSkillPacks(skillPacksDir, { timeoutMs: 4000, log: () => {} });

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  assert.deepStrictEqual(pack.skills, ["skill-a"]);
  assert.ok(pack.last_synced);

  const skillRoot = path.join(skillPacksDir, "acme", "skill-a");
  const currentLink = path.join(skillRoot, "current");
  assert.ok(fs.existsSync(path.join(skillRoot, "v1.0.0", "manifest.json")), "skill file must be written under its version dir");
  assert.ok(fs.existsSync(path.join(currentLink, "manifest.json")), "current junction must resolve to the activated version");

  fs.rmSync(skillPacksDir, { recursive: true, force: true });
});

test("a brand-new skill added to a company post-install is picked up from nothing", async (t) => {
  // Simulates the exact thin-installer scenario: pack.skills starts empty (no
  // prior sync ever ran), and the company's cloud-side pack now has one skill.
  const skillPacksDir = mkSkillPacksDir();
  writePack(skillPacksDir, "acme", { skills: [] });

  const content = Buffer.from('{"skills":[]}');
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");

  const getMock = mockDeltaResponse({
    skills: [
      {
        name: "brand-new-skill",
        action: "update",
        version: "1.0.0",
        files: [{ path: "manifest.json", sha256, content_base64: content.toString("base64") }],
      },
    ],
  });
  t.after(() => getMock.mock.restore());

  await syncSkillPacks(skillPacksDir, { timeoutMs: 4000, log: () => {} });

  const pack = JSON.parse(fs.readFileSync(path.join(skillPacksDir, "acme", "pack.json"), "utf8"));
  assert.deepStrictEqual(pack.skills, ["brand-new-skill"], "a skill never seen locally before must appear in pack.skills after one sync");

  fs.rmSync(skillPacksDir, { recursive: true, force: true });
});

test("sync sends X-Conxa-Machine header so the cloud can gate Free-tier delta-sync", async (t) => {
  // See entitlements.ensure_delta_sync_allowed (cloud side) — it denies any
  // machine not registered for a Free-tier workspace. The header only does
  // anything if it's actually sent on every request.
  const skillPacksDir = mkSkillPacksDir();
  writePack(skillPacksDir, "acme", { skills: [] });

  let capturedOptions = null;
  const getMock = mock.method(https, "get", (_url, options, callback) => {
    capturedOptions = options;
    const res = {
      statusCode: 200,
      on(event, cb) {
        if (event === "data") process.nextTick(() => cb(Buffer.from(JSON.stringify({ skills: [] }))));
        if (event === "end") process.nextTick(cb);
        return res;
      },
    };
    callback(res);
    return { setTimeout() {}, on() {}, destroy() {} };
  });
  t.after(() => getMock.mock.restore());

  await syncSkillPacks(skillPacksDir, { timeoutMs: 4000, log: () => {} });

  const { getMachineIdHash } = require("../machine_hash");
  const expected = getMachineIdHash();
  assert.ok(capturedOptions, "delta request must have been made");
  if (expected) {
    assert.strictEqual(capturedOptions.headers["X-Conxa-Machine"], expected);
  } else {
    assert.ok(!("X-Conxa-Machine" in capturedOptions.headers), "no header when the hash is unavailable");
  }

  fs.rmSync(skillPacksDir, { recursive: true, force: true });
});
