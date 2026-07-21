"use strict";
// Covers mcp_register.js's TOML-host loop (Codex, Vibe) end-to-end: detection,
// --only/--plan interplay with the JSON-host loop, and unregister round-trip.
// Same os.homedir()-via-USERPROFILE sandboxing as test_mcp_register.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
  "CONXA_DIR", "CONXA_DATA_DIR", "CONXA_APP_DIR", "CONXA_ENV", "CONXA_UPDATE_CHANNEL", "CONXA_API_URL",
  "CODEX_HOME", "VIBE_HOME",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-register-toml-test-"));
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
  return { root, home };
}
function mkdir(...segments) {
  const p = path.join(...segments);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function freshRegister() {
  delete require.cache[require.resolve("../mcp_register")];
  return require("../mcp_register");
}
function argvFor(subcommand, ...flags) {
  return ["exe", "script", subcommand, ...flags];
}

test("register-mcp writes Codex and Vibe TOML blocks when detected", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".codex");
  mkdir(fixture.home, ".vibe");

  const results = await freshRegister().run(argvFor("register-mcp", "--only", "codex,vibe"));

  const selected = results.filter((r) => r.host === "codex" || r.host === "vibe");
  assert.strictEqual(selected.length, 2);
  assert.ok(selected.every((r) => r.status === "ok"), JSON.stringify(selected));
  const codexText = fs.readFileSync(path.join(fixture.home, ".codex", "config.toml"), "utf8");
  assert.ok(codexText.includes("[mcp_servers.conxa]"));
  const vibeText = fs.readFileSync(path.join(fixture.home, ".vibe", "config.toml"), "utf8");
  assert.ok(vibeText.includes('name = "conxa"'));
});

test("TOML hosts respect CODEX_HOME/VIBE_HOME overrides", async () => {
  const fixture = mkFixture();
  const codexHome = mkdir(fixture.root, "custom-codex");
  const vibeHome = mkdir(fixture.root, "custom-vibe");
  process.env.CODEX_HOME = codexHome;
  process.env.VIBE_HOME = vibeHome;

  await freshRegister().run(argvFor("register-mcp", "--only", "codex,vibe"));

  assert.ok(fs.existsSync(path.join(codexHome, "config.toml")));
  assert.ok(fs.existsSync(path.join(vibeHome, "config.toml")));
});

test("unregister-mcp removes the Codex block, leaving the rest of config.toml intact", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".codex");
  const configPath = path.join(fixture.home, ".codex", "config.toml");
  fs.writeFileSync(configPath, '[model]\nprovider = "openai"\n');

  await freshRegister().run(argvFor("register-mcp", "--only", "codex"));
  assert.ok(fs.readFileSync(configPath, "utf8").includes("[mcp_servers.conxa]"));

  await freshRegister().run(argvFor("unregister-mcp", "--only", "codex"));
  const text = fs.readFileSync(configPath, "utf8");
  assert.ok(!text.includes("[mcp_servers.conxa]"));
  assert.ok(text.includes('provider = "openai"'));
});

test("--plan covers TOML hosts too — no writes", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".codex");

  await freshRegister().run(argvFor("register-mcp", "--plan", "--only", "codex"));

  assert.strictEqual(fs.existsSync(path.join(fixture.home, ".codex", "config.toml")), false);
});

test("dev/prod TOML entries coexist, same key-derivation as JSON hosts (G4 parity)", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".codex");

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("register-mcp", "--only", "codex"));
  delete process.env.CONXA_ENV;
  await freshRegister().run(argvFor("register-mcp", "--only", "codex"));

  const text = fs.readFileSync(path.join(fixture.home, ".codex", "config.toml"), "utf8");
  assert.ok(text.includes("[mcp_servers.conxa-dev]"));
  assert.ok(text.includes("[mcp_servers.conxa]"));

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("unregister-mcp", "--only", "codex"));
  const after = fs.readFileSync(path.join(fixture.home, ".codex", "config.toml"), "utf8");
  assert.ok(!after.includes("[mcp_servers.conxa-dev]"));
  assert.ok(after.includes("[mcp_servers.conxa]"));
});
