"use strict";
// Covers config_edit_yaml.js — the Document-API editor for Goose and Hermes.
// Unlike the TOML marker-block approach, YAML mappings hold sibling keys
// natively, so this is closer to config_edit.js's JSON path editor: no
// marker span needed, dev/prod coexist as two ordinary keys.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const configEditYaml = require("../../host/config_edit_yaml");
const { YAML_HOSTS } = require("../../host/mcp_hosts_yaml");

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-edit-yaml-test-"));
}
function readText(p) {
  return fs.readFileSync(p, "utf8");
}

const gooseHost = YAML_HOSTS.find((h) => h.id === "goose");
const hermesHost = YAML_HOSTS.find((h) => h.id === "hermes");
const INSTALL_ROOT = "C:\\Users\\test\\.conxa";
const IDENTITY = { key: "conxa", commandPath: "C:\\Users\\test\\.conxa\\conxa-runtime\\current\\conxa-runtime.exe" };

test("upsertEntry: fresh file gets one entry under its section", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes("mcp_servers:"));
  assert.ok(text.includes("conxa:"));
});

test("upsertEntry: comments and other keys survive untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  fs.writeFileSync(configPath, "# my hermes config\nmcp_servers:\n  other:\n    command: other.exe\n");
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  const text = readText(configPath);
  assert.ok(text.includes("# my hermes config"));
  assert.ok(text.includes("other:"));
  assert.ok(text.includes("other.exe"));
});

test("upsertEntry: foreign entry under our key is refused, file untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const rawBefore = "mcp_servers:\n  conxa:\n    command: C:\\Other\\evil.exe\n";
  fs.writeFileSync(configPath, rawBefore);
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("upsertEntry: our entry with a stale command is updated in place", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  fs.writeFileSync(configPath, "mcp_servers:\n  conxa:\n    command: C:\\Users\\test\\.conxa\\conxa-runtime\\old\\conxa-runtime.exe\n");
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes("current\\conxa-runtime.exe"));
});

test("upsertEntry: malformed YAML errors, file untouched", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const badRaw = "mcp_servers:\n  : bad: yaml: [[[\n";
  fs.writeFileSync(configPath, badRaw);
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "error:unparseable");
  assert.strictEqual(readText(configPath), badRaw);
});

test("upsertEntry: dry-run touches nothing", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT, dryRun: true });

  assert.strictEqual(r.status, "would-write");
  assert.strictEqual(fs.existsSync(configPath), false);
});

test("upsertEntry: file changed between check and write is refused (CAS)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  fs.writeFileSync(configPath, "mcp_servers: {}\n");
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  const fsMod = require("fs");
  const originalReadFileSync = fsMod.readFileSync;
  let intercepted = false;
  fsMod.readFileSync = (p, ...rest) => {
    const result = originalReadFileSync(p, ...rest);
    if (!intercepted && p === configPath) {
      intercepted = true;
      fs.writeFileSync(configPath, "mcp_servers:\n  unexpected:\n    command: z\n");
    }
    return result;
  };
  let r;
  try {
    r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });
  } finally {
    fsMod.readFileSync = originalReadFileSync;
  }

  assert.strictEqual(r.status, "error:changed-underneath");
  assert.ok(readText(configPath).includes("unexpected"));
});

test("dev and prod keys coexist under the same section (no marker needed)", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const yamlPathDev = hermesHost.yamlPath({ key: "conxa-dev" });
  await configEditYaml.upsertEntry({
    configPath, yamlPath: yamlPathDev, entry: hermesHost.build({ key: "conxa-dev", commandPath: IDENTITY.commandPath }),
    installRoot: INSTALL_ROOT,
  });
  const yamlPathProd = hermesHost.yamlPath({ key: "conxa" });
  await configEditYaml.upsertEntry({
    configPath, yamlPath: yamlPathProd, entry: hermesHost.build(IDENTITY), installRoot: INSTALL_ROOT,
  });

  const text = readText(configPath);
  assert.ok(text.includes("conxa-dev:"));
  assert.ok(text.includes("conxa:"));
});

test("removeEntry: round-trip restores the file byte-identically", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const original = "# hermes\nmcp_servers:\n  other:\n    command: foo\n";
  fs.writeFileSync(configPath, original);
  const yamlPath = hermesHost.yamlPath(IDENTITY);
  const entry = hermesHost.build(IDENTITY);

  await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });
  assert.notStrictEqual(readText(configPath), original);

  const r = await configEditYaml.removeEntry({ configPath, yamlPath, installRoot: INSTALL_ROOT });
  assert.strictEqual(r.status, "ok");
  assert.strictEqual(readText(configPath), original);
});

test("removeEntry: missing file/entry is a successful no-op", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const yamlPath = hermesHost.yamlPath(IDENTITY);

  const r = await configEditYaml.removeEntry({ configPath, yamlPath, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "skipped:not-detected");
});

test("removeEntry: foreign entry is left alone", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const rawBefore = "mcp_servers:\n  conxa:\n    command: C:\\Other\\evil.exe\n";
  fs.writeFileSync(configPath, rawBefore);
  const yamlPath = hermesHost.yamlPath(IDENTITY);

  const r = await configEditYaml.removeEntry({ configPath, yamlPath, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "skipped:foreign-entry");
  assert.strictEqual(readText(configPath), rawBefore);
});

test("Goose entry shape uses cmd/type/args/enabled, not command", async () => {
  const dir = mkTmpDir();
  const configPath = path.join(dir, "config.yaml");
  const yamlPath = gooseHost.yamlPath(IDENTITY);
  const entry = gooseHost.build(IDENTITY);

  const r = await configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: INSTALL_ROOT });

  assert.strictEqual(r.status, "ok");
  const text = readText(configPath);
  assert.ok(text.includes("type: stdio"));
  assert.ok(text.includes("enabled: true"));
  assert.ok(text.includes("cmd:"));
});
