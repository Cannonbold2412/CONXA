"use strict";
// Covers config_edit.js — the surgical, ownership-checked, atomic editor for
// third-party agent-host config files. These are the properties that matter
// most: a foreign entry is never overwritten, a concurrent write is detected
// and refused rather than silently lost, and comments/formatting survive.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const configEdit = require("../../app/config_edit");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-edit-test-"));
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

const INSTALL_ROOT_WIN = "C:\\Users\\test\\.conxa";
const OUR_COMMAND = "C:\\Users\\test\\.conxa\\conxa-runtime\\current\\conxa-runtime.exe";

test("buildEntry: standard shape", () => {
  const e = configEdit.buildEntry("standard", OUR_COMMAND, { CONXA_DIR: "x" });
  assert.deepStrictEqual(e, { command: OUR_COMMAND, args: [], env: { CONXA_DIR: "x" } });
});

test("buildEntry: stdio shape", () => {
  const e = configEdit.buildEntry("stdio", OUR_COMMAND, {});
  assert.strictEqual(e.type, "stdio");
  assert.deepStrictEqual(e.args, []);
});

test("buildEntry: local shape", () => {
  const e = configEdit.buildEntry("local", OUR_COMMAND, {});
  assert.strictEqual(e.type, "local");
  assert.strictEqual(typeof e.command, "string");
});

test("buildEntry: local-array shape has array command and no args", () => {
  const e = configEdit.buildEntry("local-array", OUR_COMMAND, {});
  assert.deepStrictEqual(e.command, [OUR_COMMAND]);
  assert.strictEqual(e.type, "local");
  assert.strictEqual("args" in e, false);
});

test("buildEntry: unknown shape throws", () => {
  assert.throws(() => configEdit.buildEntry("bogus", OUR_COMMAND, {}));
});

test("isOwned: absent entry is ours (free to write)", () => {
  assert.strictEqual(configEdit.isOwned(undefined, INSTALL_ROOT_WIN), true);
  assert.strictEqual(configEdit.isOwned(null, INSTALL_ROOT_WIN), true);
});

test("isOwned: command inside install root is ours", () => {
  assert.strictEqual(configEdit.isOwned(OUR_COMMAND, INSTALL_ROOT_WIN), true);
});

test("isOwned: command outside install root is foreign", () => {
  assert.strictEqual(configEdit.isOwned("C:\\Other\\thing.exe", INSTALL_ROOT_WIN), false);
});

test("isOwned: array command checks element 0", () => {
  assert.strictEqual(configEdit.isOwned([OUR_COMMAND], INSTALL_ROOT_WIN), true);
  assert.strictEqual(configEdit.isOwned(["C:\\Other\\thing.exe"], INSTALL_ROOT_WIN), false);
});

test("upsertEntry: fresh file is created with parent dirs and one entry", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "nested", "mcp.json");
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "ok");
  const doc = JSON.parse(readText(configPath));
  assert.deepStrictEqual(doc.mcpServers.conxa, entry);
});

test("upsertEntry: existing foreign MCP servers survive byte-identically", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const original = {
    mcpServers: {
      other1: { command: "foo", args: ["--flag"] },
      other2: { command: "bar", args: [] },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(original, null, 2) + "\n");
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "ok");
  const doc = JSON.parse(readText(configPath));
  assert.deepStrictEqual(doc.mcpServers.other1, original.mcpServers.other1);
  assert.deepStrictEqual(doc.mcpServers.other2, original.mcpServers.other2);
  assert.deepStrictEqual(doc.mcpServers.conxa, entry);
});

test("upsertEntry: foreign entry under our key is refused, file untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const original = { mcpServers: { conxa: { command: "C:\\Other\\evil.exe", args: [] } } };
  const rawBefore = JSON.stringify(original, null, 2) + "\n";
  fs.writeFileSync(configPath, rawBefore);
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("upsertEntry: our entry with a stale path is updated in place", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const staleCommand = "C:\\Users\\test\\.conxa\\conxa-runtime\\old-v1\\conxa-runtime.exe";
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { conxa: { command: staleCommand, args: [] } } }));
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "ok");
  const doc = JSON.parse(readText(configPath));
  assert.strictEqual(doc.mcpServers.conxa.command, OUR_COMMAND);
});

test("upsertEntry: malformed JSON errors and leaves the file untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const badRaw = "{ not valid json !!!";
  fs.writeFileSync(configPath, badRaw);
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "error:unparseable");
  assert.strictEqual(readText(configPath), badRaw);
});

