"use strict";
// End-to-end proof of the recovery-tier CEILING through the real packed host exe + MCP.
//
// Stages a skill whose click step cannot be resolved by any zero-token tier (bad signals,
// no fallbacks), then drives it twice:
//   • CONXA_MAX_RECOVERY_TIER=2 (Build Studio) → deterministic terminal failure: text says
//     "Recovery ceiling Tier 2", and there is NO agent-recovery payload (no Tier 3/4 blocks,
//     no screenshot).
//   • CONXA_MAX_RECOVERY_TIER=4 (Claude/MCP)   → structured agent recovery: Tier 3 (semantic)
//     + Tier 4 (vision) blocks, the step_overrides protocol, and a screenshot.
//
// Usage: node gate_recovery_ceiling.js <path-to-host-exe>
//   Env: PLAYWRIGHT_BROWSERS_PATH (installed chromium) — required.
// Exit 0 = both ceilings behave correctly.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const exe = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!exe || !fs.existsSync(exe)) { console.error(`host exe not found: ${exe}`); process.exit(2); }

const FIXTURE_DIR = path.join(__dirname, "gate-skill");
const FIXTURE_URL = pathToFileURL(path.join(FIXTURE_DIR, "fixture.html")).href;
const RUNTIME_ROOT = path.join(__dirname, "..");
const APP_FILES = [
  "server.js", "sync.js", "run.js", "browser.js", "skill_loader.js", "tracker.js",
  "install_identity.js", "bootstrap.js", "recovery.js", "resolve_adapter.js",
  "resolver.js", "auth_manager.js",
];

// A skill that navigates to the fixture (succeeds) then tries to click an element that does
// not exist and carries no fallback identity — so the zero-token cascade is genuinely exhausted.
const BROKEN_EXECUTION = [
  { type: "navigate", url: "{{fixture_url}}" },
  {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "css", selector: "[data-testid=\"phantom-xyz\"]", durability: 0.95 }],
      fingerprint: { role: "button", aria_label: "Phantom Button XYZ", inner_text: "Phantom Button XYZ", data_testid: "phantom-xyz" },
      stable_hash: "", frame_chain: [],
    },
  },
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function stageEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-ceil-"));
  const conxaDir = path.join(tmp, ".conxa");
  const dataDir = path.join(tmp, "data");
  const sessionsDir = path.join(dataDir, "cache", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  copyDir(path.join(FIXTURE_DIR, "skill-pack"), path.join(conxaDir, "skill-packs"));
  // Overwrite with the broken execution plan.
  fs.writeFileSync(
    path.join(conxaDir, "skill-packs", "gate", "gate-skill", "execution.json"),
    JSON.stringify(BROKEN_EXECUTION, null, 2));
  fs.writeFileSync(path.join(sessionsDir, "gate_raw_state.json"), JSON.stringify({ cookies: [], origins: [] }));
  const appDest = path.join(conxaDir, "conxa-app");
  fs.mkdirSync(appDest, { recursive: true });
  for (const f of APP_FILES) fs.copyFileSync(path.join(RUNTIME_ROOT, f), path.join(appDest, f));
  fs.writeFileSync(path.join(appDest, "version.json"),
    JSON.stringify({ app_version: "app-vGATE", min_host: "host-v1.0.0", files: {} }));
  return { tmp, conxaDir, dataDir };
}

function runOnce(ceiling) {
  const { tmp, conxaDir, dataDir } = stageEnv();
  return new Promise((resolve) => {
    const child = spawn(exe, [], {
      cwd: conxaDir,
      env: { ...process.env, CONXA_DIR: conxaDir, CONXA_DATA_DIR: dataDir,
        CONXA_SKIP_SELF_UPDATE: "1", CONXA_MAX_RECOVERY_TIER: String(ceiling) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "", stderrTail = [];
    const pending = new Map();
    let nextId = 1;
    child.stderr.on("data", d => { stderrTail.push(d.toString()); if (stderrTail.length > 40) stderrTail = stderrTail.slice(-40); });
    child.stdout.on("data", d => {
      buf += d.toString(); let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      }
    });
    const send = (method, params) => {
      const id = nextId++;
      const p = new Promise((res, rej) => {
        pending.set(id, res);
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`timeout: ${method}`)); } }, 180000);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      return p;
    };
    (async () => {
      try {
        await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ceil", version: "1" } });
        const resp = await send("tools/call", { name: "execute_skill",
          arguments: { skill: "gate-skill", company: "gate", inputs: { fixture_url: FIXTURE_URL }, watch: false } });
        const content = (resp.result && resp.result.content) || [];
        const text = content.filter(c => c && c.type === "text").map(c => c.text).join("\n");
        const hasImage = content.some(c => c && c.type === "image");
        resolve({ text, hasImage, stderr: stderrTail.join("") });
      } catch (e) {
        resolve({ text: "", hasImage: false, error: e.message, stderr: stderrTail.join("") });
      } finally {
        try { child.kill(); } catch (_) {}
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
      }
    })();
  });
}

(async () => {
  let fails = 0;
  const assert = (cond, label, ctx) => { if (cond) { console.log(`ok - ${label}`); } else { fails++; console.log(`not ok - ${label}`); if (ctx) console.log("   " + ctx.slice(0, 400)); } };

  console.log("# ceiling 2 (Build Studio — deterministic, no agent recovery)");
  const t2 = await runOnce(2);
  assert(/Recovery ceiling Tier 2/.test(t2.text), "T2: response states the Tier 2 ceiling", t2.text || t2.stderr);
  assert(!/Tier 3 \(semantic\)/.test(t2.text), "T2: no Tier 3 semantic block", t2.text);
  assert(!t2.hasImage, "T2: no screenshot / vision payload", t2.text);
  assert(!/step_overrides/.test(t2.text), "T2: no agent override protocol offered", t2.text);

  console.log("# ceiling 4 (Claude/MCP — structured Tier 3 + Tier 4 recovery)");
  const t4 = await runOnce(4);
  assert(/Tier 3 \(semantic\)/.test(t4.text), "T4: includes Tier 3 semantic block", t4.text || t4.stderr);
  assert(/Tier 4 \(vision\)/.test(t4.text), "T4: includes Tier 4 vision block", t4.text);
  assert(/step_overrides/.test(t4.text), "T4: offers the step_overrides closing-edge protocol", t4.text);
  assert(t4.hasImage, "T4: includes a screenshot for vision recovery", t4.text);

  console.log(`# pass ${10 - fails}\n# fail ${fails}`);
  process.exit(fails ? 1 : 0);
})();
