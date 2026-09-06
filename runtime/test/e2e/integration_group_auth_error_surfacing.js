"use strict";

// Regression test for browser.js's getGroupAuthContext -> beginInteractiveAuth: a
// genuine chromium.launch() failure (missing/mid-install browser) used to be swallowed
// by a detached, fire-and-forget background task, so the tool call returned an
// optimistic "Sign in to X in the window that just opened" message even though no
// window ever opened. This drives the real MCP tool-call path for a workflow-group
// skill (2 apps, both missing sessions) with a genuinely broken
// PLAYWRIGHT_BROWSERS_PATH and asserts the real chromium-launch failure comes back
// instead of the misleading "window opened" wording.
//
// Run: node test/e2e/integration_group_auth_error_surfacing.js

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
    group_id: "g1", required_apps: ["app_drive", "app_docs"],
  }));
  fs.writeFileSync(path.join(dir, "execution.json"), JSON.stringify([
    { type: "navigate", url: "http://127.0.0.1:1/unreachable" },
  ]));
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify({ inputs: [] }));
  fs.writeFileSync(path.join(dir, "recovery.json"), JSON.stringify({ steps: [] }));
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-groupautherr-e2e-"));
  const CONXA_DIR = path.join(tmpRoot, "install");
  const CONXA_DATA_DIR = path.join(tmpRoot, "data");
  const workspaceId = "groupautherr-ws";
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");
  // Deliberately empty — no installed browser here at all, so chromium.launch() genuinely fails.
  const brokenBrowsersPath = path.join(tmpRoot, "no-browsers-here");
  fs.mkdirSync(brokenBrowsersPath, { recursive: true });

  writeSkill(skillPacksDir, workspaceId, "group-skill");

  // Neither group app has a stored session file, so both are missing-required and
  // getGroupAuthContext calls beginInteractiveAuth for each (see browser.js).
  fs.writeFileSync(path.join(skillPacksDir, workspaceId, "pack.json"), JSON.stringify({
    workspace_id: workspaceId, skill_pack_version: "0.0.1", required_runtime: ">=0.0.0",
    target_url: "", protected_url: "",
    skills: ["group-skill"], tracking: { enabled: false },
    groups: [{
      id: "g1", name: "Enterprise",
      apps: [
        { id: "app_drive", name: "Google Drive", login_url: "http://127.0.0.1:1/drive-login" },
        { id: "app_docs", name: "Google Docs", login_url: "http://127.0.0.1:1/docs-login" },
      ],
    }],
  }));

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

    const resp = await send("tools/call", { name: "execute_skill", arguments: { skill: "group-skill", workspace_id: workspaceId, watch: false } });
    const text = resp?.result?.content?.[0]?.text || JSON.stringify(resp);

    check(!/window that just opened|window.*opened for the user/i.test(text),
      `the misleading "window opened" message is not shown (got: ${text.slice(0, 200)})`);
    check(/browserType\.launch|Executable doesn't exist|playwright install/i.test(text),
      `the real browser-launch failure is surfaced (got: ${text.slice(0, 200)})`);
  } finally {
    child.kill();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  if (failures) console.log("--- server stderr tail ---\n" + stderrBuf.split("\n").slice(-40).join("\n"));
  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
