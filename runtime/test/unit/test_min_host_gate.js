"use strict";
// Unit tests for min_host_gate.js — the pure extraction of bootstrap.js's
// tryLoad(). All I/O is injected; nothing here touches the real filesystem or
// requires a real app layer. These protect the min_host load-time invariant
// (see AGENTS.md Key Invariants) that previously had zero test coverage.
const test  = require("node:test");
const assert = require("node:assert");
const fs    = require("fs");
const os    = require("os");
const path  = require("path");

const { evaluateAppLayer } = require("../../host/min_host_gate");

function makeTempAppLayer({ versionJson, includeServer = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minhost-gate-"));
  if (versionJson !== undefined) {
    fs.writeFileSync(
      path.join(dir, "version.json"),
      typeof versionJson === "string" ? versionJson : JSON.stringify(versionJson)
    );
  }
  if (includeServer) fs.writeFileSync(path.join(dir, "server.js"), "// stub\n");
  return dir;
}

function makeDeps(overrides = {}) {
  const warnings = [];
  return {
    deps: {
      existsSync: (p) => fs.existsSync(p),
      readFileSync: (p) => fs.readFileSync(p, "utf8"),
      loadEntry: () => {},
      warn: (msg) => warnings.push(msg),
      ...overrides,
    },
    warnings,
  };
}

test("accepts an app layer with no min_host requirement", () => {
  const dir = makeTempAppLayer({ versionJson: { app_version: "app-v1.0.0" } });
  const { deps } = makeDeps();
  let loadedEntry = null;
  const r = evaluateAppLayer(dir, "host-v2.0.0", {
    ...deps,
    loadEntry: (entry) => { loadedEntry = entry; },
  });
  assert.strictEqual(r.loaded, true);
  assert.ok(loadedEntry.endsWith(path.join("server.js")));
});

test("accepts when host exactly meets min_host", () => {
  const dir = makeTempAppLayer({ versionJson: { min_host: "host-v2.0.0" } });
  const { deps } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, true);
});

test("rejects an app layer requiring a newer host", () => {
  const dir = makeTempAppLayer({ versionJson: { min_host: "host-v3.1.0" } });
  const { deps, warnings } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, false);
  assert.strictEqual(r.reason, "host-too-old");
  assert.strictEqual(r.requiredMinHost, "host-v3.1.0");
  // stderr message must stay byte-identical — ops tooling greps it
  assert.match(warnings[0], /app layer requires host >=host-v3\.1\.0, have host-v2\.0\.0 — skipping/);
});

test("rejects on malformed version.json without crashing", () => {
  const dir = makeTempAppLayer({ versionJson: "{not json", includeServer: false });
  const { deps } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, false);
  assert.strictEqual(r.reason, "malformed-version-json");
});

test("rejects silently when version.json is missing entirely", () => {
  const dir = makeTempAppLayer({ versionJson: undefined });
  const { deps } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, false);
  assert.strictEqual(r.reason, "no-version-json");
  assert.strictEqual(r.message, "");
});

test("rejects a null/empty dir (nothing installed yet)", () => {
  const { deps } = makeDeps();
  assert.deepStrictEqual(evaluateAppLayer(null, "host-v2.0.0", deps).reason, "no-dir");
  assert.deepStrictEqual(evaluateAppLayer(undefined, "host-v2.0.0", deps).reason, "no-dir");
});

test("rejects when server.js entry is missing", () => {
  const dir = makeTempAppLayer({ versionJson: { app_version: "app-v1.0.0" }, includeServer: false });
  const { deps } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, false);
  assert.strictEqual(r.reason, "no-entry");
});

test("reports load-failed (with stderr message) when require throws", () => {
  const dir = makeTempAppLayer({ versionJson: { app_version: "app-v1.0.0" } });
  const { deps, warnings } = makeDeps({
    loadEntry: () => { throw new Error("boom"); },
  });
  const r = evaluateAppLayer(dir, "host-v2.0.0", deps);
  assert.strictEqual(r.loaded, false);
  assert.strictEqual(r.reason, "load-failed");
  assert.match(warnings[0], /\[bootstrap\] failed to load .*server\.js: boom/);
});

test("quiet mode suppresses the host-too-old warning but keeps the message in the result", () => {
  const dir = makeTempAppLayer({ versionJson: { min_host: "host-v9.0.0" } });
  const { deps, warnings } = makeDeps();
  const r = evaluateAppLayer(dir, "host-v2.0.0", { ...deps, quiet: true });
  assert.strictEqual(r.loaded, false);
  assert.ok(r.message.length > 0);
  assert.strictEqual(warnings.length, 0);
});
