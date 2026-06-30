#!/usr/bin/env node
"use strict";
const path   = require("path");
const fs     = require("fs");
const os     = require("os");
const https  = require("https");
const semver = (global.__hostRequire || require)("semver");
const { loadInstallId } = require("./install_identity");

// ─── 1. Resolve CONXA_DIR (install, read-only) and CONXA_DATA_DIR (user-writable) ─
const CONXA_DIR = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");
const CONXA_DATA_DIR = process.env.CONXA_DATA_DIR || (
  process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming", "Conxa")
    : path.join(os.homedir(), ".conxa")
);

const SKILL_PACKS_DIR = path.join(CONXA_DIR, "skill-packs");
const CACHE_DIR       = path.join(CONXA_DATA_DIR, "cache");
const SESSIONS_DIR    = path.join(CACHE_DIR, "sessions");
const LOG_FILE        = path.join(CONXA_DATA_DIR, "logs", "runtime.log");
const RUNTIME_VERSION = global.__runtimeVersion || require("./package.json").version;
const INSTALL_ID      = loadInstallId(CONXA_DATA_DIR);

// ─── Recovery tier ceiling ────────────────────────────────────────────────────
// The zero-token cascade (Tier 1 deterministic ladder + Tier 2 a11y/fallback) always
// runs inside run.js. Tiers 3 (LLM semantic) and 4 (vision) are agent-mediated: when the
// in-process cascade is exhausted the runtime hands a structured recovery request back to
// the MCP client (Claude), which reasons over the live DOM / screenshot and resumes with a
// corrected selector via `step_overrides`. That handoff only makes sense when an agent is
// actually in the loop.
//   • Claude / MCP execution  → ceiling 4 (default): all four tiers enabled.
//   • Build Studio sandbox test → ceiling 2 (CONXA_MAX_RECOVERY_TIER=2): deterministic,
//     no agent handoff — a step that survives T1/T2 fails honestly so the compiled pack is
//     tested on its own merits.
const { clampRecoveryTier } = require("./recovery");
const MAX_RECOVERY_TIER = clampRecoveryTier(process.env.CONXA_MAX_RECOVERY_TIER, 4);
// Agent-mediated recovery (T3 semantic + T4 vision) is available only above the T2 ceiling.
const AGENT_RECOVERY_ENABLED = MAX_RECOVERY_TIER >= 3;

// ─── Execution wall-clock budget ──────────────────────────────────────────────
// The MCP client (Claude Desktop) abandons a tools/call after its own request timeout (~240s
// observed: it sends notifications/cancelled at exactly +4 min) and then shows the user
// "No result received". Honouring that cancel (above) stops a zombie run, but the SDK drops the
// response to an already-cancelled request, so the user still sees a 4-minute hang whenever a
// single execution out-runs the client budget — e.g. a step whose target never renders (bad
// input / empty search) burns minutes accumulating bounded recovery stages before failing.
// The cure is to never let an execution reach the client's deadline: we cap total wall-clock a
// safe margin below it, abort through the same cancelCheck path, and return an actionable failure
// the client still receives. Default 210s leaves ~30s for teardown + response transport under the
// 240s client timeout. Build Studio's fast successful runs never approach this.
const EXECUTION_DEADLINE_MS = Number(process.env.CONXA_EXECUTION_DEADLINE_MS) || 210000;

// ─── Parked recovery page (Tier 3/4 cross-call self-healing) ──────────────────
// Agent-mediated recovery is inherently cross-call: the runtime fails a step → returns a
// recovery request to Claude → Claude resumes with a corrected selector. If the failed page
// were torn down, the resume would begin on a blank page and `resume_from` would skip the
// navigation that established state — so the agent's *correct* selector would act on the WRONG
// (blank) page and fail again. We instead PARK the live failed page (browser+context+page) and
// resume the override on it, so recovery operates on the exact DOM the agent reasoned about. A
// TTL closes the park if the agent never resumes, so a browser is never leaked.
const PARK_TTL_MS = Number(process.env.CONXA_RECOVERY_PARK_TTL_MS) || 180000;
let _parkedRecovery = null;

async function _discardPark(reason) {
  const park = _parkedRecovery;
  _parkedRecovery = null;
  if (!park) return;
  clearTimeout(park.timer);
  log("info", "recovery_park_discarded", { slug: park.slug, reason });
  try { await park.page.close(); } catch (_) {}
  // Headless browsers are owned by browser.js's per-company cache (idle-closed there). A watch
  // (visible) browser is not cached, so close it here.
  if (park.watch) {
    try { await park.context.close(); } catch (_) {}
    try { await park.browser.close(); } catch (_) {}
  }
}

// ─── 2. Playwright browser path (MUST precede any playwright require) ─────────
// Respect a caller-supplied PLAYWRIGHT_BROWSERS_PATH (e.g. dev mode where CONXA_DIR
// points to a data dir that has no chromium/ subfolder).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const primaryChromium = path.join(CONXA_DIR, "chromium");
  // The NSIS installer historically places Chromium under AppData\Local\Conxa\chromium
  // (independent of CONXA_DIR).  Fall back to that location on Windows when the
  // primary path doesn't exist — avoids "Executable doesn't exist" on existing installs.
  const winInstallerChromium = process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Local", "Conxa", "chromium")
    : null;
  process.env.PLAYWRIGHT_BROWSERS_PATH =
    (winInstallerChromium && !fs.existsSync(primaryChromium) && fs.existsSync(winInstallerChromium))
      ? winInstallerChromium
      : primaryChromium;
}
// Pass both dirs to browser.js
process.env.CONXA_DIR      = CONXA_DIR;
process.env.CONXA_DATA_DIR = CONXA_DATA_DIR;

// ─── 3. Handle CLI flags (--install-playwright, --handle-auth-callback, etc.) ──
const [,, ...cliArgs] = process.argv;
// Fast selfcheck used by the update bat script to verify the new runtime boots cleanly.
if (cliArgs.includes("--selfcheck")) {
  process.exit(0);
}

// ─── 2b. Chromium revision preflight ──────────────────────────────────────────
// If a .revision marker exists but the corresponding chromium-<rev> directory is
// missing (e.g. a second installer brought a new runtime.exe with a different
// Playwright, but the installer skip-guard left the old revision on disk), spawn
// --install-playwright in the background to self-heal before the first skill run.
// Skip this check when we're already running --install-playwright to avoid
// spawning a duplicate install process.
if (!cliArgs.includes("--install-playwright")) {
  const _chromiumBase = path.join(CONXA_DIR, "chromium");
  const _revFile = path.join(_chromiumBase, ".revision");
  if (fs.existsSync(_revFile)) {
    const _expectedRev = fs.readFileSync(_revFile, "utf8").trim();
    if (_expectedRev && !fs.existsSync(path.join(_chromiumBase, _expectedRev))) {
      const { spawn } = require("child_process");
      const _child = spawn(process.execPath, ["--install-playwright"], {
        env: { ...process.env, CONXA_DIR, PLAYWRIGHT_BROWSERS_PATH: _chromiumBase },
        stdio: "ignore",
        detached: true,
      });
      _child.unref();
      process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: "warn",
        msg: "chromium_revision_mismatch", expected: _expectedRev, action: "reinstalling_background" }) + "\n");
    }
  }
}

