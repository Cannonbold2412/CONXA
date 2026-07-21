"use strict";
// Covers mcp_register.js end-to-end: host detection, --plan/--only, and the
// dev/prod key-isolation regression that shipped as a live bug — the old NSIS
// uninstaller hardcoded the key 'conxa' while install wrote '${MCP_SERVER}'
// (conxa-dev on the dev channel), so uninstalling a dev build left a dangling
// entry behind. Here, register and unregister both derive the key from
// CONXA_ENV via the same env.js the whole runtime uses, so they cannot drift.
//
// os.homedir() reads USERPROFILE on win32 live (no internal caching), so
// pointing USERPROFILE at a fixture directory redirects host detection
// without touching the real machine's AI-agent configs.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_KEYS = [
  "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
  "CONXA_DIR", "CONXA_DATA_DIR", "CONXA_APP_DIR", "CONXA_ENV", "CONXA_UPDATE_CHANNEL", "CONXA_API_URL",
  "CLAUDE_CONFIG_DIR",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-register-test-"));
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
  delete process.env.CLAUDE_CONFIG_DIR;

  return { root, home, appData, localAppData };
}

function detectClaudeDesktop(fixture) {
  fs.mkdirSync(path.join(fixture.appData, "Claude"), { recursive: true });
}

function claudeDesktopConfigPath(fixture) {
  return path.join(fixture.appData, "Claude", "claude_desktop_config.json");
}

function detectClaudeCode(fixture) {
  fs.writeFileSync(path.join(fixture.home, ".claude.json"), "{}");
}

function claudeCodeConfigPath(fixture) {
  return path.join(fixture.home, ".claude.json");
}

function freshRegister() {
  delete require.cache[require.resolve("../mcp_register")];
  return require("../mcp_register");
}

// Real process.argv (matching bootstrap.js's `process.argv[2] === "register-mcp"`
// dispatch and server.js's `[,, ...cliArgs]` convention) is
// [exePath, scriptPath, subcommand, ...flags] — mode lives at argv[2], flags
// start at argv[3]. Fixtures must include the scriptPath placeholder slot.
function argvFor(subcommand, ...flags) {
  return ["exe", "script", subcommand, ...flags];
}

test("register-mcp under CONXA_ENV=dev writes the conxa-dev key, not conxa", async () => {
  const fixture = mkFixture();
  detectClaudeDesktop(fixture);
  detectClaudeCode(fixture);
  process.env.CONXA_ENV = "dev";

  await freshRegister().run(argvFor("register-mcp"));

  const desktopDoc = JSON.parse(fs.readFileSync(claudeDesktopConfigPath(fixture), "utf8"));
  const codeDoc = JSON.parse(fs.readFileSync(claudeCodeConfigPath(fixture), "utf8"));
  assert.ok(desktopDoc.mcpServers["conxa-dev"], "desktop config missing conxa-dev entry");
  assert.strictEqual(desktopDoc.mcpServers.conxa, undefined);
  assert.ok(codeDoc.mcpServers["conxa-dev"], "claude code config missing conxa-dev entry");
  assert.strictEqual(codeDoc.mcpServers.conxa, undefined);
  assert.ok(desktopDoc.mcpServers["conxa-dev"].command.includes("conxa-install"));
});

test("dev and prod entries coexist under the same host config", async () => {
  const fixture = mkFixture();
  detectClaudeCode(fixture);

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("register-mcp"));

  delete process.env.CONXA_ENV;
  await freshRegister().run(argvFor("register-mcp"));

  const doc = JSON.parse(fs.readFileSync(claudeCodeConfigPath(fixture), "utf8"));
  assert.ok(doc.mcpServers["conxa-dev"]);
  assert.ok(doc.mcpServers.conxa);
});

