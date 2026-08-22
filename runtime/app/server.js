#!/usr/bin/env node
"use strict";
const path   = require("path");
const fs     = require("fs");
const os     = require("os");
const httpClient = require("./http_client");
const hostBridge = require("./host_bridge");
const semver = require("./host_bridge").hostRequire("semver");
const { loadInstallId } = require("./install_identity");
const { installedSkillVersions } = require("./installed_versions");
const { collectSyncErrors } = require("./sync_errors");
const pageScripts = require("./page_scripts");

// ─── 1. Resolve CONXA_DIR (install, read-only) and CONXA_DATA_DIR (user-writable) ─
// env.js is the single source of truth for dev/prod path roots. Under the host exe,
// bootstrap.js ran env.apply() before loading this file, so process.env already holds
// the resolved values and the || fallbacks never fire; they exist for standalone dev
// mode (`node server.js`), where resolve() re-derives the same per-env defaults.
const _envInfo       = hostBridge.env();
const CONXA_DIR      = process.env.CONXA_DIR || _envInfo.conxaDir;
const CONXA_DATA_DIR = process.env.CONXA_DATA_DIR || _envInfo.dataDir;

const SKILL_PACKS_DIR = path.join(CONXA_DIR, "skill-packs");
const CACHE_DIR       = path.join(CONXA_DATA_DIR, "cache");
const SESSIONS_DIR    = path.join(CACHE_DIR, "sessions");
const LOG_FILE        = path.join(CONXA_DATA_DIR, "logs", "runtime.log");
const RUNTIME_VERSION = hostBridge.runtimeVersion(process.env.CONXA_DEV_RUNTIME_VERSION);
// scripts/build-runtime-local.ps1 and the checked-in package.json both stamp
// unreleased builds as "0.0.0-local.<timestamp>" / "0.0.0-dev" — there is no
// real release number to compare against, so required_runtime gates (which
// assume a real semver floor like ">=1.0.3") are meaningless here and must
// not block local testing.
const IS_LOCAL_DEV_RUNTIME = RUNTIME_VERSION.startsWith("0.0.0-");
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
// State + page-fingerprint helpers live in recovery_park.js; see that file's
// header for why the failed page is parked instead of torn down.
const { PARK_DIVERGENCE_TOLERANCE, capturePageFingerprint } = require("./recovery_park");
const _getParkedRecovery  = require("./recovery_park").getParked;
const _setParkedRecovery  = require("./recovery_park").setParked;
const _discardParkImpl    = require("./recovery_park").discardPark;
const PARK_TTL_MS = Number(process.env.CONXA_RECOVERY_PARK_TTL_MS) || 180000;
function _discardPark(reason) { return _discardParkImpl(reason, log); }

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
  // Extracted verbatim to cli_installer.js — runs and exits the process.
  require("./cli_installer").runInstallPlaywright(CONXA_DIR);
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
let stepAssertions;
let frameScopedInventory;
let uniqueDownloadName;
let sweepOldRuns;
let extractZipOnce;
let getCachedBrowser;
let captureReAuth;
let gracefulShutdown;
let createTracker;
let mapErrorToCode;
let closeExtraTabs;

