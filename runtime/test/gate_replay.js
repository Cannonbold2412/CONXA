"use strict";
// CI execution gate: drive a packed host exe through a real, hermetic skill replay and
// assert it resolves + clicks an element on a local file:// page. Catches the class of bug
// where the packed runtime's Playwright selector engine is broken (e.g. pkg bytecode
// corruption): every locator returns 0 elements, so the click step fails — and so does the
// build. Unlike an MCP-initialize-only gate, this exercises the selector engine end-to-end.
//
// Usage: node gate_replay.js <path-to-host-exe> [app-layer-dir]
//   <path-to-host-exe>  packed conxa-runtime.exe to test.
//   [app-layer-dir]     conxa-app layer to load (e.g. dist-app/). Defaults to the current
//                       runtime/*.js source — so the host gate tests the host against HEAD.
//   Env: PLAYWRIGHT_BROWSERS_PATH (where chromium is installed) — required.
//
// Exit 0 = replay reached "Done."; non-zero = gate failed.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const exe = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!exe || !fs.existsSync(exe)) {
  console.error(`[gate] host exe not found: ${exe}`);
  process.exit(2);
}

const FIXTURE_DIR = path.join(__dirname, "gate-skill");
const SKILL_PACK_SRC = path.join(FIXTURE_DIR, "skill-pack");
const FIXTURE_URL = pathToFileURL(path.join(FIXTURE_DIR, "fixture.html")).href;

// ── stage a throwaway CONXA_DIR / CONXA_DATA_DIR ──────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-gate-"));
const conxaDir = path.join(tmp, ".conxa");
const dataDir = path.join(tmp, "data");
const sessionsDir = path.join(dataDir, "cache", "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(SKILL_PACK_SRC, path.join(conxaDir, "skill-packs"));
// Empty raw session → getAuthContext skips interactive login (protected_url is "").
fs.writeFileSync(path.join(sessionsDir, "gate_raw_state.json"), JSON.stringify({ cookies: [], origins: [] }));

// Stage the app layer the host loads from disk (CONXA_DIR/conxa-app/server.js).
const appDest = path.join(conxaDir, "conxa-app");
fs.mkdirSync(appDest, { recursive: true });
const appSrc = process.argv[3];
if (appSrc && fs.existsSync(appSrc)) {
  copyDir(appSrc, appDest);
} else {
  // Default: current runtime source as the app layer (host gate tests host vs HEAD).
  const RUNTIME_ROOT = path.join(__dirname, "..");
  const APP_FILES = [
    "server.js", "sync.js", "run.js", "browser.js", "skill_loader.js", "tracker.js",
    "install_identity.js", "bootstrap.js", "recovery.js", "resolve_adapter.js",
    "resolver.js", "auth_manager.js",
  ];
  for (const f of APP_FILES) fs.copyFileSync(path.join(RUNTIME_ROOT, f), path.join(appDest, f));
}
if (!fs.existsSync(path.join(appDest, "version.json"))) {
  fs.writeFileSync(path.join(appDest, "version.json"),
    JSON.stringify({ app_version: "app-vGATE", min_host: "host-v1.0.0", files: {} }));
}

function cleanup() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }

// ── spawn + MCP stdio handshake ───────────────────────────────────────────────
const child = spawn(exe, [], {
  cwd: conxaDir,
  env: {
    ...process.env,
    CONXA_DIR: conxaDir,
    CONXA_DATA_DIR: dataDir,
    CONXA_SKIP_SELF_UPDATE: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrTail = [];
child.stderr.on("data", d => {
  stderrTail.push(d.toString());
  if (stderrTail.length > 40) stderrTail = stderrTail.slice(-40);
});

let buf = "";
const pending = new Map();
child.stdout.on("data", d => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let nextId = 1;
function send(method, params) {
  const id = nextId++;
  const p = new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 180000);
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return p;
}

function fail(msg) {
  console.error(`[gate] FAIL: ${msg}`);
  if (stderrTail.length) console.error("[gate] runtime stderr tail:\n" + stderrTail.join(""));
  try { child.kill(); } catch (_) {}
  cleanup();
  process.exit(1);
}

(async () => {
  try {
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "conxa-gate", version: "1.0.0" },
    });
    const resp = await send("tools/call", {
      name: "execute_skill",
      arguments: {
        skill: "gate-skill",
        company: "gate",
        inputs: { fixture_url: FIXTURE_URL },
        watch: false,
      },
    });
    const texts = ((resp.result && resp.result.content) || [])
      .filter(c => c && c.type === "text").map(c => c.text).join("\n");
    if (resp.error) return fail(`tools/call error: ${JSON.stringify(resp.error)}`);
    if (/^Done\./m.test(texts)) {
      console.log("[gate] PASS: selector engine resolved the fixture element — replay reached 'Done.'");
      try { child.kill(); } catch (_) {}
      cleanup();
      process.exit(0);
    }
    return fail(`replay did not reach 'Done.':\n${texts}`);
  } catch (e) {
    return fail(e.message);
  }
})();