if (cliArgs.includes("--install-playwright")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(CONXA_DIR, "chromium");

  // NSIS's ExecWait needs a real exit code; don't let a silent hang block
  // the installer UI forever.
  const PW_ERROR_FILE = path.join(CONXA_DIR, "playwright-install-error.txt");

  function writeInstallError(msg) {
    try { fs.writeFileSync(PW_ERROR_FILE, msg + "\n"); } catch (_) {}
  }

  const timeoutHandle = setTimeout(() => {
    const msg = "playwright install timed out (10-minute limit exceeded)";
    process.stderr.write(msg + "\n");
    writeInstallError(msg);
    process.exit(1);
  }, 10 * 60 * 1000);
  timeoutHandle.unref();

  try {
    // playwright-core lives in the pkg snapshot, not on disk — use __hostRequire so
    // this works when server.js is loaded from the conxa-app/ directory on disk.
    const _req = global.__hostRequire || require;
    const { program } = _req("playwright-core/lib/cli/program");

    // --with-deps is Linux-only (apt); this pipeline only ships Windows/.exe.
    program.parseAsync(["node", "cli", "install", "chromium"])
      .then(() => {
        clearTimeout(timeoutHandle);
        // Write a .revision marker so startup preflight can detect stale revisions.
        try {
          const chromiumBase = path.join(CONXA_DIR, "chromium");
          const revDirs = fs.readdirSync(chromiumBase).filter(d => d.startsWith("chromium-"));
          if (revDirs.length > 0)
            fs.writeFileSync(path.join(chromiumBase, ".revision"), revDirs[0]);
        } catch (_) {}
        process.exit(0);
      })
      .catch((e) => {
        clearTimeout(timeoutHandle);
        const msg = e?.message || String(e);
        process.stderr.write("playwright install failed: " + msg + "\n");
        writeInstallError(msg);
        process.exit(1);
      });
  } catch (e) {
    clearTimeout(timeoutHandle);
    const msg = e?.message || String(e);
    process.stderr.write("playwright install init failed: " + msg + "\n");
    writeInstallError(msg);
    process.exit(1);
  }
  return; // don't fall through into logger / MCP server setup while install is pending
}

// ─── 4. Logger ────────────────────────────────────────────────────────────────
function log(level, msg, extra = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n";
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 10 * 1024 * 1024)
      fs.renameSync(LOG_FILE, LOG_FILE + ".1");
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
  process.stderr.write(line);
}

log("info", "runtime_bootstrap", {
  version: RUNTIME_VERSION,
  conxa_dir: CONXA_DIR,
  conxa_data_dir: CONXA_DATA_DIR,
  skill_packs_dir: SKILL_PACKS_DIR,
  cache_dir: CACHE_DIR,
  log_file: LOG_FILE,
});

process.on("uncaughtException",  (e) => log("error", "uncaught", { error: e.message, stack: e.stack }));
process.on("unhandledRejection", (r) => log("error", "unhandled_rejection", { reason: String(r) }));

// ─── 5. Lazy requires (after env setup) ──────────────────────────────────────
let Server;
let StdioServerTransport;
let CallToolRequestSchema;
let ListToolsRequestSchema;
let skillLoader;
let sync;
let authManager;
let runPlan;
let enrichStepsWithRecovery;
let applyStepOverrides;
let appendRecoveryEvent;
let clearRetryBudget;
let checkRetryBudget;
let isAuthFailure;
let getCachedBrowser;
let captureReAuth;
let gracefulShutdown;
let createTracker;
let mapErrorToCode;

try {
  ({ Server }               = (global.__hostRequire || require)("@modelcontextprotocol/sdk/server/index.js"));
  ({ StdioServerTransport } = (global.__hostRequire || require)("@modelcontextprotocol/sdk/server/stdio.js"));
  ({ CallToolRequestSchema, ListToolsRequestSchema } = (global.__hostRequire || require)("@modelcontextprotocol/sdk/types.js"));

  skillLoader  = require("./skill_loader");
  sync         = require("./sync");
  authManager  = require("./auth_manager");
  ({ runPlan, enrichStepsWithRecovery, applyStepOverrides, appendRecoveryEvent, clearRetryBudget, checkRetryBudget, isAuthFailure } = require("./run"));
  ({ getCachedBrowser, captureReAuth, gracefulShutdown } = require("./browser"));
  ({ createTracker, mapErrorToCode } = require("./tracker"));
} catch (e) {
  log("error", "runtime_bootstrap_failed", { error: e.message, stack: e.stack });
  process.exit(1);
}

// ─── 6. Execution state (single lock per process) ─────────────────────────────
let activeExecution = null;

// Tracks whether the cold-start sync is complete so execute_skill can gate on it.
const syncState = {
  startedAt:  Date.now(),
  complete:   false,
  skillsDone: false,
  appDone:    false,
};

// ─── 7. Skill index ───────────────────────────────────────────────────────────
let skillIndex = {};
try {
  skillIndex = skillLoader.loadSkillRegistryFromCache(SKILL_PACKS_DIR, CACHE_DIR);
  log("info", "skill_index_loaded", { count: Object.keys(skillIndex).length });
} catch (e) {
  log("warn", "skill_index_load_failed", { error: e.message });
}

// ─── 8. MCP server ────────────────────────────────────────────────────────────
const server = new Server(
  { name: "conxa", version: RUNTIME_VERSION },
  { capabilities: { tools: { listChanged: true } } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: _toolDefinitions() }));

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  const { name, arguments: args } = req.params;
  log("info", "tool_call", { tool: name });
  try {
    return await _handleTool(name, args || {}, extra);
  } catch (e) {
    log("error", "tool_error", { tool: name, error: e.message });
    return { content: [{ type: "text", text: `Internal error: ${e.message}` }] };
  }
});

// ─── 9. Runtime self-update (Phase 6) ────────────────────────────────────────
// On cold start: if a pending update is ready, apply it via update.bat and exit
// so the next invocation picks up the new binary. Otherwise, check the cloud
// manifest and download in the background (applied on the next cold start).
const CONXA_API = process.env.CONXA_API_URL || "https://apis.conxa.in";
const RUNTIME_UPDATE_CACHE   = path.join(CACHE_DIR, "conxa-runtime-update-cache.json");
const RUNTIME_UPDATE_PENDING = path.join(CACHE_DIR, "conxa-runtime-update-pending.json");

function _compareVersions(a, b) {
  // semver.coerce strips any non-numeric prefix ("runtime-v1.0.0" → "1.0.0"),
  // fixing the default cloud manifest format which doubles as a GitHub release tag.
  const pa = semver.coerce(String(a));
  const pb = semver.coerce(String(b));
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return semver.compare(pa, pb);
}

async function _applyPendingUpdate() {
  if (!fs.existsSync(RUNTIME_UPDATE_PENDING)) return false;
  let pending;
  try { pending = JSON.parse(fs.readFileSync(RUNTIME_UPDATE_PENDING, "utf8")); } catch (_) { return false; }
  if (!pending.ready) return false;
  const nextExe = path.join(CONXA_DIR, "conxa-runtime.exe.next");
  if (!fs.existsSync(nextExe)) return false;

  // Write update.bat with a random suffix to avoid predictable path attacks.
  const suffix = Math.random().toString(36).slice(2);
  const batPath = path.join(os.tmpdir(), `conxa-update-${suffix}.bat`);
  const runtimeExe = path.join(CONXA_DIR, "conxa-runtime.exe");
  const keytarNext    = path.join(CONXA_DIR, "keytar.node.next");
  const keytarCurrent = path.join(CONXA_DIR, "keytar.node");
  const batContent = [
    "@echo off",
    "timeout /t 3 /nobreak >nul",
    // Back up old exe before overwriting so we can roll back if new one crashes.
    `copy /Y "${runtimeExe}" "${runtimeExe}.bak" >nul`,
    `move /Y "${nextExe}" "${runtimeExe}"`,
    `if exist "${keytarNext}" move /Y "${keytarNext}" "${keytarCurrent}"`,
    // Verify new runtime boots cleanly. On failure restore backup and abort.
    `"${runtimeExe}" --selfcheck`,
    `if %errorlevel% neq 0 (`,
    `  copy /Y "${runtimeExe}.bak" "${runtimeExe}" >nul`,
    `  del "${runtimeExe}.bak"`,
    `  del "${batPath}"`,
    `  exit /B 1`,
    `)`,
    `del "${runtimeExe}.bak"`,
    // Re-run Playwright browser install so Chromium revision matches the new exe.
    // Idempotent: no-op if the revision is already present on disk.
    `"${runtimeExe}" --install-playwright`,
    `del "${batPath}"`,
  ].join("\r\n");
  fs.writeFileSync(batPath, batContent);
  const { spawn } = require("child_process");
  spawn("cmd.exe", ["/C", batPath], { detached: true, stdio: "ignore" }).unref();
  log("info", "[runtime:update-pending] applying update → restart", { version: pending.version });
  return true;
}

