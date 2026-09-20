"use strict";

// The execute_skill auth gate waits for sign-in and then continues the run in the SAME call — it
// used to throw "sign in, then run the skill again" the instant a login window opened, which sent
// callers into an endless re-run loop. Here a local "app" whose login page lands straight on an
// authenticated page stands in for a user signing in: execute_skill opens the (real, headed)
// login window, waits, captures the session, and must finish the run without a second call.
//
// Run: node test/e2e/integration_auth_gate_waits.js

const os = require("os");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const RUNTIME_DIR = path.join(__dirname, "..", "..");
const _repoChromium = path.join(RUNTIME_DIR, "chromium");
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH
  || (fs.existsSync(_repoChromium) ? _repoChromium : path.join(os.homedir(), ".conxa", "chromium"));

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`ok - ${label}`);
  else { failures++; console.log(`not ok - ${label}`); }
}

async function main() {
  // /login bounces to /home at once (no credentials needed); everything else is "logged in".
  const app = http.createServer((req, res) => {
    if (req.url.startsWith("/login")) { res.writeHead(302, { Location: "/home" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<title>home</title><h1>home</h1>");
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-authgate-e2e-"));
  const CONXA_DIR = path.join(tmpRoot, "install");
  const CONXA_DATA_DIR = path.join(tmpRoot, "data");
  const workspaceId = "authgate-ws";
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");

  const dir = path.join(skillPacksDir, workspaceId, "_default", "gate-skill", "current");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    slug: "gate-skill", name: "gate-skill", version: "0.0.1", required_runtime: ">=0.0.0",
    company: workspaceId, target_url: `${base}/home`, inputs_required: [], checksum: {},
    group_id: "g1", required_apps: ["app_a"],
  }));
  fs.writeFileSync(path.join(dir, "execution.json"), JSON.stringify([{ type: "navigate", url: `${base}/home` }]));
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify({ inputs: [] }));
  fs.writeFileSync(path.join(dir, "recovery.json"), JSON.stringify({ steps: [] }));
  fs.writeFileSync(path.join(skillPacksDir, workspaceId, "pack.json"), JSON.stringify({
    workspace_id: workspaceId, skill_pack_version: "0.0.1", required_runtime: ">=0.0.0",
    target_url: "", protected_url: "", skills: ["gate-skill"], tracking: { enabled: false },
    groups: [{ id: "g1", name: "Team", apps: [
      { id: "app_a", name: "App A", login_url: `${base}/login`, success_url: `${base}/home` },
    ] }],
  }));

  const env = Object.assign({}, process.env, {
    CONXA_DIR, CONXA_DATA_DIR, CONXA_SKIP_SELF_UPDATE: "1", PLAYWRIGHT_BROWSERS_PATH: BROWSERS,
    CONXA_AUTH_GATE_WAIT_MS: "60000", // ample for the local bounce; the run itself has its own deadline
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
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const send = (method, params = {}) => {
    const reqId = id++;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: reqId, method, params }) + "\n");
    return new Promise((resolve) => pending.set(reqId, resolve));
  };

  try {
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } });

    const resp = await send("tools/call", { name: "execute_skill", arguments: { skill: "gate-skill", workspace_id: workspaceId, watch: false } });
    const text = resp?.result?.content?.[0]?.text || JSON.stringify(resp);
    console.log(`# execute_skill -> ${text.slice(0, 200).replace(/\n/g, " ")}`);

    check(!/sign in|authentication|log ?in/i.test(text), "the run finished in one call — no 'sign in, then run it again'");
    check(/auth_gate_wait_start/.test(stderrBuf) && /auth_gate_wait_done/.test(stderrBuf), "the gate waited for the sign-in window");

    // A second call finds the captured session: no login window, no wait.
    stderrBuf = "";
    const again = await send("tools/call", { name: "execute_skill", arguments: { skill: "gate-skill", workspace_id: workspaceId, watch: false } });
    check(!/auth_gate_wait_start/.test(stderrBuf), "the session was stored — a later run does not hit the gate");

    // authenticate on an already-signed-in skill is an instant yes.
    const auth = await send("tools/call", { name: "authenticate", arguments: { skill: "gate-skill", workspace_id: workspaceId } });
    check(/"status":"signed_in"/.test(auth?.result?.content?.[0]?.text || ""), "authenticate reports signed_in once the session exists");
    void again;
  } finally {
    child.kill();
    app.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  if (failures) console.log("--- server stderr tail ---\n" + stderrBuf.split("\n").slice(-40).join("\n"));
  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
