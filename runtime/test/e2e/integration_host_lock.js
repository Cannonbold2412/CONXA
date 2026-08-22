"use strict";

// RT-3 follow-up: proves host_lock.js actually serializes two DIFFERENT skills that target the
// SAME external host when driven through the real MCP tool-call path (server.js), not just at
// the host_lock.js unit level. Two skills in one workspace, same target_url host: firing
// execute_skill for both concurrently must not run them in parallel against that host — the
// second call blocks (visibly, via get_execution_status's waiting_for_host) until the first
// finishes, then both complete successfully.
//
// Run: node test/e2e/integration_host_lock.js   (requires Playwright + installed Chromium)

const os = require("os");
const path = require("path");
const fs = require("fs");
const http = require("http");
const assert = require("node:assert");
const { spawn } = require("child_process");

const RUNTIME_DIR = path.join(__dirname, "..", "..");
const _repoChromium = path.join(RUNTIME_DIR, "chromium");
const PLAYWRIGHT_BROWSERS_PATH = fs.existsSync(_repoChromium)
  ? _repoChromium
  : path.join(os.homedir(), ".conxa", "chromium");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`ok - ${label}`);
  else { failures++; console.log(`not ok - ${label}`); }
}

const PAGE_HTML = `<!doctype html><html><head><title>start</title></head><body>
  <button data-testid="go" onclick="document.title='clicked'">Go</button>
</body></html>`;

function writeSkill(skillPacksDir, workspaceId, slug, targetUrl, navigatePath) {
  const dir = path.join(skillPacksDir, workspaceId, "_default", slug, "current");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    slug, name: slug, version: "0.0.1", required_runtime: ">=0.0.0",
    company: workspaceId, target_url: targetUrl, inputs_required: [], checksum: {},
  }));
  fs.writeFileSync(path.join(dir, "execution.json"), JSON.stringify([
    { type: "navigate", url: `${targetUrl}${navigatePath}` },
    {
      type: "click",
      identity_bundle: {
        signals: [{ engine: "testid", selector: "[data-testid='go']", durability: 0.95 }],
        fingerprint: { role: "button", data_testid: "go" },
      },
    },
  ]));
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify({ inputs: [] }));
  fs.writeFileSync(path.join(dir, "recovery.json"), JSON.stringify({ steps: [] }));
}

// A Workflow-Group skill: its manifest declares group_id + required_apps, so
// server.js's resolveTargetHosts unions EVERY required app's success_url/login_url
// host into the run's lock set — not just where the skill starts.
function writeGroupSkill(skillPacksDir, workspaceId, slug, groupId, requiredAppIds, targetUrl, navigatePath) {
  const dir = path.join(skillPacksDir, workspaceId, "_default", slug, "current");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    slug, name: slug, version: "0.0.1", required_runtime: ">=0.0.0",
    company: workspaceId, target_url: targetUrl, inputs_required: [], checksum: {},
    group_id: groupId, required_apps: requiredAppIds,
  }));
  fs.writeFileSync(path.join(dir, "execution.json"), JSON.stringify([
    { type: "navigate", url: `${targetUrl}${navigatePath}` },
    {
      type: "click",
      identity_bundle: {
        signals: [{ engine: "testid", selector: "[data-testid='go']", durability: 0.95 }],
        fingerprint: { role: "button", data_testid: "go" },
      },
    },
  ]));
  fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify({ inputs: [] }));
  fs.writeFileSync(path.join(dir, "recovery.json"), JSON.stringify({ steps: [] }));
}