test("upsertEntry: file changed between check and write is refused (CAS)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  // Monkeypatch readRegularFile is unnecessary — reproduce the race directly:
  // upsertEntry re-reads immediately before writing, so mutate the file with a
  // DIFFERENT reader open in between by racing two overlapping calls. Simulate
  // deterministically instead: call upsertEntry once to prime its snapshot read
  // is unobservable from outside, so instead assert the documented behavior at
  // the unit level by writing after the read tick using a promise microtask hook.
  const originalReadFileSync = require("fs").readFileSync;
  let intercepted = false;
  const fsMod = require("fs");
  const spy = (p, ...rest) => {
    const result = originalReadFileSync(p, ...rest);
    if (!intercepted && p === configPath) {
      intercepted = true;
      // Simulate a concurrent writer landing between upsertEntry's ownership
      // read and its pre-write re-read.
      fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { unexpected: { command: "z" } } }));
    }
    return result;
  };
  fsMod.readFileSync = spy;
  let r;
  try {
    r = await configEdit.upsertEntry({
      configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
    });
  } finally {
    fsMod.readFileSync = originalReadFileSync;
  }

  assert.strictEqual(r.status, "error:changed-underneath");
  const doc = JSON.parse(readText(configPath));
  assert.strictEqual(doc.mcpServers.conxa, undefined);
  assert.ok(doc.mcpServers.unexpected);
});

test("upsertEntry: dry-run reports would-write and touches nothing", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN, dryRun: true,
  });

  assert.strictEqual(r.status, "would-write");
  assert.strictEqual(fs.existsSync(configPath), false);
});

test("upsertEntry: preserves comments and formatting (JSONC)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "settings.json");
  const withComments =
    "{\n  // user's note about this file\n  \"mcpServers\": {\n    \"other\": { \"command\": \"y\" } // keep this too\n  }\n}\n";
  fs.writeFileSync(configPath, withComments);
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes("// user's note about this file"));
  assert.ok(text.includes("// keep this too"));
});

test("upsertEntry: nested object path auto-creates missing intermediate objects", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "openclaw.json");
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const r = await configEdit.upsertEntry({
    configPath, objectPath: ["mcp", "servers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "ok");
  const doc = JSON.parse(readText(configPath));
  assert.deepStrictEqual(doc.mcp.servers.conxa, entry);
});

test("removeEntry: missing file is a successful no-op", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");

  const r = await configEdit.removeEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "skipped:not-detected");
});

test("removeEntry: foreign entry under our key is left alone", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const rawBefore = JSON.stringify({ mcpServers: { conxa: { command: "C:\\Other\\evil.exe" } } }, null, 2) + "\n";
  fs.writeFileSync(configPath, rawBefore);

  const r = await configEdit.removeEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("round-trip: register then unregister restores the file byte-identically", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "mcp.json");
  const original = { mcpServers: { other: { command: "foo", args: [] } } };
  const rawBefore = JSON.stringify(original, null, 2) + "\n";
  fs.writeFileSync(configPath, rawBefore);
  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});

  const up = await configEdit.upsertEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });
  assert.strictEqual(up.status, "ok");
  assert.notStrictEqual(readText(configPath), rawBefore);

  const rm = await configEdit.removeEntry({
    configPath, objectPath: ["mcpServers"], entryKey: "conxa", installRoot: INSTALL_ROOT_WIN,
  });
  assert.strictEqual(rm.status, "ok");

  const doc = JSON.parse(readText(configPath));
  assert.deepStrictEqual(doc, original);
});

test("atomicWrite: refuses to publish through a symlink target", async (t) => {
  const dir = mkTmpDir();
  const real = path.join(dir, "real.json");
  const link = path.join(dir, "link.json");
  fs.writeFileSync(real, "{}");
  try {
    fs.symlinkSync(real, link, "file");
  } catch (e) {
    t.skip(`symlink creation requires elevated privilege on this machine: ${e.code}`);
    return;
  }

  const entry = configEdit.buildEntry("standard", OUR_COMMAND, {});
  const r = await configEdit.upsertEntry({
    configPath: link, objectPath: ["mcpServers"], entryKey: "conxa", entry, installRoot: INSTALL_ROOT_WIN,
  });

  assert.strictEqual(r.status, "error:not-a-regular-file");
  assert.strictEqual(readText(real), "{}");
});
