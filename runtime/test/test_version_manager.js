"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const vm = require("../version_manager");

function mkComponentDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-"));
}

function makeVersionDir(componentDir, name, { requiredFile = "server.js", releasedAt } = {}) {
  const dir = path.join(componentDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, requiredFile), "module.exports = {};");
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ released_at: releasedAt || new Date().toISOString() }));
  return dir;
}

test("resolveCurrent returns null before any version is activated", () => {
  const componentDir = mkComponentDir();
  assert.strictEqual(vm.resolveCurrent(componentDir), null);
  assert.strictEqual(vm.currentVersion(componentDir), null);
  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("activate flips current to the new version and it resolves through the junction", () => {
  const componentDir = mkComponentDir();
  const v1 = makeVersionDir(componentDir, "v1.0.0");

  const result = vm.activate(componentDir, v1, { requiredFiles: ["server.js"] });
  assert.strictEqual(result.version, "v1.0.0");
  assert.strictEqual(result.previousVersion, null);
  assert.strictEqual(vm.currentVersion(componentDir), "v1.0.0");
  assert.ok(fs.existsSync(path.join(componentDir, "current", "server.js")));

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("activate rejects a version directory missing a required file", () => {
  const componentDir = mkComponentDir();
  const bad = path.join(componentDir, "v1.0.0");
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, "version.json"), JSON.stringify({}));
  // no server.js written

  assert.throws(() => vm.activate(componentDir, bad, { requiredFiles: ["server.js"] }));
  assert.strictEqual(vm.currentVersion(componentDir), null, "a rejected activation must never flip current");

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("rollback flips current back to the previously retained version with no re-download", () => {
  const componentDir = mkComponentDir();
  const v1 = makeVersionDir(componentDir, "v1.0.0");
  const v2 = makeVersionDir(componentDir, "v1.1.0");

  vm.activate(componentDir, v1, { requiredFiles: ["server.js"] });
  vm.activate(componentDir, v2, { requiredFiles: ["server.js"] });
  assert.strictEqual(vm.currentVersion(componentDir), "v1.1.0");

  const rb = vm.rollback(componentDir);
  assert.strictEqual(rb.version, "v1.0.0");
  assert.strictEqual(vm.currentVersion(componentDir), "v1.0.0");
  assert.ok(fs.existsSync(v1), "rollback must not require the old version to still be downloaded — it was never deleted");

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("rollback with nothing to roll back to returns null and leaves current untouched", () => {
  const componentDir = mkComponentDir();
  const v1 = makeVersionDir(componentDir, "v1.0.0");
  vm.activate(componentDir, v1, { requiredFiles: ["server.js"] });

  const rb = vm.rollback(componentDir);
  assert.strictEqual(rb, null);
  assert.strictEqual(vm.currentVersion(componentDir), "v1.0.0");

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("retention: activating beyond `keep` prunes the oldest version, but never the one live immediately before this activation", () => {
  // Each version's directory is created just before its own activate() call, matching
  // real usage: a version is only downloaded onto disk right when it's about to be
  // activated, never speculatively pre-staged ahead of its own release.
  const componentDir = mkComponentDir();

  const v1 = makeVersionDir(componentDir, "v1.0.0", { releasedAt: "2026-01-01T00:00:00Z" });
  vm.activate(componentDir, v1, { requiredFiles: ["server.js"], keep: 3 });

  const v2 = makeVersionDir(componentDir, "v1.1.0", { releasedAt: "2026-02-01T00:00:00Z" });
  vm.activate(componentDir, v2, { requiredFiles: ["server.js"], keep: 3 });

  const v3 = makeVersionDir(componentDir, "v1.2.0", { releasedAt: "2026-03-01T00:00:00Z" });
  vm.activate(componentDir, v3, { requiredFiles: ["server.js"], keep: 3 });
  assert.deepStrictEqual(
    vm.listVersions(componentDir).map((v) => v.name),
    ["v1.2.0", "v1.1.0", "v1.0.0"],
    "all three should still be retained at keep=3"
  );

  const v4 = makeVersionDir(componentDir, "v1.3.0", { releasedAt: "2026-04-01T00:00:00Z" });
  vm.activate(componentDir, v4, { requiredFiles: ["server.js"], keep: 3 });
  const namesAfter = vm.listVersions(componentDir).map((v) => v.name);
  assert.deepStrictEqual(namesAfter, ["v1.3.0", "v1.2.0", "v1.1.0"]);
  assert.strictEqual(fs.existsSync(v1), false, "the oldest version beyond retention must be pruned");
  assert.strictEqual(fs.existsSync(v2), true, "the version live immediately before this activation must survive so a fresh rollback needs no re-download");

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("listVersions sorts newest first by released_at", () => {
  const componentDir = mkComponentDir();
  makeVersionDir(componentDir, "v1.0.0", { releasedAt: "2026-01-01T00:00:00Z" });
  makeVersionDir(componentDir, "v1.2.0", { releasedAt: "2026-03-01T00:00:00Z" });
  makeVersionDir(componentDir, "v1.1.0", { releasedAt: "2026-02-01T00:00:00Z" });

  assert.deepStrictEqual(
    vm.listVersions(componentDir).map((v) => v.name),
    ["v1.2.0", "v1.1.0", "v1.0.0"]
  );

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("_removeCurrentLink only unlinks the junction, never the target directory's contents", () => {
  const componentDir = mkComponentDir();
  const v1 = makeVersionDir(componentDir, "v1.0.0");
  vm.activate(componentDir, v1, { requiredFiles: ["server.js"] });

  vm._removeCurrentLink(vm.currentLinkPath(componentDir));

  assert.strictEqual(fs.existsSync(vm.currentLinkPath(componentDir)), false, "the link itself must be gone");
  assert.strictEqual(fs.existsSync(v1), true, "the version directory it pointed at must be untouched");
  assert.ok(fs.existsSync(path.join(v1, "server.js")), "files inside the version directory must be untouched");

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("resolveCurrent recovers gracefully when the version a stale junction points at is gone", () => {
  const componentDir = mkComponentDir();
  const v1 = makeVersionDir(componentDir, "v1.0.0");
  vm.activate(componentDir, v1, { requiredFiles: ["server.js"] });

  // Simulate external corruption: the version directory current points at is deleted
  // without going through version_manager (e.g. manual disk cleanup, crash mid-prune).
  fs.rmSync(v1, { recursive: true, force: true });

  assert.strictEqual(vm.resolveCurrent(componentDir), null, "a junction pointing at a missing directory must resolve to null, not throw");
  assert.strictEqual(vm.currentVersion(componentDir), null);

  fs.rmSync(componentDir, { recursive: true, force: true });
});

test("isValidVersionDir requires version.json to parse as JSON", () => {
  const componentDir = mkComponentDir();
  const dir = path.join(componentDir, "v1.0.0");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "server.js"), "x");
  fs.writeFileSync(path.join(dir, "version.json"), "not valid json{{{");

  assert.strictEqual(vm.isValidVersionDir(dir, ["server.js"]), false);

  fs.rmSync(componentDir, { recursive: true, force: true });
});