// Pre-seeded valid sessions for every group app — _validateGroupApp headlessly
// lands on each app's success_url (our local server: never a login path), so an
// empty storage state counts as signed-in and no interactive auth opens.
function seedGroupSessions(sessionsDir, workspaceId, appIds) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  for (const appId of appIds) {
    fs.writeFileSync(path.join(sessionsDir, `${workspaceId}__${appId}_raw_state.json`),
      JSON.stringify({ cookies: [], origins: [] }));
  }
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === "/slow") {
      setTimeout(() => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE_HTML); }, 1500);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE_HTML);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const targetUrl = `http://127.0.0.1:${server.address().port}/`;
  // Distinct HOSTNAME, same server — localhost and the loopback IP are different
  // host strings, so they stand in for two different external platforms.
  const altTargetUrl = `http://localhost:${server.address().port}/`;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-hostlock-e2e-"));
  const CONXA_DIR = path.join(tmpRoot, "install");
  const CONXA_DATA_DIR = path.join(tmpRoot, "data");
  const workspaceId = "hostlock-ws";
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");

  writeSkill(skillPacksDir, workspaceId, "skill-a", targetUrl, "slow"); // deliberately slow first step
  writeSkill(skillPacksDir, workspaceId, "skill-b", targetUrl, "");     // fast
  // Group skill starting on 127.0.0.1 whose required apps span BOTH hosts — its
  // lock set must be the UNION (127.0.0.1 + localhost), not just its start host.
  writeGroupSkill(skillPacksDir, workspaceId, "skill-g", "g1", ["app_local", "app_loopback"], targetUrl, "slow");
  // Standalone skill on localhost only: overlaps skill-g ONLY through the group's
  // second required app — the case plain start-host matching would miss.
  writeSkill(skillPacksDir, workspaceId, "skill-c", altTargetUrl, "");

  fs.writeFileSync(path.join(skillPacksDir, workspaceId, "pack.json"), JSON.stringify({
    workspace_id: workspaceId, skill_pack_version: "0.0.1", required_runtime: ">=0.0.0",
    target_url: targetUrl, protected_url: targetUrl,
    skills: ["skill-a", "skill-b", "skill-g", "skill-c"], tracking: { enabled: false },
    groups: [{
      id: "g1", name: "Deploys",
      apps: [
        { id: "app_local", name: "LocalHost App", login_url: `${altTargetUrl}login`, success_url: altTargetUrl },
        { id: "app_loopback", name: "Loopback App", login_url: `${targetUrl}login`, success_url: targetUrl },
      ],
    }],
  }));

  const sessionsDir = path.join(CONXA_DATA_DIR, "cache", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, `${workspaceId}_raw_state.json`), JSON.stringify({ cookies: [], origins: [] }));
  seedGroupSessions(sessionsDir, workspaceId, ["app_local", "app_loopback"]);

  const env = Object.assign({}, process.env, {
    PLAYWRIGHT_BROWSERS_PATH, CONXA_DIR, CONXA_DATA_DIR,
    CONXA_SKIP_SELF_UPDATE: "1",
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

    // Give the server a moment to complete its startup skill sync before firing calls, same as
    // real client usage — execute_skill itself also awaits this, but the fixture skills were
    // written to disk before the process even started so the cold-start scan already sees them.

    const callA = send("tools/call", { name: "execute_skill", arguments: { skill: "skill-a", workspace_id: workspaceId, watch: false } });
    const callB = send("tools/call", { name: "execute_skill", arguments: { skill: "skill-b", workspace_id: workspaceId, watch: false } });

    // Poll get_execution_status until we observe run B queued behind run A on the shared host —
    // this is the actual proof the two runs serialize rather than racing the same platform.
    let sawWaiting = false;
    let sawTwoActive = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && (!sawWaiting || !sawTwoActive)) {
      const status = await send("tools/call", { name: "get_execution_status", arguments: {} });
      const parsed = JSON.parse(status?.result?.content?.[0]?.text || "{}");
      const runs = parsed.active_runs || [];
      if (runs.length >= 2) sawTwoActive = true;
      if (runs.some((r) => r.waiting_for_host)) sawWaiting = true;
      if (!sawWaiting || !sawTwoActive) await new Promise((r) => setTimeout(r, 100));
    }
    check(sawTwoActive, "both runs are admitted and visible in get_execution_status concurrently");
    check(sawWaiting, "one run shows waiting_for_host while the other holds the shared platform's lock");

    const [respA, respB] = await Promise.all([callA, callB]);
    const textA = respA?.result?.content?.[0]?.text || "";
    const textB = respB?.result?.content?.[0]?.text || "";
    check(textA.startsWith("Done."), `run A completed successfully (got: ${textA.slice(0, 120)})`);
    check(textB.startsWith("Done."), `run B completed successfully (got: ${textB.slice(0, 120)})`);

    const runIdA = (textA.match(/run_id: (\S+)\)/) || [])[1];
    const runIdB = (textB.match(/run_id: (\S+)\)/) || [])[1];
    check(!!runIdA && !!runIdB && runIdA !== runIdB, "the two runs carry distinct run_ids");

    // ── Scenario 2: group-skill multi-host union (platform tags) ──────────────
    // skill-g's required apps span BOTH hosts; skill-c targets localhost only.
    // Plain start-host matching would see no overlap (skill-g starts on
    // 127.0.0.1) — the lock must fire anyway because the UNION includes the
    // localhost app. This is exactly how a "Deploy on Render then visit Vercel"
    // workflow serializes against a Vercel-only sibling.
    const callG = send("tools/call", { name: "execute_skill", arguments: { skill: "skill-g", workspace_id: workspaceId, watch: false } });
    const callC = send("tools/call", { name: "execute_skill", arguments: { skill: "skill-c", workspace_id: workspaceId, watch: false } });

    let sawWaiting2 = false;
    let sawBothAdmitted2 = false;
    const deadline2 = Date.now() + 20000;
    while (Date.now() < deadline2 && (!sawWaiting2 || !sawBothAdmitted2)) {
      const status = await send("tools/call", { name: "get_execution_status", arguments: {} });
      const parsed = JSON.parse(status?.result?.content?.[0]?.text || "{}");
      const runs = parsed.active_runs || [];
      if (runs.length >= 2) sawBothAdmitted2 = true;
      if (runs.some((r) => r.waiting_for_host)) sawWaiting2 = true;
      if (!sawWaiting2 || !sawBothAdmitted2) await new Promise((r) => setTimeout(r, 100));
    }
    check(sawBothAdmitted2, "group run and its localhost sibling are both admitted concurrently");
    check(sawWaiting2, "the localhost-only sibling waits even though the group skill STARTS on a different host");

    const [respG, respC] = await Promise.all([callG, callC]);
    const textG = respG?.result?.content?.[0]?.text || "";
    const textC = respC?.result?.content?.[0]?.text || "";
    check(textG.startsWith("Done."), `group run completed successfully (got: ${textG.slice(0, 120)})`);
    check(textC.startsWith("Done."), `localhost sibling completed successfully (got: ${textC.slice(0, 120)})`);
  } finally {
    child.kill();
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  if (failures) console.log("--- server stderr tail ---\n" + stderrBuf.split("\n").slice(-40).join("\n"));
  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
