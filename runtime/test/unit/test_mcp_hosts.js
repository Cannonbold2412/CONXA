"use strict";
// Covers mcp_hosts.js: every Phase 2 host row is detected from the right
// filesystem evidence and produces a correctly-shaped entry at the right
// config path — plus the nuances that don't fit the generic table: VS Code's
// per-profile config files, Cline's two locations (and $CLINE_DATA_DIR),
// OpenClaw's nested object path, and comment preservation on the two JSONC
// hosts (Zed, KiloCode).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
  "CONXA_DIR", "CONXA_DATA_DIR", "CONXA_APP_DIR", "CONXA_ENV", "CONXA_UPDATE_CHANNEL", "CONXA_API_URL",
  "CLAUDE_CONFIG_DIR", "CLINE_DATA_DIR", "COPILOT_HOME", "KIRO_HOME", "QWEN_HOME",
  "OPENCLAW_CONFIG_PATH", "OPENCODE_CONFIG",
];

let savedEnv;
let savedExitCode;

test.beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  savedExitCode = process.exitCode;
});
test.afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  process.exitCode = savedExitCode;
});

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-hosts-test-"));
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const localAppData = path.join(home, "AppData", "Local");
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  process.env.CONXA_DIR = path.join(root, "conxa-install");
  for (const k of ["CLAUDE_CONFIG_DIR", "CLINE_DATA_DIR", "COPILOT_HOME", "KIRO_HOME", "QWEN_HOME",
    "OPENCLAW_CONFIG_PATH", "OPENCODE_CONFIG"]) delete process.env[k];
  return { root, home, appData, localAppData };
}

