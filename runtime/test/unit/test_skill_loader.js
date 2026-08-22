"use strict";
// Unit tests for skill_loader.js — previously covered only by the happy path in
// the CI gate replay. These pin the offline behaviors: registry scanning with
// malformed/missing inputs, group fallback, integrity verification, hot reload,
// and the cache fallback.
const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");
const crypto = require("crypto");

const {
  loadSkillRegistry,
  loadSkillRegistryFromCache,
  verifySkillIntegrity,
  hotReloadSkill,
} = require("../../app/skill_loader");

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "skill-loader-")); }

function stageSkill(skillPacksDir, { ws = "co1", slug = "demo", group = null, manifest = {} } = {}) {
  const g = group || "_default";
  const dir = path.join(skillPacksDir, ws, g, slug, "v1.0.0");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  // `current` as a real directory junction (version_manager normally makes it;
  // fs.statSync/isDirectory treats both identically for our purposes).
  try {
    fs.symlinkSync(dir, path.join(skillPacksDir, ws, g, slug, "current"), "junction");
  } catch (_) {
    // Fallback for environments without symlink privilege: plain directory copy marker.
    fs.mkdirSync(path.join(skillPacksDir, ws, g, slug, "current"), { recursive: true });
    fs.copyFileSync(path.join(dir, "manifest.json"), path.join(skillPacksDir, ws, g, slug, "current", "manifest.json"));
  }
  return dir;
}

function writePack(skillPacksDir, ws, skills, groups) {
  fs.mkdirSync(path.join(skillPacksDir, ws), { recursive: true });
  fs.writeFileSync(
    path.join(skillPacksDir, ws, "pack.json"),
    JSON.stringify({ skills, skill_groups: groups || {} })
  );
}

test("loadSkillRegistry: indexes skills with workspace/slug/group and caches to disk", () => {
  const root = tmp();
  stageSkill(root, { slug: "demo", manifest: { name: "Demo" } });
  stageSkill(root, { slug: "grouped", group: "g1", manifest: { name: "Grouped" } });
  writePack(root, "co1", ["demo", "grouped"], { grouped: "g1" });
  const cacheDir = path.join(root, "_cache");

  const idx = loadSkillRegistry(root, cacheDir);
  assert.ok(idx["co1:demo"]);
  assert.strictEqual(idx["co1:demo"].manifest.name, "Demo");
  assert.ok(idx["co1:grouped"].skillDir.includes(path.join("g1", "grouped")), "declared group honored");
  assert.ok(idx["co1:demo"].skillDir.endsWith(path.join("current")), "skillDir points at current junction");
  assert.ok(fs.existsSync(path.join(cacheDir, "manifests.json")));
});

test("loadSkillRegistry: undeclared group falls back to _default", () => {
  const root = tmp();
  stageSkill(root, { slug: "solo" }); // staged under _default
  writePack(root, "co1", ["solo"], {});
  const idx = loadSkillRegistry(root, null);
  assert.ok(idx["co1:solo"], "skill found via _default when pack.skill_groups omits it");
});

test("loadSkillRegistry: skips workspaces with missing or malformed pack.json", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "bad-ws"), { recursive: true });
  fs.writeFileSync(path.join(root, "bad-ws", "pack.json"), "{not json");
  fs.mkdirSync(path.join(root, "no-pack"), { recursive: true });
  assert.deepStrictEqual(loadSkillRegistry(root, null), {});
});

test("loadSkillRegistry: skips skills with missing or malformed manifest.json", () => {
  const root = tmp();
  writePack(root, "co1", ["gone", "broken"]);
  // 'gone': no directory at all → missing manifest
  const brokenDir = path.join(root, "co1", "_default", "broken", "v1.0.0");
  fs.mkdirSync(brokenDir, { recursive: true });
  fs.writeFileSync(path.join(brokenDir, "manifest.json"), "{oops");
  assert.deepStrictEqual(loadSkillRegistry(root, null), {});
});

test("verifySkillIntegrity: passes on exact hashes, throws on missing file / mismatch", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "execution.json"), '{"steps":[]}');
  const good = crypto.createHash("sha256").update('{"steps":[]}').digest("hex");
  verifySkillIntegrity(dir, { checksum: { "execution.json": good } }, "demo"); // no throw

  assert.throws(
    () => verifySkillIntegrity(dir, { checksum: { "nope.json": good } }, "demo"),
    /missing nope\.json in demo/
  );
  assert.throws(
    () => verifySkillIntegrity(dir, { checksum: { "execution.json": "deadbeef" } }, "demo"),
    /checksum mismatch/
  );
});

test("hotReloadSkill: adds new, updates changed, removes vanished manifests", () => {
  const root = tmp();
  stageSkill(root, { slug: "demo", manifest: { name: "v1" } });
  writePack(root, "co1", ["demo"]);
  const index = {};

  hotReloadSkill("co1", "demo", root, index);
  assert.strictEqual(index["co1:demo"]?.manifest?.name, "v1", "absent key gets added");

  const mPath = path.join(root, "co1", "_default", "demo", "current", "manifest.json");
  fs.writeFileSync(mPath, JSON.stringify({ name: "v2" }));
  hotReloadSkill("co1", "demo", root, index);
  assert.strictEqual(index["co1:demo"].manifest.name, "v2", "changed manifest gets re-read");

  fs.unlinkSync(mPath);
  hotReloadSkill("co1", "demo", root, index);
  assert.ok(!("co1:demo" in index), "vanished manifest is dropped from the live index");
});

test("loadSkillRegistryFromCache: serves cache instantly, rebuilds when absent/corrupt", () => {
  const root = tmp();
  stageSkill(root, { slug: "demo", manifest: { name: "Real" } });
  writePack(root, "co1", ["demo"]);
  const cacheDir = path.join(root, "_cache");

  loadSkillRegistry(root, cacheDir); // populate
  const cached = loadSkillRegistryFromCache(root, cacheDir);
  assert.strictEqual(cached["co1:demo"]?.manifest?.name, "Real");

  fs.writeFileSync(path.join(cacheDir, "manifests.json"), "{corrupt");
  const rebuilt = loadSkillRegistryFromCache(root, cacheDir);
  assert.strictEqual(rebuilt["co1:demo"]?.manifest?.name, "Real", "corrupt cache triggers full rescan");
});
