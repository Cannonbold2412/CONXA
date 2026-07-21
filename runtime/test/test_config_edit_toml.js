"use strict";
// Covers config_edit_toml.js — the marker-block editor for Codex's regular
// table ([mcp_servers.conxa]) and Vibe's array-of-tables ([[mcp_servers]]).
// The two need genuinely different foreign-entry logic: a regular table can
// exist only once (TOML rejects a duplicate definition), an array-of-tables
// legitimately repeats once per server — so header-text matching alone would
// be a false-positive machine for Vibe. That distinction is what these tests
// are really pinning down.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const configEditToml = require("../config_edit_toml");
const { TOML_HOSTS } = require("../mcp_hosts_toml");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-edit-toml-test-"));
}
function readText(p) {
  return fs.readFileSync(p, "utf8");
}

const codexHost = TOML_HOSTS.find((h) => h.id === "codex");
const vibeHost = TOML_HOSTS.find((h) => h.id === "vibe");
const IDENTITY = { key: "conxa", commandPath: "C:\\Users\\test\\.conxa\\conxa-runtime\\current\\conxa-runtime.exe" };

test("tomlEscapeString escapes backslashes and quotes", () => {
  assert.strictEqual(
    configEditToml.tomlEscapeString('C:\\Users\\a "b"\\c.exe'),
    'C:\\\\Users\\\\a \\"b\\"\\\\c.exe',
  );
});

test("upsertBlock: fresh file gets one marker-delimited block", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const { blockBody } = codexHost.build(IDENTITY);

  const r = await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes(configEditToml.markerStart(codexHost.label(IDENTITY))));
  assert.ok(text.includes("[mcp_servers.conxa]"));
});

test("upsertBlock: surrounding customer TOML survives untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  fs.writeFileSync(configPath, '[model]\nprovider = "openai"\n\n[other_table]\nkey = "value"\n');
  const { blockBody } = codexHost.build(IDENTITY);

  await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody });

  const text = readText(configPath);
  assert.ok(text.includes('provider = "openai"'));
  assert.ok(text.includes("[other_table]"));
});

test("upsertBlock: re-running replaces only our span, no duplicate markers", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const { blockBody: v1 } = codexHost.build(IDENTITY);
  await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody: v1 });

  const identityV2 = { ...IDENTITY, commandPath: "C:\\Users\\test\\.conxa\\conxa-runtime\\current\\v2\\conxa-runtime.exe" };
  const { blockBody: v2 } = codexHost.build(identityV2);
  await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody: v2 });

  const text = readText(configPath);
  assert.strictEqual((text.match(/>>> conxa:conxa >>>/g) || []).length, 1);
  assert.ok(text.includes("v2\\\\conxa-runtime.exe") || text.includes("v2\\conxa-runtime.exe"));
});

test("upsertBlock: dry-run touches nothing", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const { blockBody } = codexHost.build(IDENTITY);

  const r = await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody, dryRun: true });

  assert.strictEqual(r.status, "would-write");
  assert.strictEqual(fs.existsSync(configPath), false);
});

test("upsertBlock: file changed between check and write is refused (CAS)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  fs.writeFileSync(configPath, "");
  const { blockBody } = codexHost.build(IDENTITY);

  const fsMod = require("fs");
  const originalReadFileSync = fsMod.readFileSync;
  let intercepted = false;
  fsMod.readFileSync = (p, ...rest) => {
    const result = originalReadFileSync(p, ...rest);
    if (!intercepted && p === configPath) {
      intercepted = true;
      fs.writeFileSync(configPath, "[unexpected]\nkey = 1\n");
    }
    return result;
  };
  let r;
  try {
    r = await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody });
  } finally {
    fsMod.readFileSync = originalReadFileSync;
  }

  assert.strictEqual(r.status, "error:changed-underneath");
  assert.strictEqual(readText(configPath), "[unexpected]\nkey = 1\n");
});

test("removeBlock: round-trip restores the file byte-identically", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const original = '[model]\nprovider = "openai"\n';
  fs.writeFileSync(configPath, original);
  const { blockBody } = codexHost.build(IDENTITY);

  await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody });
  assert.notStrictEqual(readText(configPath), original);

  const r = await configEditToml.removeBlock({ configPath, label: codexHost.label(IDENTITY) });
  assert.strictEqual(r.status, "ok");
  assert.strictEqual(readText(configPath), original);
});

test("removeBlock: missing block is a successful no-op", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  fs.writeFileSync(configPath, '[model]\nprovider = "openai"\n');

  const r = await configEditToml.removeBlock({ configPath, label: codexHost.label(IDENTITY) });

  assert.strictEqual(r.status, "skipped:not-detected");
});

test("Codex isForeign: a duplicate [mcp_servers.conxa] table outside our span is refused", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const rawBefore = '[mcp_servers.conxa]\ncommand = "C:\\\\Other\\\\thing.exe"\nargs = []\n';
  fs.writeFileSync(configPath, rawBefore);
  const { blockBody, isForeign } = codexHost.build(IDENTITY);

  const r = await configEditToml.upsertBlock({ configPath, label: codexHost.label(IDENTITY), blockBody, isForeign });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("Vibe isForeign: a DIFFERENT server's [[mcp_servers]] entry does NOT block us (no false positive)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  fs.writeFileSync(configPath, '[[mcp_servers]]\nname = "some-other-tool"\ntransport = "stdio"\ncommand = "other.exe"\n');
  const { blockBody, isForeign } = vibeHost.build(IDENTITY);

  const r = await configEditToml.upsertBlock({ configPath, label: vibeHost.label(IDENTITY), blockBody, isForeign });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes('name = "some-other-tool"'), "the other server's entry must survive");
  assert.ok(text.includes('name = "conxa"'));
});

test("Vibe isForeign: an entry that already claims OUR name is refused", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const rawBefore = '[[mcp_servers]]\nname = "conxa"\ntransport = "stdio"\ncommand = "C:\\\\Other\\\\evil.exe"\n';
  fs.writeFileSync(configPath, rawBefore);
  const { blockBody, isForeign } = vibeHost.build(IDENTITY);

  const r = await configEditToml.upsertBlock({ configPath, label: vibeHost.label(IDENTITY), blockBody, isForeign });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("Vibe isForeign: re-running against our OWN prior entry is not foreign to itself", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.toml");
  const { blockBody: v1, isForeign: isForeign1 } = vibeHost.build(IDENTITY);
  await configEditToml.upsertBlock({ configPath, label: vibeHost.label(IDENTITY), blockBody: v1, isForeign: isForeign1 });

  const { blockBody: v2, isForeign: isForeign2 } = vibeHost.build(IDENTITY);
  const r = await configEditToml.upsertBlock({ configPath, label: vibeHost.label(IDENTITY), blockBody: v2, isForeign: isForeign2 });

  assert.strictEqual(r.status, "ok");
});
