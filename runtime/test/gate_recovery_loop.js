"use strict";
// End-to-end proof of the COMPLETE self-healing loop through the real exe + MCP, with the
// agent role scripted (exactly the protocol Claude follows):
//   execute_skill (broken step) → runtime returns Tier 3/4 recovery request → "agent" reads the
//   DOM inventory, picks the correct selector → execute_skill resume_from + step_overrides →
//   the step heals and the run reaches "Done."
//
// Usage: node gate_recovery_loop.js <path-to-host-exe>   (env PLAYWRIGHT_BROWSERS_PATH required)

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

// Click step whose recorded identity matches NOTHING on the live page (wrong testid, wrong
// accessible name, no fallbacks) — so Tier 1 AND Tier 2 are genuinely exhausted. The actual
// actionable element (data-testid=gate-btn) still exists, so a recovering agent reading the DOM
// inventory can identify and select it. This is the case that only Tier 3/4 can heal.
const BROKEN_EXECUTION = [
  { type: "navigate", url: "{{fixture_url}}" },
  {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "css", selector: "[data-testid=\"phantom-xyz\"]", durability: 0.95 }],
      fingerprint: { role: "button", aria_label: "Submit Order Now", inner_text: "Submit Order Now", data_testid: "phantom-xyz" },
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-loop-"));
const conxaDir = path.join(tmp, ".conxa");
const dataDir = path.join(tmp, "data");
const sessionsDir = path.join(dataDir, "cache", "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
copyDir(path.join(FIXTURE_DIR, "skill-pack"), path.join(conxaDir, "skill-packs"));
fs.writeFileSync(path.join(conxaDir, "skill-packs", "gate", "gate-skill", "execution.json"),
  JSON.stringify(BROKEN_EXECUTION, null, 2));
fs.writeFileSync(path.join(sessionsDir, "gate_raw_state.json"), JSON.stringify({ cookies: [], origins: [] }));
const appDest = path.join(conxaDir, "conxa-app");
fs.mkdirSync(appDest, { recursive: true });
for (const f of APP_FILES) fs.copyFileSync(path.join(RUNTIME_ROOT, f), path.join(appDest, f));
fs.writeFileSync(path.join(appDest, "version.json"),
  JSON.stringify({ app_version: "app-vGATE", min_host: "host-v1.0.0", files: {} }));

const child = spawn(exe, [], {
  cwd: conxaDir,
  env: { ...process.env, CONXA_DIR: conxaDir, CONXA_DATA_DIR: dataDir,
    CONXA_SKIP_SELF_UPDATE: "1", CONXA_MAX_RECOVERY_TIER: "4" },
  stdio: ["pipe", "pipe", "pipe"],
});
let buf = "", stderrTail = [];
const pending = new Map();
let nextId = 1;
child.stderr.on("data", d => { stderrTail.push(d.toString()); if (stderrTail.length > 60) stderrTail = stderrTail.slice(-60); });
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
function done(code, msg) {
  if (msg) console.log(msg);
  if (code && stderrTail.length) console.log("runtime stderr tail:\n" + stderrTail.slice(-20).join(""));
  try { child.kill(); } catch (_) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(code);
}

// The "agent": from a Tier 3 recovery request, read the live DOM inventory and choose the
// selector for the element matching the failed step's intent.
function agentPickSelector(text) {
  const m = text.match(/Interactive elements now on the page \(\d+\):\s*(\[[\s\S]*?\])/);
  if (!m) return null;
  let els; try { els = JSON.parse(m[1]); } catch (_) { return null; }
  // The agent identifies the actionable element from the inventory. Here the page has one
  // obvious interactive control; prefer a stable test id, then id, then text.
  const hit = els.find(e => e["data-testid"]) || els.find(e => e.id) || els[0];
  if (!hit) return null;
  if (hit["data-testid"]) return `[data-testid="${hit["data-testid"]}"]`;
  if (hit.id) return `#${hit.id}`;
  return `text=${JSON.stringify(hit.text)}`;
}

(async () => {
  try {
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "loop", version: "1" } });

    // 1. Initial run — the broken step fails and the runtime returns a recovery request.
    const r1 = await send("tools/call", { name: "execute_skill",
      arguments: { skill: "gate-skill", company: "gate", inputs: { fixture_url: FIXTURE_URL }, watch: false } });
    const text1 = ((r1.result && r1.result.content) || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    if (/^Done\./m.test(text1)) return done(1, "not ok - step unexpectedly succeeded; broken fixture did not fail");
    if (!/Tier 3 \(semantic\)/.test(text1)) return done(1, `not ok - no Tier 3 recovery request:\n${text1.slice(0, 500)}`);
    console.log("ok - initial run failed and returned a Tier 3/4 recovery request");

    // 2. Agent picks the corrected selector from the recovery request.
    const selector = agentPickSelector(text1);
    if (!selector) return done(1, `not ok - agent could not derive a selector from the inventory:\n${text1.slice(0, 600)}`);
    console.log(`ok - agent derived corrected selector: ${selector}`);

    // 3. Resume with the override — the closing edge. Must heal and reach "Done."
    const r2 = await send("tools/call", { name: "execute_skill",
      arguments: { skill: "gate-skill", company: "gate", inputs: { fixture_url: FIXTURE_URL },
        resume_from: 1, step_overrides: { "1": { selector } }, watch: false } });
    const text2 = ((r2.result && r2.result.content) || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    if (/^Done\./m.test(text2)) {
      console.log("ok - resume with agent override healed the step and reached 'Done.'");
      return done(0, "# COMPLETE LOOP VERIFIED: Claude → Runtime → Browser → Recovery → Success");
    }
    return done(1, `not ok - resume did NOT reach 'Done.':\n${text2.slice(0, 700)}`);
  } catch (e) {
    return done(1, `not ok - ${e.message}`);
  }
})();
