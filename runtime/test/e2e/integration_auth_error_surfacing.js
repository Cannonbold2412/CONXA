"use strict";

// Regression test for browser.js's getAuthContext: its encrypted-session block used to wrap
// _validateSession/_buildExecContext inside the same try{} that guards authManager.getSessionKey/
// loadDecryptedSession, so a genuine failure there (e.g. chromium.launch() unable to find an
// installed browser) was silently swallowed. With the raw session file already deleted by the
// startup reencryption sweep, execution fell through to the final "no target_url configured"
// check and reported THAT instead — a confusing, wrong diagnosis pointing at skill-pack
// configuration when the real problem was the browser install. This drives the real MCP
// tool-call path with a genuinely broken PLAYWRIGHT_BROWSERS_PATH and asserts the real failure
// is what comes back, not the misleading one.
//
// Run: node test/e2e/integration_auth_error_surfacing.js

const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const RUNTIME_DIR = path.join(__dirname, "..", "..");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`ok - ${label}`);
  else { failures++; console.log(`not ok - ${label}`); }
}

function writeSkill(skillPacksDir, workspaceId, slug) {
  const dir = path.join(skillPacksDir, workspaceId, "_default", slug, "current");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    slug, name: slug, version: "0.0.1", required_runtime: ">=0.0.0",
    company: workspaceId, target_url: "", inputs_required: [], checksum: {},
  }));
  fs.writeFileSync(path.join(dir, "execution.json"), JSON.stringify([
    { type: "navigate", url: "http://127.0.0.1:1/unreachable" },
  ]));
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify({ inputs: [] }));
  fs.writeFileSync(path.join(dir, "recovery.json"), JSON.stringify({ steps: [] }));
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-autherr-e2e-"));
  const CONXA_DIR = path.join(tmpRoot, "install");
  const CONXA_DATA_DIR = path.join(tmpRoot, "data");
  const workspaceId = "autherr-ws";
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");
  // Deliberately empty — no installed browser here at all, so chromium.launch() genuinely fails.
  const brokenBrowsersPath = path.join(tmpRoot, "no-browsers-here");
  fs.mkdirSync(brokenBrowsersPath, { recursive: true });

  writeSkill(skillPacksDir, workspaceId, "no-browser-skill");

  // Empty target_url/protected_url (matches the gate-skill fixture) — auth relies entirely on
  // the stored session, so if the encrypted-session attempt swallows its real error, the only
  // thing left to report is the misleading "No target_url configured" this test guards against.
  fs.writeFileSync(path.join(skillPacksDir, workspaceId, "pack.json"), JSON.stringify({
    workspace_id: workspaceId, skill_pack_version: "0.0.1", required_runtime: ">=0.0.0",
    target_url: "", protected_url: "",
    skills: ["no-browser-skill"], tracking: { enabled: false },
  }));
  const sessionsDir = path.join(CONXA_DATA_DIR, "cache", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, `${workspaceId}_raw_state.json`), JSON.stringify({ cookies: [], origins: [] }));

  const env = Object.assign({}, process.env, {
    CONXA_DIR, CONXA_DATA_DIR, CONXA_SKIP_SELF_UPDATE: "1",
    PLAYWRIGHT_BROWSERS_PATH: brokenBrowsersPath,
  });
  const child = spawn(process.execPath, ["app/server.js"], { cwd: RUNTIME_DIR, env, stdio: ["pipe", "pipe", "pipe"] });
  let stderrBuf = "";
  child.stderr.on("data", (d) => { stderrBuf += d.toString(); });

  let id = 1;
  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  function send(method, params = {}) {
    const reqId = id++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id: reqId, method, params });
    child.stdin.write(msg + "\n");
    return new Promise((resolve) => { pending.set(reqId, { resolve }); });
  }

  try {
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } });

    const resp = await send("tools/call", { name: "execute_skill", arguments: { skill: "no-browser-skill", workspace_id: workspaceId, watch: false } });
    const text = resp?.result?.content?.[0]?.text || JSON.stringify(resp);

    check(!/No target_url configured/.test(text), `the misleading target_url message is not shown (got: ${text.slice(0, 200)})`);
    check(/browserType\.launch|Executable doesn't exist|playwright install/i.test(text), `the real browser-launch failure is surfaced (got: ${text.slice(0, 200)})`);
  } finally {
    child.kill();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  if (failures) console.log("--- server stderr tail ---\n" + stderrBuf.split("\n").slice(-40).join("\n"));
  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
