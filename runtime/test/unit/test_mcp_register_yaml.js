"use strict";
// Covers mcp_register.js's YAML-host loop (Goose, Hermes) end-to-end.
// Same os.homedir()-via-USERPROFILE sandboxing as the other integration tests.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
  "CONXA_DIR", "CONXA_DATA_DIR", "CONXA_APP_DIR", "CONXA_ENV", "CONXA_UPDATE_CHANNEL", "CONXA_API_URL",
  "HERMES_HOME",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-register-yaml-test-"));
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
  return { root, home, appData };
}
function mkdir(...segments) {
  const p = path.join(...segments);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function freshRegister() {
  delete require.cache[require.resolve("../../host/mcp_register")];
  return require("../../host/mcp_register");
}
function argvFor(subcommand, ...flags) {
  return ["exe", "script", subcommand, ...flags];
}

test("register-mcp writes Goose and Hermes YAML entries when detected", async () => {
  const fixture = mkFixture();
  mkdir(fixture.appData, "Block", "goose");
  mkdir(fixture.home, ".hermes");

  const results = await freshRegister().run(argvFor("register-mcp", "--only", "goose,hermes"));

  const selected = results.filter((r) => r.host === "goose" || r.host === "hermes");
  assert.strictEqual(selected.length, 2);
  assert.ok(selected.every((r) => r.status === "ok"), JSON.stringify(selected));

  const gooseText = fs.readFileSync(path.join(fixture.appData, "Block", "goose", "config", "config.yaml"), "utf8");
  assert.ok(gooseText.includes("type: stdio"));
  const hermesText = fs.readFileSync(path.join(fixture.home, ".hermes", "config.yaml"), "utf8");
  assert.ok(hermesText.includes("mcp_servers:"));
});

test("Hermes respects $HERMES_HOME override", async () => {
  const fixture = mkFixture();
  const hermesHome = mkdir(fixture.root, "custom-hermes");
  process.env.HERMES_HOME = hermesHome;

  await freshRegister().run(argvFor("register-mcp", "--only", "hermes"));

  assert.ok(fs.existsSync(path.join(hermesHome, "config.yaml")));
});

test("unregister-mcp removes the Hermes entry, leaving other content intact", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".hermes");
  const configPath = path.join(fixture.home, ".hermes", "config.yaml");
  fs.writeFileSync(configPath, "# hermes\nmcp_servers:\n  other:\n    command: foo\n");

  await freshRegister().run(argvFor("register-mcp", "--only", "hermes"));
  assert.ok(fs.readFileSync(configPath, "utf8").includes("conxa:"));

  await freshRegister().run(argvFor("unregister-mcp", "--only", "hermes"));
  const text = fs.readFileSync(configPath, "utf8");
  assert.ok(!text.includes("conxa:"));
  assert.ok(text.includes("other:"));
  assert.ok(text.includes("# hermes"));
});

test("--plan covers YAML hosts too — no writes", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".hermes");

  await freshRegister().run(argvFor("register-mcp", "--plan", "--only", "hermes"));

  assert.strictEqual(fs.existsSync(path.join(fixture.home, ".hermes", "config.yaml")), false);
});

test("dev/prod entries coexist for Hermes, same key-derivation as everywhere else", async () => {
  const fixture = mkFixture();
  mkdir(fixture.home, ".hermes");

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("register-mcp", "--only", "hermes"));
  delete process.env.CONXA_ENV;
  await freshRegister().run(argvFor("register-mcp", "--only", "hermes"));

  const text = fs.readFileSync(path.join(fixture.home, ".hermes", "config.yaml"), "utf8");
  assert.ok(text.includes("conxa-dev:"));
  assert.ok(text.includes("conxa:"));

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("unregister-mcp", "--only", "hermes"));
  const after = fs.readFileSync(path.join(fixture.home, ".hermes", "config.yaml"), "utf8");
  assert.ok(!after.includes("conxa-dev:"));
  assert.ok(after.includes("conxa:"));
});