async function _checkHostUpdate() {
  if (process.env.CONXA_SKIP_SELF_UPDATE === "1") return;
  if (fs.existsSync(RUNTIME_UPDATE_PENDING)) return; // already downloaded, wait for next cold start

  let manifest = null;
  // Try local cache first (valid for 24h)
  if (fs.existsSync(RUNTIME_UPDATE_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(RUNTIME_UPDATE_CACHE, "utf8"));
      if (cached._cached_at && Date.now() - cached._cached_at < 24 * 60 * 60 * 1000) {
        manifest = cached;
      }
    } catch (_) {}
  }

  if (!manifest) {
    try {
      manifest = await new Promise((resolve, reject) => {
        const req = https.get(`${CONXA_API}/api/v1/updates/conxa-runtime-manifest`, (res) => {
          let data = "";
          res.on("data", (c) => { data += c; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              parsed._cached_at = Date.now();
              fs.mkdirSync(path.dirname(RUNTIME_UPDATE_CACHE), { recursive: true });
              fs.writeFileSync(RUNTIME_UPDATE_CACHE, JSON.stringify(parsed));
              resolve(parsed);
            } catch (e) { reject(e); }
          });
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
        req.on("error", reject);
      });
    } catch (_) {
      return; // network unavailable — skip silently
    }
  }

  if (!manifest || !manifest.host_version) return;
  if (_compareVersions(manifest.host_version, RUNTIME_VERSION) <= 0) return;

  // Newer version available — download in background
  log("info", `[runtime:update-pending] v${RUNTIME_VERSION}→${manifest.host_version} downloading`);
  const nextExe = path.join(CONXA_DIR, "conxa-runtime.exe.next");
  try {
    const buf = await new Promise((resolve, reject) => {
      const req = https.get(manifest.url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.setTimeout(120_000, () => { req.destroy(); reject(new Error("download timeout")); });
      req.on("error", reject);
    });
    // SHA-256 verify — skip update and keep current version if server omits the hash
    if (!manifest.sha256) {
      log("warn", "runtime_update_skipped", { reason: "manifest missing sha256 — keeping current version" });
      return;
    }
    const { createHash } = require("crypto");
    const actual = createHash("sha256").update(buf).digest("hex");
    if (actual.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error(`SHA-256 mismatch: expected ${manifest.sha256} got ${actual}`);
    }
    fs.mkdirSync(path.dirname(nextExe), { recursive: true });
    fs.writeFileSync(nextExe, buf);

    // Download keytar.node.next alongside the exe — must match the new Node ABI.
    let hasKeytar = false;
    if (manifest.keytar_url) {
      try {
        const keytarBuf = await new Promise((resolve, reject) => {
          const req = https.get(manifest.keytar_url, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          });
          req.setTimeout(60_000, () => { req.destroy(); reject(new Error("keytar download timeout")); });
          req.on("error", reject);
        });
        if (manifest.keytar_sha256) {
          const { createHash } = require("crypto");
          const actual = createHash("sha256").update(keytarBuf).digest("hex");
          if (actual.toLowerCase() !== manifest.keytar_sha256.toLowerCase())
            throw new Error(`keytar SHA-256 mismatch: expected ${manifest.keytar_sha256} got ${actual}`);
        }
        fs.writeFileSync(path.join(CONXA_DIR, "keytar.node.next"), keytarBuf);
        hasKeytar = true;
      } catch (e) {
        log("warn", "keytar_update_download_failed", { reason: e.message });
        // Non-fatal: old keytar stays in place; token storage still works unless Node ABI changed.
      }
    }

    fs.writeFileSync(RUNTIME_UPDATE_PENDING, JSON.stringify({ version: manifest.host_version, ready: true, has_keytar: hasKeytar }));
    log("info", `[runtime:update-pending] v${RUNTIME_VERSION}→${manifest.host_version} ready (keytar=${hasKeytar})`);
  } catch (e) {
    log("warn", "runtime_update_download_failed", { reason: e.message });
  }
}

function _isValidAppDir(dir) {
  try {
    if (!fs.existsSync(path.join(dir, "server.js"))) return false;
    JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"));
    return true;
  } catch (_) { return false; }
}