function mkdir(...segments) {
  const p = path.join(...segments);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function freshRegister() {
  delete require.cache[require.resolve("../../host/mcp_register")];
  return require("../../host/mcp_register");
}
function argvFor(subcommand, ...flags) {
  return ["exe", "script", subcommand, ...flags];
}

test("all Phase 2 hosts detect and register correctly from filesystem evidence", async () => {
  const fixture = mkFixture();
  const { home, appData } = fixture;

  mkdir(appData, "Claude");
  writeFile(path.join(home, ".claude.json"), "{}");
  mkdir(home, ".cursor");
  mkdir(appData, "Code", "User");
  mkdir(home, ".codeium", "windsurf");
  writeFile(path.join(home, ".gemini", "settings.json"), "{}");
  mkdir(home, ".cline");
  mkdir(appData, "Zed");
  mkdir(home, ".copilot");
  mkdir(home, ".factory");
  mkdir(home, ".config", "kilo");
  mkdir(home, ".gemini", "antigravity-cli");
  mkdir(home, ".config", "opencode");
  mkdir(home, ".openclaw");
  mkdir(home, ".config", "crush");
  mkdir(home, ".openhands");
  mkdir(home, ".augment");
  mkdir(home, ".kiro");
  mkdir(home, ".junie");
  mkdir(home, ".qwen");

  const results = await freshRegister().run(argvFor("register-mcp"));

  const byHost = Object.fromEntries(results.map((r) => [r.host, r]));
  const expectOk = [
    "claude-desktop", "claude-code", "cursor", "vscode", "windsurf", "gemini-cli", "cline",
    "zed", "copilot-cli", "factory", "kilocode", "antigravity", "opencode", "openclaw",
    "crush", "openhands", "augment", "kiro", "junie", "qwen",
  ];
  for (const id of expectOk) {
    assert.strictEqual(byHost[id].status, "ok", `${id}: expected ok, got ${byHost[id] && byHost[id].status}`);
  }

  // Spot-check shapes landed correctly (buildEntry itself is unit-tested in
  // test_config_edit.js — this proves the wiring, not the shape math).
  const vscodeDoc = JSON.parse(fs.readFileSync(path.join(appData, "Code", "User", "mcp.json"), "utf8"));
  assert.strictEqual(vscodeDoc.servers.conxa.type, "stdio");

  const kiloDoc = JSON.parse(fs.readFileSync(path.join(home, ".config", "kilo", "kilo.jsonc"), "utf8"));
  assert.ok(Array.isArray(kiloDoc.mcp.conxa.command));
  assert.strictEqual("args" in kiloDoc.mcp.conxa, false);

  const openclawDoc = JSON.parse(fs.readFileSync(path.join(home, ".openclaw", "openclaw.json"), "utf8"));
  assert.ok(openclawDoc.mcp.servers.conxa, "openclaw nested object path (mcp.servers) not populated");

  const copilotDoc = JSON.parse(fs.readFileSync(path.join(home, ".copilot", "mcp-config.json"), "utf8"));
  assert.strictEqual(copilotDoc.mcpServers.conxa.type, "local");
});

test("VS Code writes the default file AND every profile's mcp.json", async () => {
  const fixture = mkFixture();
  const { appData } = fixture;
  const userDir = mkdir(appData, "Code", "User");
  mkdir(userDir, "profiles", "work");
  mkdir(userDir, "profiles", "personal");

  await freshRegister().run(argvFor("register-mcp", "--only", "vscode"));

  for (const p of [
    path.join(userDir, "mcp.json"),
    path.join(userDir, "profiles", "work", "mcp.json"),
    path.join(userDir, "profiles", "personal", "mcp.json"),
  ]) {
    const doc = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(doc.servers.conxa, `missing entry in ${p}`);
  }
});

test("Cline writes both its config locations, honoring $CLINE_DATA_DIR", async () => {
  const fixture = mkFixture();
  const { home, root } = fixture;
  mkdir(home, ".cline");
  const dataDir = path.join(root, "cline-data-override");
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.CLINE_DATA_DIR = dataDir;

  await freshRegister().run(argvFor("register-mcp", "--only", "cline"));

  const cliDoc = JSON.parse(fs.readFileSync(path.join(home, ".cline", "mcp.json"), "utf8"));
  assert.ok(cliDoc.mcpServers.conxa);
  const ideDoc = JSON.parse(fs.readFileSync(path.join(dataDir, "settings", "cline_mcp_settings.json"), "utf8"));
  assert.ok(ideDoc.mcpServers.conxa);
});

test("Zed (JSONC): comments in an existing settings.json survive registration", async () => {
  const fixture = mkFixture();
  const { appData } = fixture;
  mkdir(appData, "Zed");
  const settingsPath = path.join(appData, "Zed", "settings.json");
  fs.writeFileSync(settingsPath,
    "{\n  // my Zed theme preference\n  \"theme\": \"dark\",\n  \"context_servers\": {} // keep\n}\n");

  await freshRegister().run(argvFor("register-mcp", "--only", "zed"));

  const text = fs.readFileSync(settingsPath, "utf8");
  assert.ok(text.includes("// my Zed theme preference"));
  assert.ok(text.includes("// keep"));
  const doc = JSON.parse(text.replace(/\/\/.*$/gm, "")); // crude comment strip for a sanity parse
  assert.ok(doc.context_servers.conxa);
});

test("KiloCode (JSONC): comments in an existing kilo.jsonc survive registration", async () => {
  const fixture = mkFixture();
  const { home } = fixture;
  const kiloDir = mkdir(home, ".config", "kilo");
  const kiloPath = path.join(kiloDir, "kilo.jsonc");
  fs.writeFileSync(kiloPath, "{\n  // user's kilo config\n  \"mcp\": {}\n}\n");

  await freshRegister().run(argvFor("register-mcp", "--only", "kilocode"));

  const text = fs.readFileSync(kiloPath, "utf8");
  assert.ok(text.includes("// user's kilo config"));
});

test("env-var overrides are honored: COPILOT_HOME, KIRO_HOME, QWEN_HOME, OPENCLAW_CONFIG_PATH, OPENCODE_CONFIG", async () => {
  const fixture = mkFixture();
  const { root } = fixture;
  const copilotHome = mkdir(root, "custom-copilot");
  const kiroHome = mkdir(root, "custom-kiro");
  const qwenHome = mkdir(root, "custom-qwen");
  // The override target's parent dir must already exist — same evidence rule
  // as every other host; a bare env var pointing at nothing is not enough.
  const openclawPath = path.join(mkdir(root, "custom-openclaw"), "openclaw.json");
  const opencodePath = path.join(mkdir(root, "custom-opencode"), "opencode.json");
  process.env.COPILOT_HOME = copilotHome;
  process.env.KIRO_HOME = kiroHome;
  process.env.QWEN_HOME = qwenHome;
  process.env.OPENCLAW_CONFIG_PATH = openclawPath;
  process.env.OPENCODE_CONFIG = opencodePath;

  await freshRegister().run(argvFor("register-mcp", "--only",
    "copilot-cli,kiro,qwen,openclaw,opencode"));

  assert.ok(fs.existsSync(path.join(copilotHome, "mcp-config.json")));
  assert.ok(fs.existsSync(path.join(kiroHome, "settings", "mcp.json")));
  assert.ok(fs.existsSync(path.join(qwenHome, "settings.json")));
  assert.ok(fs.existsSync(openclawPath));
  assert.ok(fs.existsSync(opencodePath));
});

test("Claude Code and Gemini CLI stay conditional: never created when their file is absent", async () => {
  mkFixture(); // no .claude.json, no .gemini/settings.json

  const results = await freshRegister().run(argvFor("register-mcp", "--only", "claude-code,gemini-cli"));

  const selected = results.filter((r) => r.host === "claude-code" || r.host === "gemini-cli");
  assert.strictEqual(selected.length, 2);
  assert.ok(selected.every((r) => r.status === "skipped:not-detected"));
  const others = results.filter((r) => r.host !== "claude-code" && r.host !== "gemini-cli");
  assert.ok(others.every((r) => r.status === "skipped:not-selected"));
});