try {
  ({ Server }               = hostBridge.hostRequire("@modelcontextprotocol/sdk/server/index.js"));
  ({ StdioServerTransport } = hostBridge.hostRequire("@modelcontextprotocol/sdk/server/stdio.js"));
  ({ CallToolRequestSchema, ListToolsRequestSchema } = hostBridge.hostRequire("@modelcontextprotocol/sdk/types.js"));

  skillLoader  = require("./skill_loader");
  sync         = require("./sync");
  authManager  = require("./auth_manager");
  ({ runPlan, enrichStepsWithRecovery, applyStepOverrides, appendRecoveryEvent, clearRetryBudget, checkRetryBudget, isAuthFailure, stepAssertions, frameScopedInventory, uniqueDownloadName, sweepOldRuns, extractZipOnce } = require("./run"));
  ({ getCachedBrowser, captureReAuth, gracefulShutdown } = require("./browser"));
  ({ createTracker, mapErrorToCode } = require("./tracker"));
  ({ closeExtraTabs } = require("./tabs"));
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

// ─── 9. Runtime self-update — unified signed manifest ────────────────────────
// One Ed25519-signed manifest.json (see runtime/manifest_manager.js) replaces the old
// two-endpoint _checkHostUpdate()/_checkAppUpdate() cold-start checks. Both host and
// app updates land in their own versioned directory (conxa-runtime/<version>/,
// conxa-app/<version>/) with a `current` junction flipped by version_manager.js —
// there is no .bak/.next staging or update.bat dance anymore.
//
// The conxa_app leg now runs pre-load, in bootstrap.js, before server.js is ever
// require()'d — so a pushed app update takes effect THIS launch instead of the next
// one. Only the conxa_runtime leg still runs here: this process IS the running host
// exe, so it can never replace itself — that update can only ever take effect on the
// next cold start, same as before.
const CONXA_API = process.env.CONXA_API_URL || "https://apis.conxa.in";
const manifestManager = require("./manifest_manager");

async function _checkForUpdates() {
  if (process.env.CONXA_SKIP_SELF_UPDATE === "1") return;
  await manifestManager.checkForUpdates({
    apiUrl: CONXA_API,
    conxaDir: CONXA_DIR,
    installId: INSTALL_ID,
    // Pull only this install's update channel — dev installs never see stable, and
    // deployed prod installs never see dev prereleases. Defaults to stable.
    channel: process.env.CONXA_UPDATE_CHANNEL || "stable",
    publicKeyB64: hostBridge.manifestPublicKey(),
    components: ["conxa_runtime"],
    // bootstrap.js's pre-load app-update check already fetched the manifest once this
    // launch (see global.__conxaManifest) — reuse it instead of fetching again.
    manifest: hostBridge.preloadedManifest(),
    log,
  });
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

      // One manifest fetch decides both host and app updates now, instead of two
      // separate unsigned endpoint checks. App-layer activation only affects the
      // *next* cold start (this process already has server.js in its module cache),
      // so it never blocks the execution gate any more than the old check did.
      _checkForUpdates()
        .then(()  => { syncState.appDone = true; })
        .catch(e  => { log("warn", "update_check_skipped", { reason: e.message }); syncState.appDone = true; }),

      // Re-encrypt any plaintext session files left by prior keytar failures (SG-11).
      authManager.reencryptPlaintextSessions(SESSIONS_DIR, authManager.getSessionKey, log)
        .catch(e => { log("warn", "plaintext_reencryption_sweep_failed", { reason: e.message }); }),
    ]);
  } finally {
    syncState.complete = true;
    skillIndex = skillLoader.loadSkillRegistry(SKILL_PACKS_DIR, CACHE_DIR);
    log("info", "sync_complete", { count: Object.keys(skillIndex).length });
    server.sendToolListChanged().catch(() => {});
  }

  _phonehome().catch(() => {});
})();

// ─── 12. Graceful shutdown ────────────────────────────────────────────────────
process.on("SIGINT",  () => gracefulShutdown());
process.on("SIGTERM", () => gracefulShutdown());
// Windows callers (e.g. Build Studio's test harness) can't deliver SIGTERM — Popen.terminate()
// there is an unconditional TerminateProcess with no signal handler run. They close stdin first
// instead; react to that the same way so browser.close() still runs before the process exits.
process.stdin.on("end", () => gracefulShutdown());

// Reads a skill's declared input fields (inputs.json, falling back to legacy input.json).
// Shared by the tool-definition builder, get_skill_inputs, and the execute_skill input gate
// so all three agree on the same declared schema.
function _readDeclaredInputs(entry) {
  const inputsPath = path.join(entry.skillDir, "inputs.json");
  const legacyPath = path.join(entry.skillDir, "input.json");
  try {
    const src = fs.existsSync(inputsPath) ? inputsPath : (fs.existsSync(legacyPath) ? legacyPath : null);
    if (src) {
      const raw = JSON.parse(fs.readFileSync(src, "utf8"));
      if (Array.isArray(raw.inputs)) return raw.inputs;
    }
  } catch (_) {}
  return [];
}