test("G4 regression: unregister-mcp under CONXA_ENV=dev removes only conxa-dev", async () => {
  const fixture = mkFixture();
  detectClaudeCode(fixture);

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("register-mcp"));
  delete process.env.CONXA_ENV;
  await freshRegister().run(argvFor("register-mcp"));

  let doc = JSON.parse(fs.readFileSync(claudeCodeConfigPath(fixture), "utf8"));
  const prodEntryBefore = doc.mcpServers.conxa;
  assert.ok(doc.mcpServers["conxa-dev"]);
  assert.ok(prodEntryBefore);

  process.env.CONXA_ENV = "dev";
  await freshRegister().run(argvFor("unregister-mcp"));

  doc = JSON.parse(fs.readFileSync(claudeCodeConfigPath(fixture), "utf8"));
  assert.strictEqual(doc.mcpServers["conxa-dev"], undefined, "conxa-dev entry should be gone");
  assert.deepStrictEqual(doc.mcpServers.conxa, prodEntryBefore, "conxa (prod) entry must survive untouched");
});

test("--plan performs no writes", async () => {
  const fixture = mkFixture();
  detectClaudeDesktop(fixture);

  await freshRegister().run(argvFor("register-mcp", "--plan"));

  assert.strictEqual(fs.existsSync(claudeDesktopConfigPath(fixture)), false);
});

test("--only restricts registration to the named host", async () => {
  const fixture = mkFixture();
  detectClaudeDesktop(fixture);
  detectClaudeCode(fixture);

  await freshRegister().run(argvFor("register-mcp", "--only", "claude-code"));

  assert.strictEqual(fs.existsSync(claudeDesktopConfigPath(fixture)), false);
  const codeDoc = JSON.parse(fs.readFileSync(claudeCodeConfigPath(fixture), "utf8"));
  assert.ok(codeDoc.mcpServers.conxa);
});

test("exit code is 0 when no host is detected", async () => {
  mkFixture(); // no Claude dir, no .claude.json — nothing detected

  const results = await freshRegister().run(argvFor("register-mcp"));

  assert.ok(results.every((r) => r.status === "skipped:not-detected"));
  assert.strictEqual(process.exitCode, 0);
});

test("claude-code is conditional: never created if .claude.json doesn't exist", async () => {
  const fixture = mkFixture(); // no .claude.json

  await freshRegister().run(argvFor("register-mcp"));

  assert.strictEqual(fs.existsSync(claudeCodeConfigPath(fixture)), false);
});

test("summarize: counts ok/not-detected/foreign-entry/error into one readable line", () => {
  const { summarize } = freshRegister();
  const results = [
    { status: "ok" }, { status: "ok" },
    { status: "skipped:not-detected" },
    { status: "skipped:foreign-entry" },
    { status: "error:EACCES" },
  ];
  const line = summarize("register-mcp", results);
  assert.strictEqual(line, "conxa register-mcp: 2 ok, 1 not installed, 1 left alone (not ours), 1 FAILED");
});

test("status file is written after a real run, first line matches the summary NSIS reads", async () => {
  const fixture = mkFixture();
  detectClaudeCode(fixture);

  await freshRegister().run(argvFor("register-mcp"));

  const statusPath = path.join(fixture.root, "conxa-install", "mcp-register-status.txt");
  assert.ok(fs.existsSync(statusPath));
  const firstLine = fs.readFileSync(statusPath, "utf8").split("\n")[0];
  // Only claude-code is detected in this fixture; every other row (JSON,
  // TOML, and YAML hosts alike) is not. Deriving the expected count from the
  // host tables themselves (rather than hardcoding a number) is deliberate —
  // it's what makes this test keep passing as hosts are added in later
  // phases instead of silently drifting out of sync with reality.
  const { HOSTS } = require("../mcp_hosts");
  const { TOML_HOSTS } = require("../mcp_hosts_toml");
  const { YAML_HOSTS } = require("../mcp_hosts_yaml");
  const totalHosts = HOSTS.length + TOML_HOSTS.length + YAML_HOSTS.length;
  assert.strictEqual(firstLine, `conxa register-mcp: 1 ok, ${totalHosts - 1} not installed`);
});

test("--plan writes no status file (dry-run touches nothing, including our own diagnostics)", async () => {
  const fixture = mkFixture();
  detectClaudeCode(fixture);

  await freshRegister().run(argvFor("register-mcp", "--plan"));

  const statusPath = path.join(fixture.root, "conxa-install", "mcp-register-status.txt");
  assert.strictEqual(fs.existsSync(statusPath), false);
});