async function _checkAppUpdate() {
  if (process.env.CONXA_SKIP_SELF_UPDATE === "1") return;

  const appDir      = path.join(CONXA_DIR, "conxa-app");
  const cacheFile   = path.join(CACHE_DIR, "conxa-app-update-cache.json");
  const versionFile = path.join(appDir, "version.json");

  let localVersion = "none";
  try { localVersion = JSON.parse(fs.readFileSync(versionFile, "utf8")).app_version || "none"; } catch (_) {}

  // Cache manifest for 1h
  let manifest = null;
  if (fs.existsSync(cacheFile)) {
    try {
      const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (Date.now() - c._cached_at < 60 * 60 * 1000) manifest = c;
    } catch (_) {}
  }

  if (!manifest) {
    try {
      manifest = await new Promise((resolve, reject) => {
        const req = https.get(`${CONXA_API}/api/v1/updates/conxa-app-manifest`, (res) => {
          let d = "";
          res.on("data", c => { d += c; });
          res.on("end", () => {
            try {
              const p = JSON.parse(d);
              p._cached_at = Date.now();
              fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
              fs.writeFileSync(cacheFile, JSON.stringify(p));
              resolve(p);
            } catch (e) { reject(e); }
          });
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
        req.on("error", reject);
      });
    } catch (_) {
      return; // network unavailable — skip silently
    }
  }

  if (!manifest || !manifest.bundle_url) return;
  if (manifest.app_version === localVersion) return; // already up to date

  // min_host guard: skip if the new app layer needs a host newer than what's running.
  if (manifest.min_host && _compareVersions(manifest.min_host, RUNTIME_VERSION) > 0) {
    log("warn", "[app:update] new app layer requires a newer host — skipping until host updates", {
      min_host: manifest.min_host, host_version: RUNTIME_VERSION,
    });
    return;
  }

  log("info", `[app:update] ${localVersion}→${manifest.app_version} downloading`);

  const buf = await new Promise((resolve, reject) => {
    const req = https.get(manifest.bundle_url, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error("download timeout")); });
    req.on("error", reject);
  });

  // Skip update and keep current app layer if server omits the hash
  if (!manifest.bundle_sha256) {
    log("warn", "app_update_skipped", { reason: "manifest missing bundle_sha256 — keeping current version" });
    return;
  }
  const { createHash } = require("crypto");
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual.toLowerCase() !== manifest.bundle_sha256.toLowerCase())
    throw new Error("app bundle SHA-256 mismatch");

  // Stage on the SAME volume as CONXA_DIR so the final rename is atomic (avoids
  // EXDEV cross-device errors that occur when os.tmpdir() is on a different volume).
  const nextDir = appDir + ".next";
  const bakDir  = appDir + ".bak";
  const zipPath = appDir + ".zip";
  // Clean up any leftover staging artefacts from prior interrupted runs.
  try { fs.rmSync(nextDir, { recursive: true }); } catch (_) {}
  try { fs.unlinkSync(zipPath); } catch (_) {}

  fs.mkdirSync(nextDir, { recursive: true });
  fs.writeFileSync(zipPath, buf);

  await new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    let cmd, args2;
    if (process.platform === "win32") {
      cmd   = "powershell";
      args2 = ["-NonInteractive", "-Command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${nextDir}' -Force`];
    } else {
      cmd   = "unzip";
      args2 = ["-o", zipPath, "-d", nextDir];
    }
    const ps = spawn(cmd, args2, { stdio: "ignore" });
    ps.on("close", code => code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`)));
  });
  try { fs.unlinkSync(zipPath); } catch (_) {}

  // Validate the newly-staged dir before touching the live brain.
  if (!_isValidAppDir(nextDir)) {
    try { fs.rmSync(nextDir, { recursive: true }); } catch (_) {}
    throw new Error("[app:update] staged bundle invalid — server.js or version.json missing");
  }

  // Atomic swap: promote the current good brain to .bak, then install the new one.
  // The window where appDir is absent spans only two fast renames; .bak covers it.
  if (_isValidAppDir(appDir)) {
    // Current brain is good — keep it as last-known-good backup.
    if (fs.existsSync(bakDir)) fs.rmSync(bakDir, { recursive: true });
    fs.renameSync(appDir, bakDir);
  } else if (fs.existsSync(appDir)) {
    // Current brain is broken/partial — discard it, but KEEP any existing .bak.
    fs.rmSync(appDir, { recursive: true });
  }
  fs.renameSync(nextDir, appDir);
  log("info", `[app:update] ${manifest.app_version} installed — effective on next restart`);
}

// Apply pending update before connecting (may exit process on Windows).
if (process.platform === "win32") {
  const _pendingApplied = _applyPendingUpdate();
  // _applyPendingUpdate() is async but its shell spawn is fire-and-forget;
  // if it returns true the process exits in the bat timeout window — safe to continue.
}
// Delete the pending marker after a confirmed successful first run post-update.
if (fs.existsSync(RUNTIME_UPDATE_PENDING)) {
  try {
    const p = JSON.parse(fs.readFileSync(RUNTIME_UPDATE_PENDING, "utf8"));
    if (p.ready && !fs.existsSync(path.join(CONXA_DIR, "conxa-runtime.exe.next"))) {
      fs.unlinkSync(RUNTIME_UPDATE_PENDING);
      log("info", "runtime_update_applied", { version: p.version });
    }
  } catch (_) {}
}

// ─── 10. Connect MCP immediately ─────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport);
log("info", "mcp_connected", { version: RUNTIME_VERSION, conxa_dir: CONXA_DIR,
  max_recovery_tier: MAX_RECOVERY_TIER, agent_recovery: AGENT_RECOVERY_ENABLED });

// ─── 11. Async post-connect tasks ────────────────────────────────────────────
// execute_skill awaits this promise before running so it always sees fresh data.
// The promise always resolves (failures caught internally) — never hangs.
const startupSync = (async () => {
  try {
    await Promise.all([
      sync.syncSkillPacks(SKILL_PACKS_DIR, { timeoutMs: 4000, log: (m) => log("info", m) })
        .then(()  => { syncState.skillsDone = true; })
        .catch(() => { syncState.skillsDone = true; }),

      _checkAppUpdate()
        .then(()  => { syncState.appDone = true; })
        .catch(e  => { log("warn", "app_update_skipped", { reason: e.message }); syncState.appDone = true; }),
    ]);
  } finally {
    syncState.complete = true;
    skillIndex = skillLoader.loadSkillRegistry(SKILL_PACKS_DIR, CACHE_DIR);
    log("info", "sync_complete", { count: Object.keys(skillIndex).length });
    server.sendToolListChanged().catch(() => {});
  }

  _phonehome().catch(() => {});
  _checkHostUpdate().catch(() => {}); // background host binary check — never blocks execution
})();

// ─── 12. Graceful shutdown ────────────────────────────────────────────────────
process.on("SIGINT",  () => gracefulShutdown());
process.on("SIGTERM", () => gracefulShutdown());

// ─── Skill-specific tool definitions (generated from loaded skill index) ─────
// One tool per installed skill so Claude can match intent directly without
// a discovery round-trip. Tool names: skill_{company}_{slug_underscored}.
function _skillToolDefinitions() {
  const tools = [];
  for (const entry of Object.values(skillIndex)) {
    const inputsPath = path.join(entry.skillDir, "inputs.json");
    const legacyPath = path.join(entry.skillDir, "input.json");
    let inputFields = [];
    try {
      const src = fs.existsSync(inputsPath) ? inputsPath : (fs.existsSync(legacyPath) ? legacyPath : null);
      if (src) {
        const raw = JSON.parse(fs.readFileSync(src, "utf8"));
        if (Array.isArray(raw.inputs)) inputFields = raw.inputs;
      }
    } catch (_) {}

    const properties = {};
    const required = [];
    for (const f of inputFields) {
      properties[f.name] = { type: f.type || "string", description: f.description || f.name };
      required.push(f.name);
    }

    const needsStr = required.length ? ` Needs: ${required.join(", ")}.` : "";
    tools.push({
      name: `skill_${entry.company}_${entry.slug.replace(/-/g, "_")}`,
      description: `Conxa: ${entry.manifest.name || entry.slug} on ${entry.company}. ${entry.manifest.description || ""}${needsStr}`,
      inputSchema: { type: "object", properties, required },
    });
  }
  return tools;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
function _toolDefinitions() {
  return [
    {
      name: "list_skills",
      description: "Conxa automation: list all installed workflow skills. ALWAYS call this first when the user mentions Conxa or wants to automate any task on a web app (Render, GitHub, Jira, Stripe, etc.). Returns available companies and skill slugs so you can match the user's intent to the right skill.",
      inputSchema: {
        type: "object",
        properties: {
          company: { type: "string", description: "Filter to a specific company slug (optional)" },
        },
        required: [],
      },
    },
    {
      name: "execute_skill",
      description: "Conxa automation: execute a recorded browser workflow skill. Call list_skills first to get the skill slug, then get_skill_inputs to see required fields, then call this. Default watch: true (visible browser). Pass watch: false only if user explicitly asks for background execution.",
      inputSchema: {
        type: "object",
        properties: {
          skill:       { type: "string",  description: "Skill slug from list_skills" },
          company:     { type: "string",  description: "Company slug (required if skill slug is not unique)" },
          inputs:      { type: "object",  description: "Input values. Call get_skill_inputs first to see the schema." },
          resume_from: { type: "integer", description: "0-based step index to resume from after a failure (the value reported in the failure response)." },
          step_overrides: {
            type: "object",
            description: "Tier 3/4 self-healing: map of \"<step index>\" → { \"selector\": \"<Playwright selector>\" }. When a step fails, the runtime returns the failed step's intent, a live DOM inventory, and a screenshot; identify the correct element and pass its selector here keyed by the same index as resume_from. Prefer [data-testid=\"…\"], then #id, then internal:role=<role>[name=\"…\"], then text=\"…\". Example: { \"7\": { \"selector\": \"[data-testid='submit-btn']\" } }.",
          },
          watch:       { type: "boolean", description: "true = open a visible browser so the user can watch; false = run headlessly in the background." },
        },
        required: ["skill"],
      },
    },
    {
      name: "execute_sequence",
      description: "Conxa automation: execute an ordered list of workflow skills in one shared browser session. Use when the user wants to run multiple skills back-to-back. Default watch: true (visible browser).",
      inputSchema: {
        type: "object",
        properties: {
          skills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                skill:   { type: "string" },
                company: { type: "string" },
                inputs:  { type: "object" },
                resume_from:    { type: "integer", description: "0-based step index to resume from after a failure." },
                step_overrides: { type: "object", description: "Tier 3/4 self-healing selector overrides, keyed by step index (see execute_skill)." },
              },
              required: ["skill"],
            },
          },
          watch: { type: "boolean", description: "true = visible browser; false = headless." },
        },
        required: ["skills"],
      },
    },
    {
      name: "get_skill_inputs",
      description: "Conxa automation: return the required input fields for a skill. Always call this after list_skills and before execute_skill so you know exactly what to ask the user for.",
      inputSchema: {
        type: "object",
        properties: {
          skill:   { type: "string" },
          company: { type: "string" },
        },
        required: ["skill"],
      },
    },
    {
      name: "cancel_execution",
      description: "Conxa automation: cancel the currently running skill execution. Safe to call at any time.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_runtime_status",
      description: "Conxa automation: return the installed runtime version, Chromium revision, skill pack versions, and pending self-update state. Use for diagnostics or to verify the runtime is up to date.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    // Skill-specific tools: one per installed skill for direct intent routing
    ..._skillToolDefinitions(),
  ];
}

// ─── Resolve skill from index ─────────────────────────────────────────────────
function _resolveSkill(skillSlug, company) {
  if (!skillSlug) return null;
  const normalSlug = skillSlug.replace(/-/g, "_");

  // Exact match
  if (company) {
    const entry = skillIndex[`${company}:${skillSlug}`];
    if (entry) return entry;
    // Try underscore/dash normalization
    for (const v of Object.values(skillIndex)) {
      if (v.company === company && v.slug.replace(/-/g, "_") === normalSlug) return v;
    }
  }

  // Slug-only match across all companies
  for (const v of Object.values(skillIndex)) {
    if (v.slug === skillSlug || v.slug.replace(/-/g, "_") === normalSlug) return v;
  }
  return null;
}

// ─── Sync status per company ──────────────────────────────────────────────────
function _syncStatus(pack) {
  if (!pack.last_synced) return "unknown";
  return (Date.now() - new Date(pack.last_synced).getTime()) < 3600000 ? "current" : "stale";
}

function _trackingStatus(pack) {
  const tracking = (pack && pack.tracking) || {};
  return {
    enabled: tracking.enabled === true,
    tracking_url_present: Boolean(tracking.tracking_url),
    tracking_token_present: Boolean(tracking.tracking_token),
    company_id: tracking.company_id || "",
    workspace_id: pack?.published?.workspace_id || pack?.workspace_id || "",
    sync_endpoint: pack?.sync_endpoint || "",
  };
}


// Compact, recovery-relevant description of the step the cascade could not resolve.
// Drives Tier 3 (semantic) matching: the agent matches THIS intent against the live DOM.
function _stepRecoveryContext(err) {
  const step = err && err.failedStep ? err.failedStep : null;
  if (!step) return null;
  const fp = (step.identity_bundle && step.identity_bundle.fingerprint) || {};

  // Anchors from recovery.json are human-readable descriptions written at compile time and
  // stable across UI drift — unlike compiled fingerprint fields (inner_text, data_testid) which
  // may be stale. Prefer the highest-priority anchor as the element label; fall back to the
  // fingerprint when anchors are absent.
  const anchors = Array.isArray(step.anchors)
    ? step.anchors
        .filter(a => a && typeof a.text === "string" && a.text.trim())
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(a => a.text.trim())
    : [];

  const ctx = {
    action: step.type || "",
    intent: step._intent || step.label || "",
    target: {
      role:        fp.role || undefined,
      name:        fp.aria_label || fp.name || undefined,
      text:        anchors[0] || fp.inner_text || undefined,
      data_testid: fp.data_testid || undefined,
    },
  };
  if (anchors.length) ctx.anchors = anchors;
  if (step.value && typeof step.value === "string" && step.value.length < 80) ctx.value = step.value;
  // Strip empty target fields so the agent sees only positive identity signals.
  ctx.target = Object.fromEntries(Object.entries(ctx.target).filter(([, v]) => v));
  if (!Object.keys(ctx.target).length) delete ctx.target;
  return ctx;
}

// ─── Build failure response ───────────────────────────────────────────────────
// Two shapes, decided by the recovery-tier ceiling (CONXA_MAX_RECOVERY_TIER):
//   • ceiling ≥ 3 (Claude/MCP): a structured Tier 3 (semantic) + Tier 4 (vision) recovery
//     request with an explicit `step_overrides` protocol so the agent can apply a fix and
//     resume — the closing edge of the four-tier cascade.
//   • ceiling 2 (Build Studio): a concise, deterministic failure. No agent handoff, no
//     screenshots — the compiled pack is judged on its T1/T2 merits alone.
async function _buildFailureResponse(page, err, resolvedEntry) {
  const url      = page.url();
  const failedAt = typeof err.failedAt === "number" ? err.failedAt : null;
  const stepNo   = failedAt !== null ? failedAt + 1 : "?";

  // Session expiry is surfaced in BOTH modes — it is an auth condition, not a selector miss.
  if (err.session_expired) {
    const reauth = AGENT_RECOVERY_ENABLED
      ? `\nAsk the user to re-authenticate, then call execute_skill with resume_from: ${failedAt ?? 0}.`
      : "";
    return { content: [{ type: "text", text:
      `Execution failed at step ${stepNo}: session expired — redirected to ${err.login_url || url}.${reauth}` }] };
  }

  // Build Studio (T1/T2 ceiling): deterministic terminal failure, no agent recovery payload.
  if (!AGENT_RECOVERY_ENABLED) {
    appendRecoveryEvent({ event: "recovery_ceiling_reached", tier: MAX_RECOVERY_TIER,
      slug: resolvedEntry && resolvedEntry.slug, step_index: failedAt });
    const intent = _stepRecoveryContext(err);
    const detail = intent ? `\nStep intent: ${JSON.stringify(intent)}` : "";
    return { content: [{ type: "text", text:
      `Execution failed at step ${stepNo}: ${err.message}\nPage URL: ${url}\n` +
      `Recovery ceiling Tier ${MAX_RECOVERY_TIER} (deterministic cascade only — no agent recovery).${detail}` }] };
  }

  // P7: capture as JPEG (lossless PNG is 3-8× larger; Claude token cost is dimension-based either way)
  const failShot = await page.screenshot({ type: "jpeg", quality: 80 }).catch(() => null);

  // P5: skip visual reference if already sent for this (slug, step) in this execution
  const sentRefs    = activeExecution?.sentVisualRefs;
  const visualRefKey = resolvedEntry && failedAt !== null ? `${resolvedEntry.slug}:${failedAt}` : null;
  const alreadySentRef = sentRefs && visualRefKey ? sentRefs.has(visualRefKey) : false;

  let visualRefData = null, visualRefMime = null;
  if (resolvedEntry && failedAt !== null && !alreadySentRef) {
    const visualDir = path.join(resolvedEntry.skillDir, "visuals");
    const stepNum   = failedAt + 1;
    for (const ext of [".jpg", ".jpeg", ".png"]) {
      const candidate = path.join(visualDir, `Image_${stepNum}${ext}`);
      if (fs.existsSync(candidate)) {
        visualRefData = fs.readFileSync(candidate).toString("base64");
        visualRefMime = ext === ".png" ? "image/png" : "image/jpeg";
        if (sentRefs && visualRefKey) sentRefs.add(visualRefKey);
        break;
      }
    }
  }

  // P2: cap at 50 elements (was 250) — dominant text payload; nearby elements suffice for recovery.
  // Prefer the snapshot taken at the exact moment of failure (before the T1/T2 cascade ran and
  // potentially closed transient UI like dropdown menus). Fall back to a live query only when no
  // early snapshot exists (e.g. the step was non-interactive or the evaluate threw).
  let viewport = null;
  try { viewport = page.viewportSize(); } catch (_) {}
  let scrollY = null;
  try { scrollY = await page.evaluate(() => window.scrollY); } catch (_) {}

  let pageStructure = (Array.isArray(err.earlyDomSnapshot) && err.earlyDomSnapshot.length)
    ? err.earlyDomSnapshot
    : null;

  if (!pageStructure) {
    try {
      pageStructure = await page.evaluate(() => {
        const seen = new Set();
        return Array.from(document.querySelectorAll(
          'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]'
        )).map(el => {
          const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80);
          const tag  = el.tagName.toLowerCase();
          const type = el.getAttribute("type")        || "";
          const role = el.getAttribute("role")        || "";
          const id   = el.id                          || undefined;
          const dt   = el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined;
          const key  = `${tag}|${type}|${text}`;
          if (!text && !type && !id && !dt) return null;
          if (seen.has(key)) return null;
          seen.add(key);
          return { tag, type: type || undefined, role: role || undefined, text: text || undefined, id, "data-testid": dt };
        }).filter(Boolean).slice(0, 50);
      });
    } catch (_) {}
  }

  appendRecoveryEvent({ event: "agent_recovery_requested", tier: MAX_RECOVERY_TIER,
    slug: resolvedEntry && resolvedEntry.slug, step_index: failedAt });

  const intent = _stepRecoveryContext(err);
  const resumeKey = failedAt !== null ? String(failedAt) : "0";

  // Header + the exact closing-edge protocol so the agent can apply its finding and resume.
  const header =
    `Execution failed at step ${stepNo} (Tier 1–2 cascade exhausted): ${err.message}\n` +
    `Page URL: ${url}\n\n` +
    `Self-healing recovery (Tier 3 semantic + Tier 4 vision). Identify the element the failed ` +
    `step was meant to act on, then resume by calling execute_skill again with:\n` +
    `  resume_from: ${failedAt ?? 0}\n` +
    `  step_overrides: { "${resumeKey}": { "selector": "<your selector>" } }\n` +
    `Selector preference: [data-testid="…"] > #id > internal:role=<role>[name="…"] > text="…". ` +
    `Use the screenshot when the DOM inventory below is ambiguous. Do not guess — if no element ` +
    `matches the intent, tell the user the page has changed and ask how to proceed.`;

  // Tier 3 — semantic: the recorded intent + a live inventory of interactive elements.
  const t3 = ["── Tier 3 (semantic) ──"];
  if (intent) t3.push(`Failed step intent: ${JSON.stringify(intent)}`);
  if (viewport) t3.push(`viewport: ${JSON.stringify(viewport)}, scrollY: ${scrollY}`);
  if (pageStructure && pageStructure.length > 0) {
    t3.push(`Interactive elements now on the page (${pageStructure.length}):\n${JSON.stringify(pageStructure)}`);
  } else {
    t3.push("No interactive elements were enumerable — rely on the Tier 4 screenshot.");
  }

  const content = [
    { type: "text", text: header },
    { type: "text", text: t3.join("\n") },
    { type: "text", text: "── Tier 4 (vision) ──" },
  ];

  if (err.preShot)    content.push({ type: "text", text: "Pre-step screenshot (before the action):" }, { type: "image", data: err.preShot.toString("base64"), mimeType: "image/jpeg" });
  if (visualRefData)  content.push({ type: "text", text: `Reference image of the target from recording (step ${stepNo}):` }, { type: "image", data: visualRefData, mimeType: visualRefMime });
  if (failShot)       content.push({ type: "text", text: "Current page at failure:" }, { type: "image", data: failShot.toString("base64"), mimeType: "image/jpeg" });

  return { content };
}

// ─── Tool handler ─────────────────────────────────────────────────────────────
async function _handleTool(name, args, extra) {
  const text = (t) => ({ content: [{ type: "text", text: t }] });
  const err  = (t) => text(t);

  // ── list_skills ──────────────────────────────────────────────────────────────
  if (name === "list_skills") {
    const filterCompany = args.company ? String(args.company) : null;
    const skills = Object.values(skillIndex)
      .filter(s => !filterCompany || s.company === filterCompany)
      .map(s => ({
        skill:           s.slug,
        company:         s.company,
        name:            s.manifest.name || s.slug,
        description:     s.manifest.description || "",
        inputs_required: s.manifest.inputs_required || [],
        sync_status:     _syncStatus(s.pack),
        version:         s.manifest.version || "1.0.0",
      }));
    return text(JSON.stringify({ skills, total: skills.length }));
  }

  // ── get_skill_inputs ─────────────────────────────────────────────────────────
  if (name === "get_skill_inputs") {
    const entry = _resolveSkill(String(args.skill || ""), args.company ? String(args.company) : null);
    if (!entry) return err(`Skill not found: ${args.skill}. Call list_skills first.`);
    const inputsPath = path.join(entry.skillDir, "inputs.json");
    // Fall back to legacy input.json
    const legacyPath = path.join(entry.skillDir, "input.json");
    const schema = fs.existsSync(inputsPath)
      ? JSON.parse(fs.readFileSync(inputsPath, "utf8"))
      : (fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, "utf8")) : {});
    return text(JSON.stringify(schema));
  }

  // ── cancel_execution ─────────────────────────────────────────────────────────
  if (name === "cancel_execution") {
    if (!activeExecution) return text('{"cancelled":false,"reason":"no active execution"}');
    activeExecution.cancelRequested = true;
    return text('{"cancelled":true}');
  }

  // ── get_runtime_status ───────────────────────────────────────────────────────
  if (name === "get_runtime_status") {
    const chromiumBase = path.join(CONXA_DIR, "chromium");
    const revFile = path.join(chromiumBase, ".revision");
    let chromiumRevision = null;
    if (fs.existsSync(revFile)) {
      chromiumRevision = fs.readFileSync(revFile, "utf8").trim() || null;
    } else if (fs.existsSync(chromiumBase)) {
      chromiumRevision = fs.readdirSync(chromiumBase).find(d => d.startsWith("chromium-")) || null;
    }

    let updatePending = null;
    if (fs.existsSync(RUNTIME_UPDATE_PENDING)) {
      try {
        const p = JSON.parse(fs.readFileSync(RUNTIME_UPDATE_PENDING, "utf8"));
        updatePending = { version: p.version, ready: p.ready };
      } catch (_) {}
    }

    const packsMap = {};
    for (const entry of Object.values(skillIndex)) {
      const co = entry.company;
      if (!packsMap[co]) {
        packsMap[co] = {
          company: co,
          skill_pack_version: entry.pack?.skill_pack_version || "unknown",
          required_runtime: entry.pack?.required_runtime || "unknown",
          skills: [],
        };
      }
      packsMap[co].skills.push(entry.slug);
    }

    return text(JSON.stringify({
      runtime_version: RUNTIME_VERSION,
      chromium_revision: chromiumRevision,
      platform: process.platform,
      install_id: INSTALL_ID,
      conxa_dir: CONXA_DIR,
      max_recovery_tier: MAX_RECOVERY_TIER,
      agent_recovery_enabled: AGENT_RECOVERY_ENABLED,
      skill_packs: Object.values(packsMap),
      update_pending: updatePending,
    }, null, 2));
  }

  // ── execute_skill / execute_sequence ─────────────────────────────────────────
  if (name === "execute_skill" || name === "execute_sequence") {
    const watch = args.watch !== false;
    const runs = name === "execute_sequence"
      ? (Array.isArray(args.skills) ? args.skills : [])
      : [{ skill: args.skill, company: args.company, inputs: args.inputs, resume_from: args.resume_from, step_overrides: args.step_overrides }];

    if (runs.length === 0) return err("No skills provided.");

    // Hard gate: do not execute against stale data.
    // startupSync always resolves (all failures caught internally) so this never hangs.
    // After the first call the promise is already settled — subsequent calls are instant.
    if (!syncState.complete) {
      await startupSync;
    }

    // Execution lock
    if (activeExecution) return err(`Execution already running: ${activeExecution.slug}. Call cancel_execution first.`);

    // Resolve all skills (fail fast)
    const resolved = [];
    for (const run of runs) {
      const entry = _resolveSkill(String(run.skill || ""), run.company ? String(run.company) : null);
      if (!entry) return err(`Skill not found: ${run.skill}. Call list_skills.`);

      // Integrity gate
      try {
        skillLoader.verifySkillIntegrity(entry.skillDir, entry.manifest);
      } catch (integrityErr) {
        // Trigger background re-sync
        sync.syncSkillPacks(SKILL_PACKS_DIR, { timeoutMs: 4000, log: (m) => log("info", m) })
          .then(() => { skillIndex = skillLoader.loadSkillRegistry(SKILL_PACKS_DIR, CACHE_DIR); })
          .catch(() => {});
        return err(`Skill integrity check failed: ${integrityErr.message}. A background re-sync has been triggered — please retry in a moment.`);
      }

      // Runtime compatibility
      const required = entry.manifest.required_runtime || ">=0.0.0";
      if (!semver.satisfies(RUNTIME_VERSION, required))
        return err(`Skill ${run.skill} requires runtime ${required}, installed: ${RUNTIME_VERSION}. Please update the Conxa runtime.`);

      const execPath = path.join(entry.skillDir, "execution.json");
      const recPath  = path.join(entry.skillDir, "recovery.json");
      const rawExec  = fs.existsSync(execPath) ? JSON.parse(fs.readFileSync(execPath, "utf8")) : null;
      const rawRec   = fs.existsSync(recPath)  ? JSON.parse(fs.readFileSync(recPath,  "utf8")) : null;
      const rawSteps = Array.isArray(rawExec) ? rawExec : (rawExec?.steps || rawExec?.execution_plan || []);
      const enriched = enrichStepsWithRecovery(rawSteps, rawRec);
      // Apply agent-recovery selector overrides (Tier 3/4 closing edge). Only honoured when
      // agent recovery is enabled (ceiling ≥ 3) — in a deterministic Studio test (ceiling 2)
      // a stray override must not silently rewrite the pack under test.
      const steps = AGENT_RECOVERY_ENABLED ? applyStepOverrides(enriched, run.step_overrides) : enriched;
      const overrideCount = AGENT_RECOVERY_ENABLED && run.step_overrides && typeof run.step_overrides === "object"
        ? Object.keys(run.step_overrides).length : 0;
      if (overrideCount) {
        appendRecoveryEvent({ event: "agent_override_applied", slug: entry.slug, count: overrideCount });
      }

      resolved.push({
        entry,
        steps,
        inputs:     (run.inputs && typeof run.inputs === "object") ? run.inputs : {},
        resumeFrom: (Number.isInteger(run.resume_from) && run.resume_from > 0) ? run.resume_from : 0,
      });
    }

    // Retry budget check on resume
    const primary = resolved[0];
    if (primary.resumeFrom > 0 && !checkRetryBudget(primary.entry.slug, primary.resumeFrom))
      return err(`Retry budget exhausted at step ${primary.resumeFrom}. Fix the root cause in execution.json before retrying from step 0.`);

    // Acquire execution lock
    activeExecution = {
      slug:            primary.entry.slug,
      company:         primary.entry.company,
      step:            0,
      total:           resolved.reduce((n, r) => n + r.steps.length, 0),
      startedAt:       new Date().toISOString(),
      cancelRequested: false,
      deadlineAt:      Date.now() + EXECUTION_DEADLINE_MS,
      deadlineExceeded: false,
      sentVisualRefs:  new Set(), // P5: tracks which (slug:stepIndex) visual refs were sent this execution
    };

    // Wall-clock watchdog: trips the same cancel path as a client abort once the execution budget
    // is spent, so the run stops and returns *before* the client's request timeout fires (turning a
    // silent 4-minute hang into a fast, actionable failure). Checked at every step / recovery-stage
    // boundary; all Playwright ops are individually bounded, so it is observed within seconds of
    // expiring. Distinguished from a client cancel by the deadlineExceeded flag (see catch block).
    const _execCancelled = () => {
      if (!activeExecution) return false;
      if (activeExecution.cancelRequested) return true;
      if (Date.now() >= activeExecution.deadlineAt) {
        if (!activeExecution.deadlineExceeded) {
          activeExecution.deadlineExceeded = true;
          log("warn", "execution_deadline_exceeded",
            { skill: primary.entry.slug, step: activeExecution.step, deadline_ms: EXECUTION_DEADLINE_MS });
          appendRecoveryEvent({ event: "execution_deadline_exceeded", slug: primary.entry.slug, step: activeExecution.step });
        }
        return true;
      }
      return false;
    };

    // Honour MCP protocol cancellation. The SDK aborts `extra.signal` when the client sends
    // notifications/cancelled — which a client also does when its own request times out. Without
    // this, the runtime kept executing after the client gave up, parked a browser the client can
    // never resume, and produced a response the SDK silently drops. `runPlan`'s cancelCheck reads
    // activeExecution.cancelRequested, so flipping it here makes both the step loop and the recovery
    // cascade yield promptly and tear down cleanly. (cancel_execution sets the same flag.)
    const _abortSignal = extra && extra.signal;
    const _onAbort = () => {
      if (activeExecution) activeExecution.cancelRequested = true;
      log("info", "execution_cancelled_by_client", { skill: primary.entry.slug });
      appendRecoveryEvent({ event: "execution_cancelled_by_client", slug: primary.entry.slug });
    };
    if (_abortSignal) {
      if (_abortSignal.aborted) _onAbort();
      else _abortSignal.addEventListener("abort", _onAbort, { once: true });
    }

    // Per-company observer pace (ms of minimum viewing time per page transition)
    const _observerMs = primary.entry.pack?.pacing?.observer_ms ?? 600;

    log("info", "execute_start", {
      tool: name,
      run_count: resolved.length,
      skill: primary.entry.slug,
      company: primary.entry.company,
      total_steps: resolved.reduce((n, r) => n + r.steps.length, 0),
      watch,
      max_recovery_tier: MAX_RECOVERY_TIER,
      tracking: _trackingStatus(primary.entry.pack),
    });

    // Set up lightweight tracker for this execution
    const _tracker    = createTracker(primary.entry.pack?.tracking || {}, {
      runtime_version: RUNTIME_VERSION,
      plugin_id:       primary.entry.slug,
      plugin_version:  primary.entry.manifest?.version || "0",
      company_id:      primary.entry.company,
      log,
    });
    const _runId      = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const _runTracker = _tracker.forRun(_runId, { uid: INSTALL_ID, wid: "" });
    const _wfStartAt  = Date.now();
    let   _totalRecovered = 0;

    // Signal agent-mediated recovery retry (Tier 3/4) when resuming mid-plan.
    if (primary.resumeFrom > 0) {
      const hasOverride = AGENT_RECOVERY_ENABLED && primary.steps[primary.resumeFrom] && primary.steps[primary.resumeFrom]._agent_override;
      _runTracker.emit("rec_start", { si: primary.resumeFrom, l: hasOverride ? 3 : 5, sc: hasOverride ? "agent_override" : "llm_intent" });
    }
    _runTracker.emit("wf_start", {});

    // Adopt a parked failed page when the agent is resuming THIS skill with an override, so the
    // corrected selector acts on the exact DOM state the recovery request was built from.
    const _resumeOverride = AGENT_RECOVERY_ENABLED && resolved.length === 1 && primary.resumeFrom > 0
      && primary.steps[primary.resumeFrom] && primary.steps[primary.resumeFrom]._agent_override;
    let _park = null;
    if (_resumeOverride && _parkedRecovery
        && _parkedRecovery.slug === primary.entry.slug
        && _parkedRecovery.company === primary.entry.company) {
      try { _parkedRecovery.page.url(); _park = _parkedRecovery; } catch (_) { _park = null; }
      if (_park) { clearTimeout(_park.timer); _parkedRecovery = null; }
    }
    // Any park we did not adopt is stale (different skill, dead page, or a non-resume run) —
    // discard it so it can neither leak a browser nor interfere with this run.
    if (_parkedRecovery) await _discardPark(_resumeOverride ? "replaced" : "superseded");

    let page = null;
    let _browser, _context, _protectedUrl;
    try {
      if (_park) {
        ({ browser: _browser, context: _context } = _park);
        page = _park.page;
        log("info", "recovery_park_resumed", { skill: primary.entry.slug, step_index: primary.resumeFrom });
        appendRecoveryEvent({ event: "recovery_park_resumed", slug: primary.entry.slug, step_index: primary.resumeFrom });
      } else {
        ({ browser: _browser, context: _context, protectedUrl: _protectedUrl } = await getCachedBrowser(primary.entry.company, authManager, { headless: !watch }));
        page = await _context.newPage();
        if (_protectedUrl) {
          await page.goto(_protectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        }
      }

      const runtimeLog = { consoleErrors: [], pageErrors: [], failedRequests: [] };
      const _downloadsDir = path.join(CONXA_DIR, "downloads", _runId);
      const _downloads = [];
      const _downloadSaves = [];
      const _downloadQueue = [];

      // Attach page diagnostic listeners — called on initial page and again after re-auth context rebuild.
      const _attachPageListeners = (pg) => {
        pg.on("console", msg => {
          if (["error", "warning"].includes(msg.type()) && runtimeLog.consoleErrors.length < 50)
            runtimeLog.consoleErrors.push({ type: msg.type(), text: msg.text() });
        });
        pg.on("pageerror",     e  => { if (runtimeLog.pageErrors.length < 20) runtimeLog.pageErrors.push(e.message); });
        pg.on("requestfailed", req => {
          if (runtimeLog.failedRequests.length < 30)
            runtimeLog.failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
        });
        pg.on("download", (download) => {
          let resolveEntry;
          const entryPromise = new Promise(resolve => { resolveEntry = resolve; });
          _downloadQueue.push(entryPromise);
          const savePromise = (async () => {
            fs.mkdirSync(_downloadsDir, { recursive: true });
            const fname = download.suggestedFilename() || `download_${Date.now()}`;
            const dest  = path.join(_downloadsDir, fname);
            await download.saveAs(dest);
            _downloads.push(dest);
            resolveEntry({ filename: fname, path: dest });
          })().catch(() => { resolveEntry(null); });
          _downloadSaves.push(savePromise);
        });
      };

      _attachPageListeners(page);

      for (let si = 0; si < resolved.length; si++) {
        const { entry, steps, inputs, resumeFrom } = resolved[si];
        let startAt = si === 0 ? resumeFrom : 0;
        let authAttempts = 0;

        while (true) { // eslint-disable-line no-constant-condition
          try {
            const result = await runPlan(page, steps, inputs, startAt, entry.slug, {
              onStep:        (i) => { if (activeExecution) activeExecution.step = i; },
              cancelCheck:   _execCancelled,
              tracker:       _runTracker,
              observerMs:    _observerMs,
              downloadQueue: _downloadQueue,
            });
            _totalRecovered += (result && result.recoveredSteps) ? result.recoveredSteps : 0;
            break;
          } catch (runErr) {
            // Auth-failure recovery (Phase 5): detect login redirect, open headed re-auth window, resume.
            const failedStep = runErr.failedAt ?? null;
            const loginUrl = entry.manifest?.login_url || entry.manifest?.target_url || entry.manifest?.entry_url || page.url();
            if (failedStep !== null && await isAuthFailure(page)) {
              if (authAttempts >= 3) {
                throw Object.assign(
                  new Error("Authentication still failing after 3 re-login attempts — giving up."),
                  { session_expired: true, login_url: loginUrl, failedAt: failedStep, fromEntry: entry }
                );
              }
              authAttempts++;
              appendRecoveryEvent({ event: "auth_failure_detected", slug: entry.slug, step_index: failedStep, attempt: authAttempts });
              const refreshResult = await captureReAuth(entry.company, loginUrl, authManager, SESSIONS_DIR);
              if (!refreshResult.ok) {
                // User cancelled the re-auth window — surface immediately.
                throw Object.assign(
                  new Error(refreshResult.message),
                  { session_expired: true, login_url: loginUrl, failedAt: failedStep, fromEntry: entry }
                );
              }
              appendRecoveryEvent({ event: "auth_refreshed", slug: entry.slug, attempt: authAttempts });
              // Close stale execution context and rebuild with fresh session from disk.
              await page.close().catch(() => {});
              await _context.close().catch(() => {});
              await _browser.close().catch(() => {});
              ({ browser: _browser, context: _context, protectedUrl: _protectedUrl } =
                await getCachedBrowser(entry.company, authManager, { headless: !watch }));
              page = await _context.newPage();
              if (_protectedUrl)
                await page.goto(_protectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
              _attachPageListeners(page);
              startAt = failedStep;
              continue;
            }
            runErr.fromEntry = entry;
            throw runErr;
          }
        }
      }

      // Success — save session
      const state = await _context.storageState();
      authManager.saveRawSession(primary.entry.company, state, SESSIONS_DIR);

      const url  = page.url();
      const shot = process.env.CONXA_CAPTURE_SUCCESS_SCREENSHOT === "1"
        ? await page.screenshot({ type: "png" }).catch(() => null)
        : null;
      await Promise.allSettled(_downloadSaves);
      await page.close().catch(() => {});
      if (watch) {
        await _context.close().catch(() => {});
        await _browser.close().catch(() => {});
      }

      for (const r of resolved) {
        clearRetryBudget(r.entry.slug);
        appendRecoveryEvent({ event: "run_success", slug: r.entry.slug, steps_executed: r.steps.length });
      }

      _runTracker.emit("wf_ok", {
        dur: Date.now() - _wfStartAt,
        tot: resolved.reduce((n, r) => n + r.steps.length, 0),
        rec: _totalRecovered,
      });
      await _tracker.flush();
      _tracker.destroy();

      log("info", "execute_success", { skill: primary.entry.slug, url });

      const downloadNote = _downloads.length
        ? `\nDownloaded files:\n${_downloads.map(p => `  ${p}`).join("\n")}`
        : "";
      const content = [{ type: "text", text: `Done. URL: ${url}${downloadNote}` }];
      if (shot) content.push({ type: "image", data: shot.toString("base64"), mimeType: "image/png" });
      return { content };

    } catch (runErr) {
      log("error", "execute_failed", { skill: primary.entry.slug, error: runErr.message });
      appendRecoveryEvent({ event: "terminal_failure", slug: primary.entry.slug, error: runErr.message });
      _runTracker.emit("wf_fail", {
        dur: Date.now() - _wfStartAt,
        fsi: runErr.failedAt ?? null,
        fc:  mapErrorToCode(runErr),
      });
      await _tracker.flush();
      _tracker.destroy();

      // Aborted runs (runPlan threw { cancelled }) come from two sources, both of which tear down
      // immediately and never park (a parked page is only useful for an agent that is still waiting):
      //   1. Deadline watchdog — we stopped *before* the client's request timeout, so the caller is
      //      still listening. Return an actionable failure naming the stalled step so the agent can
      //      verify inputs or resume with step_overrides, instead of the user seeing a silent hang.
      //   2. Client cancel (cancel_execution, or the client timed out first and sent
      //      notifications/cancelled) — the caller is gone, the SDK drops any response; just clean up.
      if (runErr.cancelled) {
        const wasDeadline = activeExecution && activeExecution.deadlineExceeded;
        const stalledStep = activeExecution ? activeExecution.step : null;
        if (page) await page.close().catch(() => {});
        if (watch) {
          await _context?.close().catch(() => {});
          await _browser?.close().catch(() => {});
        }
        if (wasDeadline) {
          const secs = Math.round(EXECUTION_DEADLINE_MS / 1000);
          const stepLabel = stalledStep !== null ? ` at step ${stalledStep + 1}` : "";
          const resumeHint = AGENT_RECOVERY_ENABLED && stalledStep !== null
            ? ` If a element moved, inspect the page and call execute_skill again with resume_from: ${stalledStep} and step_overrides.`
            : "";
          return err(
            `Execution stopped after exceeding the ${secs}s time budget${stepLabel}. ` +
            `The page never reached the expected state in time — most often the inputs don't match ` +
            `what the site returned (e.g. a repository/search term with no results), so the next ` +
            `element never appeared. Verify the inputs and retry.${resumeHint}`
          );
        }
        return err("Execution cancelled.");
      }

      const failResp = page ? await _buildFailureResponse(page, runErr, runErr.fromEntry || primary.entry) : err(runErr.message);

      // Park the live failed page for an agent-mediated (Tier 3/4) resume instead of tearing it
      // down — so the corrected selector lands on the same DOM the recovery request describes.
      // Only for single-run selector/verify failures with agent recovery enabled; auth/cancel
      // and Studio-ceiling failures are terminal and clean up normally.
      const parkable = page && AGENT_RECOVERY_ENABLED && resolved.length === 1
        && typeof runErr.failedAt === "number" && !runErr.session_expired && !runErr.cancelled;
      if (parkable) {
        const timer = setTimeout(() => { _discardPark("ttl"); }, PARK_TTL_MS);
        if (timer.unref) timer.unref();
        _parkedRecovery = { slug: primary.entry.slug, company: primary.entry.company,
          page, context: _context, browser: _browser, watch, failedAt: runErr.failedAt, timer };
        appendRecoveryEvent({ event: "recovery_park_created", slug: primary.entry.slug, step_index: runErr.failedAt, ttl_ms: PARK_TTL_MS });
        log("info", "recovery_park_created", { skill: primary.entry.slug, step_index: runErr.failedAt });
      } else {
        if (page) await page.close().catch(() => {});
        if (watch) {
          await _context?.close().catch(() => {});
          await _browser?.close().catch(() => {});
        }
      }
      return failResp;

    } finally {
      if (_abortSignal) _abortSignal.removeEventListener("abort", _onAbort);
      activeExecution = null;
    }
  }

  // ── skill_{company}_{slug} — direct skill execution without discovery round-trip ──
  if (name.startsWith("skill_")) {
    const withoutPrefix = name.slice(6); // e.g. "render_create_a_service"
    const entry = Object.values(skillIndex).find(
      (e) => `${e.company}_${e.slug.replace(/-/g, "_")}` === withoutPrefix
    );
    if (!entry) return err(`Skill tool not found: ${name}. Call list_skills to see available skills.`);
    return _handleTool("execute_skill", {
      skill:   entry.slug,
      company: entry.company,
      inputs:  args,
      watch:   true,
    });
  }

  return err(`Unknown tool: ${name}`);
}

// MCP registration is written to claude_desktop_config.json (and ~/.claude.json if present)
// by the NSIS installer via PowerShell at install time.

async function _phonehome() {
  const companies = [...new Set(Object.values(skillIndex).map(s => s.company))];
  const body = JSON.stringify({
    runtime_version: RUNTIME_VERSION,
    companies,
    platform: process.platform,
    install_id: INSTALL_ID,
  });
  await new Promise((resolve) => {
    const req = https.request(`${CONXA_API}/api/v1/telemetry/runtime-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => { res.resume(); resolve(); });
    req.on("error", resolve);
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}