// ─── Skill-specific tool definitions (generated from loaded skill index) ─────
// One tool per installed skill so Claude can match intent directly without
// a discovery round-trip. Tool names: skill_{company}_{slug_underscored}.
function _skillToolDefinitions() {
  const tools = [];
  for (const entry of Object.values(skillIndex)) {
    const inputFields = _readDeclaredInputs(entry);

    const properties = {};
    const required = [];
    for (const f of inputFields) {
      const prop = { type: f.type || "string", description: f.description || f.name };
      // A select input's declared choices reach the agent as an enum so it can't pass an
      // out-of-range value that nothing would otherwise reject until execution (audit H-6).
      if (Array.isArray(f.enum) && f.enum.length) prop.enum = f.enum;
      properties[f.name] = prop;
      // A field with a default is effectively optional to the calling agent — the execute
      // gate below fills it in from f.default when omitted, so don't advertise it as
      // mandatory (audit H-6). Same for a field the editor explicitly marked optional.
      const hasDefault = f.default !== undefined && f.default !== null && String(f.default).trim() !== "";
      if (!hasDefault && !f.optional) required.push(f.name);
    }

    const needsStr = required.length ? ` Needs: ${required.join(", ")}.` : "";
    tools.push({
      name: `skill_${entry.workspace_id}_${entry.slug.replace(/-/g, "_")}`,
      description: `Conxa: ${entry.manifest.name || entry.slug} on ${entry.workspace_id}. ${entry.manifest.description || ""}${needsStr}`,
      inputSchema: { type: "object", properties, required },
    });
  }
  return tools;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
// Static core-tool definitions live in tool_defs.js; skill-specific tools are
// generated per-install from the loaded skill index below.
function _toolDefinitions() {
  return [...require("./tool_defs").CORE_TOOL_DEFS, ..._skillToolDefinitions()];
}

// ─── Resolve skill from index ─────────────────────────────────────────────────
function _resolveSkill(skillSlug, workspace_id) {
  if (!skillSlug) return null;
  const normalSlug = skillSlug.replace(/-/g, "_");

  // Exact match
  if (workspace_id) {
    const entry = skillIndex[`${workspace_id}:${skillSlug}`];
    if (entry) return entry;
    // Try underscore/dash normalization
    for (const v of Object.values(skillIndex)) {
      if (v.workspace_id === workspace_id && v.slug.replace(/-/g, "_") === normalSlug) return v;
    }
  }

  // Slug-only match across all workspaces
  for (const v of Object.values(skillIndex)) {
    if (v.slug === skillSlug || v.slug.replace(/-/g, "_") === normalSlug) return v;
  }
  return null;
}

// ─── Sync status per workspace ──────────────────────────────────────────────────
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



// ─── Build failure response ───────────────────────────────────────────────────
// Payload assembly lives in failure_response.js (extracted verbatim so the
// Tier 3/4 prompt text is unit-testable without loading this server). This
// wrapper binds the late-assigned module state (appendRecoveryEvent,
// stepAssertions, frameScopedInventory are set inside the SDK try block above;
// activeExecution is mutable run state) at call time.
async function _buildFailureResponse(page, errObj, resolvedEntry, runTracker, steps = null) {
  return require("./failure_response").buildFailureResponse(
    page, errObj, resolvedEntry, runTracker, steps,
    {
      agentRecoveryEnabled: AGENT_RECOVERY_ENABLED,
      maxRecoveryTier: MAX_RECOVERY_TIER,
      sentVisualRefs: activeExecution && activeExecution.sentVisualRefs,
      appendRecoveryEvent,
      stepAssertions,
      frameScopedInventory,
    }
  );
}

// ─── Tool handler ─────────────────────────────────────────────────────────────
async function _handleTool(name, args, extra) {
  const text = (t) => ({ content: [{ type: "text", text: t }] });
  const err  = (t) => text(t);

  // ── list_skills ──────────────────────────────────────────────────────────────
  if (name === "list_skills") {
    const filterWorkspace = args.workspace_id ? String(args.workspace_id) : null;
    const skills = Object.values(skillIndex)
      .filter(s => !filterWorkspace || s.workspace_id === filterWorkspace)
      .map(s => ({
        skill:           s.slug,
        workspace_id:         s.workspace_id,
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
    const entry = _resolveSkill(String(args.skill || ""), args.workspace_id ? String(args.workspace_id) : null);
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

    // NOTE: the old `update_pending` field (update-pending.json) is gone — nothing
    // has written that file since the manifest-driven self-update replaced the
    // .bat/.bak update dance, so it always reported null.

    const packsMap = {};
    for (const entry of Object.values(skillIndex)) {
      const ws = entry.workspace_id;
      if (!packsMap[ws]) {
        packsMap[ws] = {
          workspace_id: ws,
          skill_pack_version: entry.pack?.skill_pack_version || "unknown",
          required_runtime: entry.pack?.required_runtime || "unknown",
          skills: [],
        };
      }
      packsMap[ws].skills.push(entry.slug);
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
    }, null, 2));
  }

  // ── execute_skill / execute_sequence ─────────────────────────────────────────
  if (name === "execute_skill" || name === "execute_sequence") {
    const watch = args.watch !== false;
    const runs = name === "execute_sequence"
      ? (Array.isArray(args.skills) ? args.skills : [])
      : [{ skill: args.skill, workspace_id: args.workspace_id, inputs: args.inputs, resume_from: args.resume_from, step_overrides: args.step_overrides }];

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
    let _overrideAppliedCount = 0;
    for (const run of runs) {
      const entry = _resolveSkill(String(run.skill || ""), run.workspace_id ? String(run.workspace_id) : null);
      if (!entry) return err(`Skill not found: ${run.skill}. Call list_skills.`);

      // Integrity gate
      try {
        skillLoader.verifySkillIntegrity(entry.skillDir, entry.manifest, entry.slug);
      } catch (integrityErr) {
        // Trigger background re-sync
        sync.syncSkillPacks(SKILL_PACKS_DIR, { timeoutMs: 4000, log: (m) => log("info", m) })
          .then(() => { skillIndex = skillLoader.loadSkillRegistry(SKILL_PACKS_DIR, CACHE_DIR); })
          .catch(() => {});
        return err(`Skill integrity check failed: ${integrityErr.message}. A background re-sync has been triggered — please retry in a moment.`);
      }

      // Runtime compatibility
      const required = entry.manifest.required_runtime || ">=0.0.0";
      if (!IS_LOCAL_DEV_RUNTIME && !semver.satisfies(RUNTIME_VERSION, required))
        return err(`Skill ${run.skill} requires runtime ${required}, installed: ${RUNTIME_VERSION}. Please update the Conxa runtime.`);

      // Required-input gate (audit finding C2): interpolate() silently substitutes "" for a
      // missing/mis-typed input, so a required field the caller forgot would fail silently
      // deep inside a step instead of here, with a clear message. Declared defaults (H2) fill
      // in first so a default-satisfied required field is never reported missing.
      const declaredInputs = _readDeclaredInputs(entry);
      const providedInputs = (run.inputs && typeof run.inputs === "object") ? run.inputs : {};
      const effectiveInputs = {};
      for (const f of declaredInputs) {
        if (f && f.name && f.default !== undefined && f.default !== null && f.default !== "") {
          effectiveInputs[f.name] = f.default;
        }
      }
      Object.assign(effectiveInputs, providedInputs);
      const missingInputs = (entry.manifest.inputs_required || []).filter((n) => {
        const v = effectiveInputs[n];
        return v === undefined || v === null || String(v).trim() === "";
      });
      if (missingInputs.length) {
        return err(`Skill ${run.skill} is missing required input(s): ${missingInputs.join(", ")}. Call get_skill_inputs first.`);
      }
      run.inputs = effectiveInputs;

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
        _overrideAppliedCount += overrideCount;
      }

      // `resume_from: 0` is a legitimate resume (the failed step was the very first one) and must
      // stay distinguishable from "no resume_from given" (a fresh run) — both normalize to index 0,
      // so track explicitness separately rather than testing `resumeFrom > 0` downstream.
      const isResume = Number.isInteger(run.resume_from) && run.resume_from >= 0;
      resolved.push({
        entry,
        steps,
        inputs:     (run.inputs && typeof run.inputs === "object") ? run.inputs : {},
        resumeFrom: isResume ? run.resume_from : 0,
        isResume,
      });
    }

    // Retry budget check on resume
    const primary = resolved[0];

    // Auth pre-flight must cover every skill in the sequence, not just the first — a run with
    // 2+ skills shares one browser/context (see getCachedBrowser below, keyed off primary.entry
    // .workspace_id for the whole sequence), so an app only the SECOND skill needs was previously
    // never gated on before step 0 of the FIRST skill ran, discovering it expired mid-sequence
    // instead of pre-flight. Union every skill's required_apps; if any skill's manifest predates
    // the required_apps field (undefined = legacy "gate on every app"), the whole union falls
    // back to that same safe legacy behavior rather than silently narrowing to only the skills
    // that do declare it.
    const _requiredAppIdsUnion = resolved.some((r) => !Array.isArray(r.entry.manifest.required_apps))
      ? undefined
      : Array.from(new Set(resolved.flatMap((r) => r.entry.manifest.required_apps)));
    if (primary.isResume && !checkRetryBudget(primary.entry.slug, primary.resumeFrom))
      return err(`Retry budget exhausted at step ${primary.resumeFrom}. Fix the root cause in execution.json before retrying from step 0.`);

    // Acquire execution lock
    activeExecution = {
      slug:            primary.entry.slug,
      workspace_id:    primary.entry.workspace_id,
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

    log("info", "execute_start", {
      tool: name,
      run_count: resolved.length,
      skill: primary.entry.slug,
      workspace_id: primary.entry.workspace_id,
      total_steps: resolved.reduce((n, r) => n + r.steps.length, 0),
      watch,
      max_recovery_tier: MAX_RECOVERY_TIER,
      tracking: _trackingStatus(primary.entry.pack),
    });

    // Set up lightweight tracker for this execution
    const _tracker    = createTracker(primary.entry.pack?.tracking || {}, {
      runtime_version: RUNTIME_VERSION,
      workflow_id:      primary.entry.slug,
      workflow_version: primary.entry.manifest?.version || "0",
      company_id:      primary.entry.workspace_id,
      log,
    });
    const _runId      = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const _runTracker = _tracker.forRun(_runId, { uid: INSTALL_ID, wid: "" });
    const _wfStartAt  = Date.now();
    let   _totalRecovered = 0;
    if (_overrideAppliedCount) _runTracker.emit("override_applied", { n: _overrideAppliedCount });

    // Signal agent-mediated recovery retry (Tier 3/4) when resuming mid-plan.
    if (primary.isResume) {
      const hasOverride = AGENT_RECOVERY_ENABLED && primary.steps[primary.resumeFrom] && primary.steps[primary.resumeFrom]._agent_override;
      _runTracker.emit("rec_start", { si: primary.resumeFrom, l: hasOverride ? 3 : 5, sc: hasOverride ? "agent_override" : "llm_intent" });
    }
    _runTracker.emit("wf_start", {});

    // Adopt a parked failed page when the agent is resuming THIS skill with an override, so the
    // corrected selector acts on the exact DOM state the recovery request was built from.
    const _resumeOverride = AGENT_RECOVERY_ENABLED && resolved.length === 1 && primary.isResume
      && primary.steps[primary.resumeFrom] && primary.steps[primary.resumeFrom]._agent_override;
    let _park = null;
    const _existingPark = _getParkedRecovery();
    if (_resumeOverride && _existingPark
        && _existingPark.slug === primary.entry.slug
        && _existingPark.workspace_id === primary.entry.workspace_id) {
      try {
        _existingPark.page.url();
        // The recovery request described the page as it stood at park time. If it has since
        // navigated or its interactive-element count shifted materially (a timer, websocket
        // push, or unrelated re-render), the agent's corrected selector would be acting on a
        // page it never actually reasoned about — discard rather than silently trust it.
        const currentFp = await capturePageFingerprint(_existingPark.page);
        const parkedFp  = _existingPark.pageFingerprint;
        const diverged = !currentFp || !parkedFp
          || currentFp.url !== parkedFp.url
          || Math.abs(currentFp.interactiveCount - parkedFp.interactiveCount) > PARK_DIVERGENCE_TOLERANCE;
        if (diverged) {
          appendRecoveryEvent({ event: "recovery_park_state_mismatch", slug: primary.entry.slug, step_index: primary.resumeFrom });
        } else {
          _park = _existingPark;
        }
      } catch (_) { _park = null; }
      if (_park) { clearTimeout(_park.timer); _setParkedRecovery(null); }
    }
    // Any park we did not adopt is stale (different skill, dead page, diverged state, or a
    // non-resume run) — discard it so it can neither leak a browser nor interfere with this run.
    if (_getParkedRecovery()) await _discardPark(_resumeOverride ? "replaced" : "superseded");

    // An agent override with no live, state-matching park to resume on (TTL expired, page
    // crashed, or state diverged) must never silently continue mid-plan on a fresh page — the
    // override was chosen against a DOM state that no longer exists, so applying it to a
    // blank/different page could act on the wrong element. Refuse and ask the agent to restart.
    // This exits before the try/finally below that normally clears activeExecution and flushes
    // the tracker, so both must be torn down by hand here — otherwise every execute_skill call
    // after the first refused resume would see "Execution already running" forever.
    if (_resumeOverride && !_park) {
      appendRecoveryEvent({ event: "recovery_resume_refused", slug: primary.entry.slug, step_index: primary.resumeFrom });
      _runTracker.emit("wf_fail", { dur: Date.now() - _wfStartAt, fsi: primary.resumeFrom, fc: "recovery_resume_refused" });
      if (_abortSignal) _abortSignal.removeEventListener("abort", _onAbort);
      activeExecution = null;
      await _tracker.flush();
      _tracker.destroy();
      return err(
        `The recovery window for step ${primary.resumeFrom + 1} has expired or the page state has changed ` +
        `since the recovery request was issued. Call execute_skill again for "${primary.entry.slug}" without ` +
        `resume_from to restart the skill from the beginning.`
      );
    }

    let page = null;
    let _browser, _context, _protectedUrl;
    // EXEC-14: track every tab opened during this run (populated once `_context` is known,
    // below) so closeExtraTabs (tabs.js) can close it alongside `page` on every exit path —
    // success, cancelled, session-expired, and non-parkable failure all need this, not just
    // success, so it's declared here rather than inside the try block, where the catch block
    // below couldn't see it.
    const _openedTabs = new Set();
    try {
      if (_park) {
        ({ browser: _browser, context: _context } = _park);
        page = _park.page;
        log("info", "recovery_park_resumed", { skill: primary.entry.slug, step_index: primary.resumeFrom });
        appendRecoveryEvent({ event: "recovery_park_resumed", slug: primary.entry.slug, step_index: primary.resumeFrom });
        _runTracker.emit("park_resumed", { si: primary.resumeFrom });
      } else {
        const _authResult = await getCachedBrowser(primary.entry.workspace_id, authManager, {
          headless: !watch,
          logFn: log,
          groupId: primary.entry.manifest && primary.entry.manifest.group_id,
          requiredAppIds: _requiredAppIdsUnion,
        });
        if (_authResult.authPending) {
          // No valid session — a login window was just opened for the user. Nothing ran yet,
          // so there's no failedAt/page to report; the outer catch below turns this into an
          // actionable "sign in, then re-run" response instead of a raw failure.
          throw Object.assign(new Error(_authResult.message),
            { session_expired: true, login_url: _authResult.loginUrl });
        }
        ({ browser: _browser, context: _context, protectedUrl: _protectedUrl } = _authResult);
        page = await _context.newPage();
        // Packs compiled after the leading-navigate change (compiler/build.py
        // _insert_start_navigate_step) open with their own `navigate` step to the page they
        // were recorded on, so landing on _protectedUrl (the group app's landing page) first is
        // a wasted page load — and, when the two are different sites, a misleading one. Older
        // packs have no such step and still need this. The auth storage state is already loaded
        // into _context above either way, so the skill's own navigation is authenticated with
        // no re-login.
        if (_protectedUrl && primary.steps[0]?.type !== "navigate") {
          await page.goto(_protectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        }
      }

      const runtimeLog = { consoleErrors: [], pageErrors: [], failedRequests: [] };
      // Isolated per-run workspace, not the OS Downloads folder and not CONXA_DIR (that's the
      // read-only install dir — see the header comment above). sweepOldRuns() clears stale
      // sibling run dirs before this one is created, so cleanup happens on every execution
      // regardless of how the *previous* run ended.
      const _runsBaseDir = path.join(CONXA_DATA_DIR, "runs");
      sweepOldRuns(_runsBaseDir, undefined, _runId);
      const _downloadsDir = path.join(_runsBaseDir, _runId);
      const _downloads = [];
      const _downloadSaves = [];
      const _downloadQueue = [];

      const _takenNames = new Set();

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
          // Reserved synchronously, before the async save — see uniqueDownloadName (EXEC-11).
          const fname = uniqueDownloadName(download.suggestedFilename() || `download_${Date.now()}`, _takenNames);
          const savePromise = (async () => {
            fs.mkdirSync(_downloadsDir, { recursive: true });
            const dest = path.join(_downloadsDir, fname);
            await download.saveAs(dest);
            _downloads.push(dest);
            // Extraction happens here — at download time, unconditionally — not lazily when
            // some later upload step happens to resolve to a .zip path. Keeps replay symmetric
            // with recording (session.py::_on_download does the same) and lets the compiler's
            // {{downloaded_file_N_dir}} binding point at a folder that's already real by the
            // time any step needs it. See run.js::resolveUploadPaths for the upload-side half.
            const extractedDir = fname.toLowerCase().endsWith(".zip") ? extractZipOnce(dest) : null;
            resolveEntry({ filename: fname, path: dest, extractedDir });
          })().catch(() => { resolveEntry(null); });
          _downloadSaves.push(savePromise);
        });
      };

      _attachPageListeners(page);
      // Multi-tab: a download (or console/page error) triggered from a tab other than the
      // initial one used to be invisible entirely — this listener was only ever attached to
      // `page`. Every tab opened during this run (site-opened or Ctrl+T — see tabs.js) now gets
      // the same diagnostics/download capture the initial tab has.
      _context.on("page", _attachPageListeners);
      // Feeds _openedTabs (declared above, outside this try block, so every exit path's
      // closeExtraTabs(_openedTabs, ...) call below can see it). Never fires for `page` itself
      // (created via _context.newPage() before this listener attaches) or for a page from a
      // resumed park (opened in a prior call's closure) — only genuinely new tabs opened by
      // *this* run's steps land here.
      _context.on("page", (pg) => { _openedTabs.add(pg); });

      for (let si = 0; si < resolved.length; si++) {
        const { entry, steps, inputs, resumeFrom } = resolved[si];
        const startAt = si === 0 ? resumeFrom : 0;
        // Backs a compiled bulk-upload step's {{downloaded_files_dir}} placeholder (see
        // conxa_compile/compiler/upload_binding.py's _BindingState) — resolveUploadPaths already
        // expands a folder into every file inside it, so this run's own isolated download folder
        // just works.
        inputs.downloaded_files_dir = _downloadsDir;

        try {
          const result = await runPlan(page, steps, inputs, startAt, entry.slug, {
            onStep:        (i) => { if (activeExecution) activeExecution.step = i; },
            cancelCheck:   _execCancelled,
            tracker:       _runTracker,
            downloadQueue: _downloadQueue,
            structuralFingerprint: entry.manifest && entry.manifest.structural_fingerprint,
            watch,
          });
          _totalRecovered += (result && result.recoveredSteps) ? result.recoveredSteps : 0;
        } catch (runErr) {
          // Auth-failure handling: detect a login redirect and fail immediately, naming the
          // app whose session died. Authentication is pre-flight only — no re-auth window
          // opens here. The next execute_skill call's normal pre-flight gate (getGroupAuthContext)
          // re-validates this exact app and opens its login window then; see captureReAuth's
          // comment in browser.js for why that's deliberate, not a missing feature.
          const failedStep = runErr.failedAt ?? null;
          // Multi-tab: check auth on the tab the step actually failed on, not always the
          // initial tab — a login redirect in a second tab would otherwise go undetected.
          const _failedPage = runErr.failedPage || page;
          if (failedStep !== null && await isAuthFailure(_failedPage)) {
            // The page that actually bounced to a login screen is the right host to resolve
            // the dead app from — for a group pack, entry.manifest.target_url is the START
            // app, which is wrong when a SIBLING app's session is the one that died (see
            // CLAUDE.md group-auth notes / captureReAuth's host-matching fallback chain).
            const loginUrl = _failedPage.url() || entry.manifest?.login_url || entry.manifest?.target_url || entry.manifest?.entry_url;
            appendRecoveryEvent({ event: "auth_failure_detected", slug: entry.slug, step_index: failedStep });
            const refreshResult = await captureReAuth(entry.workspace_id, loginUrl, authManager, SESSIONS_DIR, log, {
              groupId: entry.manifest && entry.manifest.group_id,
              fallbackUrl: entry.manifest?.target_url,
            });
            throw Object.assign(
              new Error(refreshResult.message),
              {
                session_expired: true,
                login_url: refreshResult.loginUrl || loginUrl,
                failedAt: failedStep,
                fromEntry: entry,
                // No window was opened for this failure (see captureReAuth) — the shared
                // session_expired handler below must not tell the user "once signed in", since
                // nothing has prompted them to sign in yet at this point.
                authWindowOpened: false,
              }
            );
          }
          runErr.fromEntry = entry;
          throw runErr;
        }
      }

      // Success — save session. Encrypt via the per-machine keytar-backed key;
      // only fall back to a plaintext write if encryption itself fails (SG-11).
      // Skipped for a Workflow Group run: the context holds N apps' sessions
      // merged together, and dumping that back under the single company key
      // would blur per-app boundaries — each app's own session is refreshed
      // independently via getGroupAuthContext's per-app validate/re-auth.
      const _isGroupRun = !!(primary.entry.manifest && primary.entry.manifest.group_id);
      if (!_isGroupRun) {
        const state = await _context.storageState();
        try {
          const sessionKey = await authManager.getSessionKey(primary.entry.workspace_id, log);
          const encrypted = authManager.saveEncryptedSession(primary.entry.workspace_id, state, sessionKey, SESSIONS_DIR, log);
          if (!encrypted) authManager.saveRawSession(primary.entry.workspace_id, state, SESSIONS_DIR, log);
        } catch (_) {
          authManager.saveRawSession(primary.entry.workspace_id, state, SESSIONS_DIR, log);
        }
      }

      const url  = page.url();
      const shot = process.env.CONXA_CAPTURE_SUCCESS_SCREENSHOT === "1"
        ? await page.screenshot({ type: "png" }).catch(() => null)
        : null;
      await Promise.allSettled(_downloadSaves);
      await page.close().catch(() => {});
      await closeExtraTabs(_openedTabs);
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
      // Flush happens once, in `finally`, for every exit path — see there.

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
      // Do NOT flush/destroy the tracker here — the Tier 3/4 recovery-request and
      // park-created events (below, and inside _buildFailureResponse) haven't been emitted
      // yet. Tearing the tracker down this early silently drops that telemetry. The tracker
      // is flushed once, in `finally`, after every code path in this catch block has had a
      // chance to emit.

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
        await closeExtraTabs(_openedTabs);
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

      // Session expiry is a distinct condition, not a selector/DOM failure — no screenshot,
      // no recovery payload, just a clear instruction to sign in and re-run. Handled here
      // rather than in _buildFailureResponse because the pre-run auth-pending case (session
      // expired before any step ran) never has a `page` to build a response around.
      if (runErr.session_expired) {
        if (page) await page.close().catch(() => {});
        await closeExtraTabs(_openedTabs);
        if (watch) {
          await _context?.close().catch(() => {});
          await _browser?.close().catch(() => {});
        }
        const failedAt = typeof runErr.failedAt === "number" ? runErr.failedAt : null;
        // A mid-run failure (authWindowOpened: false — see captureReAuth) never opened a
        // window; runErr.message already tells the caller to call execute_skill again to get
        // prompted. Only add the resume_from mechanics there, not "once signed in" — nobody's
        // been prompted to sign in yet. The pre-flight case (authWindowOpened left undefined —
        // a window WAS just opened before any step ran) keeps the original "once signed in" hint.
        const resumeHint = runErr.authWindowOpened === false
          ? (AGENT_RECOVERY_ENABLED && failedAt !== null
              ? ` Pass resume_from: ${failedAt} on that next call to continue from where this one stopped.`
              : "")
          : (AGENT_RECOVERY_ENABLED && failedAt !== null
              ? ` Once signed in, call execute_skill again for "${(runErr.fromEntry || primary.entry).slug}" with resume_from: ${failedAt}.`
              : ` Once signed in, call execute_skill again to run this skill.`);
        return err(`${runErr.message}${resumeHint}`);
      }

      // Multi-tab: use the tab the failing step actually ran on, not always the initial tab —
      // the recovery request (and its DOM fingerprint) must describe the page that failed.
      const _failedPage = runErr.failedPage || page;

      const failResp = _failedPage
        ? await _buildFailureResponse(_failedPage, runErr, runErr.fromEntry || primary.entry, _runTracker, resolved.length === 1 ? primary.steps : null)
        : err(runErr.message);

      // Park the live failed page for an agent-mediated (Tier 3/4) resume instead of tearing it
      // down — so the corrected selector lands on the same DOM the recovery request describes.
      // Only for single-run selector/verify failures with agent recovery enabled; auth/cancel
      // and Studio-ceiling failures are terminal and clean up normally.
      const parkable = _failedPage && AGENT_RECOVERY_ENABLED && resolved.length === 1
        && typeof runErr.failedAt === "number" && !runErr.session_expired && !runErr.cancelled;
      if (parkable) {
        const timer = setTimeout(() => { _discardPark("ttl"); }, PARK_TTL_MS);
        if (timer.unref) timer.unref();
        _setParkedRecovery({ slug: primary.entry.slug, workspace_id: primary.entry.workspace_id,
          page: _failedPage, context: _context, browser: _browser, watch, failedAt: runErr.failedAt, timer,
          pageFingerprint: await capturePageFingerprint(_failedPage) });
        // Only the parked page survives — any other tab this run opened (the failure wasn't
        // necessarily on the newest tab) is closed now rather than left to leak.
        await closeExtraTabs(_openedTabs, _failedPage);
        appendRecoveryEvent({ event: "recovery_park_created", slug: primary.entry.slug, step_index: runErr.failedAt, ttl_ms: PARK_TTL_MS });
        log("info", "recovery_park_created", { skill: primary.entry.slug, step_index: runErr.failedAt });
        _runTracker.emit("park_created", { si: runErr.failedAt });
      } else {
        if (page) await page.close().catch(() => {});
        if (_failedPage && _failedPage !== page) await _failedPage.close().catch(() => {});
        await closeExtraTabs(_openedTabs);
        if (watch) {
          await _context?.close().catch(() => {});
          await _browser?.close().catch(() => {});
        }
      }
      return failResp;

    } finally {
      if (_abortSignal) _abortSignal.removeEventListener("abort", _onAbort);
      activeExecution = null;
      // Single flush point for every exit path (success, deadline, cancel, and the
      // Tier 3/4 recovery-request/park-created path) — guarantees every event emitted
      // above (wf_ok, wf_fail, tier_escalated, park_created, park_resumed, override_applied)
      // is actually sent before the tracker's timer is torn down.
      await _tracker.flush();
      _tracker.destroy();
    }
  }

  // ── skill_{company}_{slug} — direct skill execution without discovery round-trip ──
  if (name.startsWith("skill_")) {
    const withoutPrefix = name.slice(6); // e.g. "render_create_a_service"
    const entry = Object.values(skillIndex).find(
      (e) => `${e.workspace_id}_${e.slug.replace(/-/g, "_")}` === withoutPrefix
    );
    if (!entry) return err(`Skill tool not found: ${name}. Call list_skills to see available skills.`);
    return _handleTool("execute_skill", {
      skill:   entry.slug,
      workspace_id: entry.workspace_id,
      inputs:  args,
      watch:   true,
    });
  }

  return err(`Unknown tool: ${name}`);
}

