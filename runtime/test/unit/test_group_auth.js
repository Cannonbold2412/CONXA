// Pure-node tests for Workflow Groups' runtime auth path: mergeStorageStates
// parity with the Python twin, and _resolveGroup's legacy-pack fallback.
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// Isolate CONXA_DATA_DIR before requiring browser.js (it reads env at module load).
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-group-auth-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;

const browser = require("../../app/browser");

console.log("mergeStorageStates:");
check("dedupes cookies by name+domain+path", () => {
  const merged = browser.mergeStorageStates([
    { cookies: [{ name: "a", domain: "x", path: "/" }] },
    { cookies: [{ name: "a", domain: "x", path: "/" }, { name: "b", domain: "y", path: "/" }] },
  ]);
  assert.strictEqual(merged.cookies.length, 2);
});
check("later origin's localStorage keys win on conflict", () => {
  const merged = browser.mergeStorageStates([
    { origins: [{ origin: "https://a.com", localStorage: [{ name: "k", value: "1" }] }] },
    { origins: [{ origin: "https://a.com", localStorage: [{ name: "k", value: "2" }, { name: "k2", value: "z" }] }] },
  ]);
  assert.strictEqual(merged.origins.length, 1);
  const ls = Object.fromEntries(merged.origins[0].localStorage.map((i) => [i.name, i.value]));
  assert.strictEqual(ls.k, "2");
  assert.strictEqual(ls.k2, "z");
});
check("handles null/empty states", () => {
  const merged = browser.mergeStorageStates([null, undefined, {}]);
  assert.deepStrictEqual(merged, { cookies: [], origins: [] });
});

console.log("\n_resolveGroup (pack.json groups resolution):");
check("pack with no groups key returns null (legacy path)", () => {
  const dir = path.join(tmpDataDir, "skill-packs", "legacyco");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({ workspace_id: "legacyco", target_url: "https://x" }));
  assert.strictEqual(browser._resolveGroup("legacyco"), null);
});
check("pack with groups resolves by id, falls back to first", () => {
  const dir = path.join(tmpDataDir, "skill-packs", "groupco");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pack.json"),
    JSON.stringify({ workspace_id: "groupco", groups: [{ id: "g1", name: "Sales", apps: [] }, { id: "g2", name: "Mktg", apps: [] }] })
  );
  assert.strictEqual(browser._resolveGroup("groupco", "g2").name, "Mktg");
  assert.strictEqual(browser._resolveGroup("groupco").name, "Sales");
  assert.strictEqual(browser._resolveGroup("groupco", "missing"), null);
});

fs.rmSync(tmpDataDir, { recursive: true, force: true });
console.log(`\n${pass} passed`);
