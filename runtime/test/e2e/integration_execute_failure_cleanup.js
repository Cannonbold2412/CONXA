"use strict";

// Regression test for a block-scoping bug in server.js's _handleTool: _attachPageListeners,
// _trackOpenedTab, and _detachContextListeners used to be declared with const INSIDE the
// execute_skill try{} block, then called from the SIBLING catch{} block. catch{} cannot see
// const/let declared inside try{} (it's a sibling block, not a nested one) — every failed
// execute_skill call threw "ReferenceError: _detachContextListeners is not defined" while
// trying to clean up, regardless of what actually failed. This drives the real MCP tool-call
// path (server.js), not run.js's runPlan in isolation, and forces the cheapest deterministic
// failure available: a workspace with no target_url and no stored session, which throws
// inside getAuthContext before any browser/page work — no Playwright browser install needed.
//
// Run: node test/e2e/integration_execute_failure_cleanup.js

const os = require("os");
const path = require("path");
const fs = require("fs");
const assert = require("node:assert");
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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-execfail-e2e-"));
  const CONXA_DIR = path.join(tmpRoot, "install");
  const CONXA_DATA_DIR = path.join(tmpRoot, "data");
  const workspaceId = "execfail-ws";
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");

  writeSkill(skillPacksDir, workspaceId, "no-auth-skill");

  // Deliberately empty target_url/protected_url, and NO raw/encrypted session file staged —
  // getAuthContext falls through every session path and throws "No target_url configured"
  // before any browser/page work happens.
  fs.writeFileSync(path.join(skillPacksDir, workspaceId, "pack.json"), JSON.stringify({
    workspace_id: workspaceId, skill_pack_version: "0.0.1", required_runtime: ">=0.0.0",
    target_url: "", protected_url: "",
    skills: ["no-auth-skill"], tracking: { enabled: false },
  }));
  fs.mkdirSync(path.join(CONXA_DATA_DIR, "cache", "sessions"), { recursive: true });

  const env = Object.assign({}, process.env, {
    CONXA_DIR, CONXA_DATA_DIR, CONXA_SKIP_SELF_UPDATE: "1",
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

    const resp = await send("tools/call", { name: "execute_skill", arguments: { skill: "no-auth-skill", workspace_id: workspaceId, watch: false } });
    const text = resp?.result?.content?.[0]?.text || JSON.stringify(resp);

    // Before the fix, the catch{} block's own cleanup call throws a ReferenceError that escapes
    // _handleTool entirely, and server.js's outer catch wraps THAT as "Internal error: ...".
    check(!/Internal error:/.test(text), `the real failure reaches the caller, not masked by a crash during cleanup (got: ${text.slice(0, 200)})`);
    check(!/is not defined/.test(text), `cleanup does not crash with a ReferenceError (got: ${text.slice(0, 200)})`);
    check(/No target_url configured/.test(text), `the actual auth failure is reported cleanly (got: ${text.slice(0, 200)})`);

    // Prove the process is still alive and responsive after the failure — a crash mid-cleanup
    // could otherwise leave the run registry slot stuck or the process wedged for every later call.
    const status = await send("tools/call", { name: "get_runtime_status", arguments: {} });
    check(!!status?.result, "the server is still alive and responsive after the failed run");
  } finally {
    child.kill();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  if (failures) console.log("--- server stderr tail ---\n" + stderrBuf.split("\n").slice(-40).join("\n"));
  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
