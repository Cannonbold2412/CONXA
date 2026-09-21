"use strict";

// A run that needs sign-in does not hold its execute_skill call open. It returns AT ONCE naming the
// application, waits for the sign-in in the background, and then starts by itself — the caller never
// re-issues it (that re-run loop, and the 45-90s wait that ended in "still waiting", is what this
// replaces). Here a local "app" whose login page lands straight on an authenticated page stands in
// for a user signing in. Over real MCP stdio: execute_skill must come back immediately with the
// app's name and a run_id, the run must finish with no second execute_skill call, and its outcome
// must be readable through get_execution_status.
//
// Run: node test/e2e/integration_auth_detached.js

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

    // A scheduled run has nobody to sign in: it must fail at once naming the app, open no sign-in
    // tab and detach nothing. Runs FIRST — it leaves no session behind, so the flow below still
    // starts signed out.
    const sched = await send("tools/call", { name: "execute_skill", arguments: { skill: "gate-skill", workspace_id: workspaceId, watch: false, _trigger: "scheduled" } });
    const schedText = sched?.result?.content?.[0]?.text || JSON.stringify(sched);
    check(/App A is not signed in/.test(schedText) && /nobody to sign in/.test(schedText), "a scheduled run fails at once and names the app that needs a person");
    check(!/Authentication required|do not run it again/.test(schedText), "a scheduled run does not detach or claim a window opened");
    const schedStatus = JSON.parse((await send("tools/call", { name: "get_execution_status", arguments: {} }))?.result?.content?.[0]?.text || "{}");
    check(Array.isArray(schedStatus.awaiting_auth) && schedStatus.awaiting_auth.length === 0, "a scheduled run leaves nothing waiting for sign-in");

    // wait_for_auth is part of the published tool contract (Build Studio's Run Test sets it false).
    const tools = (await send("tools/list", {}))?.result?.tools || [];
    check(tools.find((t) => t.name === "execute_skill")?.inputSchema?.properties?.wait_for_auth?.type === "boolean", "execute_skill advertises wait_for_auth");

    const t0 = Date.now();
    const resp = await send("tools/call", { name: "execute_skill", arguments: { skill: "gate-skill", workspace_id: workspaceId, watch: false } });
    const text = resp?.result?.content?.[0]?.text || JSON.stringify(resp);
    const tookMs = Date.now() - t0;
    console.log(`# execute_skill (${tookMs}ms) -> ${text.slice(0, 260).replace(/\n/g, " ")}`);

    check(/Authentication required — please sign in to App A/.test(text), "execute_skill names the application that needs sign-in");
    check(/do not run it again/i.test(text), "it tells the caller NOT to run the workflow again");
    const runId = (text.match(/run_id: (r_[a-z0-9_]+)/) || [])[1];
    check(Boolean(runId), "it returns a run_id to check on");
    check(resp?.result?._meta?.["conxa/awaiting_auth"]?.run_id === runId, "the structured _meta carries the same run_id for machine callers");
    check(!/Done\./.test(text), "it returned before the workflow ran, not after");

    // No second execute_skill: the run must start by itself once the sign-in lands.
    let last = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const s1 = await send("tools/call", { name: "get_execution_status", arguments: { run_id: runId } });
      last = JSON.parse(s1?.result?.content?.[0]?.text || "{}");
      if (last.state === "completed" || last.state === "failed" || last.state === "cancelled") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`# get_execution_status(${runId}) -> ${JSON.stringify(last).slice(0, 220)}`);
    check(last && last.state === "completed", "the run started by itself after sign-in and completed");
    check(last && /^Done\./.test(last.summary || ""), "its result is readable from get_execution_status");

    const all = await send("tools/call", { name: "get_execution_status", arguments: {} });
    const allJson = JSON.parse(all?.result?.content?.[0]?.text || "{}");
    check((allJson.recent || []).some((r) => r.run_id === runId), "the finished run appears in the recent results");
    check(Array.isArray(allJson.awaiting_auth) && allJson.awaiting_auth.length === 0, "nothing is left waiting for sign-in");

    const unknown = await send("tools/call", { name: "get_execution_status", arguments: { run_id: "r_nope" } });
    check(/"state":"unknown"/.test(unknown?.result?.content?.[0]?.text || ""), "an unknown run_id is reported, not silently ignored");

    // Signed in now: a later run goes straight through with no detour.
    stderrBuf = "";
    const again = await send("tools/call", { name: "execute_skill", arguments: { skill: "gate-skill", workspace_id: workspaceId, watch: false } });
    const againText = again?.result?.content?.[0]?.text || "";
    check(/^Done\./.test(againText) && !/auth_detached/.test(stderrBuf), "the session was stored — a later run does not hit the gate");

    // authenticate on an already-signed-in skill is an instant yes.
    const auth = await send("tools/call", { name: "authenticate", arguments: { skill: "gate-skill", workspace_id: workspaceId } });
    check(/"status":"signed_in"/.test(auth?.result?.content?.[0]?.text || ""), "authenticate reports signed_in once the session exists");
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