// MCP registration (claude_desktop_config.json, ~/.claude.json, and every other
// detected agent host) is handled by `conxa-runtime.exe register-mcp` /
// `unregister-mcp` — see bootstrap.js, mcp_register.js, mcp_hosts.js, and
// config_edit.js. The NSIS installer just invokes the subcommand; it holds no
// config-editing logic of its own.

async function _phonehome() {
  const companies = [...new Set(Object.values(skillIndex).map(s => s.workspace_id))];
  const body = JSON.stringify({
    runtime_version: RUNTIME_VERSION,
    companies,
    platform: process.platform,
    install_id: INSTALL_ID,
    // Added for the release system's Deployment view (docs/App-Flow.md) — optional
    // server-side, so an older cloud that doesn't know this field yet is unaffected.
    skill_versions: installedSkillVersions(skillIndex),
    // Per-skill sync failures (checksum mismatch, download/activation error) —
    // lets the Deployment dashboard show "failed" instead of just "pending".
    sync_errors: collectSyncErrors(SKILL_PACKS_DIR),
    // Fleet-visibility fields (Machine Registry) — all optional server-side,
    // an older cloud that doesn't know them yet just ignores the extra keys.
    hostname: (() => { try { return os.hostname(); } catch (_) { return ""; } })(),
    username: (() => { try { return os.userInfo().username; } catch (_) { return ""; } })(),
    os_release: (() => { try { return os.release(); } catch (_) { return ""; } })(),
    os_arch: (() => { try { return os.arch(); } catch (_) { return ""; } })(),
    // Feature flags only, not a tool list — see docs/TRD.md Machine Registry note.
    capabilities: {
      max_recovery_tier: String(MAX_RECOVERY_TIER),
      update_channel: process.env.CONXA_UPDATE_CHANNEL || "stable",
    },
  });
  await new Promise((resolve) => {
    const req = httpClient.request(`${CONXA_API}/api/v1/telemetry/runtime-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => { res.resume(); resolve(); });
    req.on("error", resolve);
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}
