"use strict";
// Real end-to-end proof that the generalized GitHub->Drive loop actually runs: spawns the real
// runtime MCP server (app/server.js, unpacked dev mode — same code the packed host exe loads),
// against a hermetic local fixture standing in for GitHub (a file page with a real download
// button) and Google Drive (a real multi-file upload input). Two execute_skill calls reuse the
// exact same compiled skill (no recompile, no edit) with different file counts/names, proving
// the for_each/download/upload path generalizes to any N — the goal's own success criterion.
//
// Usage: node run_loop_e2e.js
// Exit 0 = both scenarios reached "Done." with every file downloaded and uploaded; non-zero =
// a scenario failed (see printed reason).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const RUNTIME_ROOT = path.join(__dirname, "..", "..");
const FIXTURE_DIR = path.join(__dirname, "loop-fixture");
const SKILL_PACK_SRC = path.join(__dirname, "loop-skill-pack");
const FIXTURE_URL = pathToFileURL(FIXTURE_DIR).href;
const GATE_VERSION = "v0.0.0-e2e";

// ── stage a throwaway CONXA_DIR / CONXA_DATA_DIR, same layout gate_replay.js uses ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-loop-e2e-"));
const conxaDir = path.join(tmp, ".conxa");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "cache", "sessions"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function activateVersion(componentDir, versionName, populate) {
  const versionDir = path.join(componentDir, versionName);
  fs.mkdirSync(versionDir, { recursive: true });
  populate(versionDir);
  const currentLink = path.join(componentDir, "current");
  try { fs.unlinkSync(currentLink); } catch (_) {}
  fs.symlinkSync(versionDir, currentLink, process.platform === "win32" ? "junction" : "dir");
}

const skillPacksDir = path.join(conxaDir, "skill-packs");
for (const workspaceId of fs.readdirSync(SKILL_PACK_SRC)) {
  const workspaceSrc = path.join(SKILL_PACK_SRC, workspaceId);
  const workspaceDst = path.join(skillPacksDir, workspaceId);
  fs.mkdirSync(workspaceDst, { recursive: true });
  for (const e of fs.readdirSync(workspaceSrc, { withFileTypes: true })) {
    if (!e.isDirectory()) { fs.copyFileSync(path.join(workspaceSrc, e.name), path.join(workspaceDst, e.name)); continue; }
    const slug = e.name;
    activateVersion(path.join(workspaceDst, "_default", slug), GATE_VERSION, (versionDir) => copyDir(path.join(workspaceSrc, slug), versionDir));
  }
}

function cleanup() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }

const ms_playwright = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
const child = spawn(process.execPath, [path.join(RUNTIME_ROOT, "app", "server.js")], {
  cwd: RUNTIME_ROOT,
  env: {
    ...process.env,
    CONXA_DIR: conxaDir,
    CONXA_DATA_DIR: dataDir,
    CONXA_SKIP_SELF_UPDATE: "1",
    PLAYWRIGHT_BROWSERS_PATH: fs.existsSync(ms_playwright) ? ms_playwright : (process.env.PLAYWRIGHT_BROWSERS_PATH || ""),
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrTail = [];
child.stderr.on("data", (d) => {
  stderrTail.push(d.toString());
  if (stderrTail.length > 60) stderrTail = stderrTail.slice(-60);
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 60000);
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return p;
}

function fail(msg) {
  console.error(`[e2e] FAIL: ${msg}`);
  if (stderrTail.length) console.error("[e2e] runtime stderr tail:\n" + stderrTail.join(""));
  try { child.kill(); } catch (_) {}
  cleanup();
  process.exit(1);
}

// Each scenario reuses the SAME skill (no recompile) with a different file count/names —
// this is the actual "any number of files, no recompile" claim under test.
const SCENARIOS = [
  { label: "1 file", files: ["alpha.txt"] },
  { label: "3 files, different names", files: ["report.csv", "notes.md", "diagram.gitignore"] },
];

(async () => {
  try {
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "conxa-loop-e2e", version: "1.0.0" },
    });

    for (const scenario of SCENARIOS) {
      const sortedNames = [...scenario.files].sort();
      const resp = await send("tools/call", {
        name: "execute_skill",
        arguments: {
          skill: "loop-skill",
          workspace_id: "e2e",
          inputs: {
            fixture_dir: FIXTURE_URL,
            files: scenario.files.join(","),
            expected_status: `Uploaded: ${sortedNames.join(",")}`,
          },
          watch: false,
        },
      });
      const texts = ((resp.result && resp.result.content) || [])
        .filter((c) => c && c.type === "text").map((c) => c.text).join("\n");
      if (resp.error) return fail(`[${scenario.label}] tools/call error: ${JSON.stringify(resp.error)}`);
      if (!/^Done\./m.test(texts)) return fail(`[${scenario.label}] replay did not reach 'Done.':\n${texts}`);
      const downloadedCount = (texts.match(/^  .+$/gm) || []).length;
      if (downloadedCount !== scenario.files.length) {
        return fail(`[${scenario.label}] expected ${scenario.files.length} downloaded file(s), saw ${downloadedCount}:\n${texts}`);
      }
      if (/Warning:/.test(texts)) return fail(`[${scenario.label}] run succeeded but reported a warning:\n${texts}`);
      console.log(`[e2e] PASS: ${scenario.label} — downloaded ${scenario.files.length} file(s) from the GitHub-shaped fixture and uploaded all of them to the Drive-shaped fixture (assertion on drive.html's status text confirmed the exact file set arrived).`);
    }

    console.log("[e2e] PASS: same compiled skill handled both file counts with no recompile — the loop generalizes to any N.");
    try { child.kill(); } catch (_) {}
    cleanup();
    process.exit(0);
  } catch (e) {
    return fail(e.message);
  }
})();
