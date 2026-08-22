"use strict";
const path          = require("path");
const versionManager = require("../app/version_manager");

// Resolve the dev/prod environment FIRST and normalize process.env, so every
// disk-loaded layer (server.js, run.js, sync.js) and child spawn inherits the
// same isolated path roots + update channel. See env.js for the safety default.
const envInfo = require("../app/env").apply();
// Expose the resolved environment to disk-loaded layers without re-deriving it.
global.__conxaEnv = envInfo;

// Expose bundled npm modules and host metadata to disk-loaded app code. Must run
// before the register-mcp/unregister-mcp and sync early-return branches below —
// both dispatch straight into disk-loaded app-layer files (mcp_register.js ->
// config_edit*.js; cli_sync.js -> sync.js -> durable_context.js -> config_edit.js)
// that resolve npm packages via (global.__hostRequire || require)(...). Setting
// this up only after those branches left the fallback `require()` to look on
// disk, where packages like jsonc-parser/yaml/adm-zip don't exist — durable_context
// updates during install-time sync silently warned-and-skipped instead of writing
// their discoverability files (sync.js catches the failure, so it degrades rather
// than crashes, but the feature is dead without this).
// App JS files use (global.__hostRequire || require)('playwright') etc.
// __runtimeVersion lets server.js (loaded from disk) read the version baked
// into the host exe without doing require('./package.json') relative to conxa-app/current/.
// __versionManager lets every disk-loaded layer (app, skill sync) share the exact same
// junction-handling code the host uses, instead of shipping/duplicating their own copy.
// __manifestPublicKey lets manifest_manager.js (loaded from disk) verify the signed
// manifest without shipping the key itself in the app-layer zip — it's baked into
// the host exe at build time (same stamping step as host_version/version).
//
// The MCP SDK specifier rewrite: the SDK only exposes subpaths via its "exports"
// map, whose "./*" wildcard @yao-pkg/pkg cannot statically resolve, and its
// "type": "module" package.json stops pkg from bundling its .js files at all
// (host/vendor-sdk.js copies the CJS build to vendor/mcp-sdk-cjs/ at build time;
// package.json's pkg.scripts lists the entry points from there). Rewriting bare
// specifiers to those vendored real files — relative to THIS module, which lives
// in the snapshot — makes them work inside the exe. Dev mode never takes this
// branch: __hostRequire is only defined under the packaged exe, and plain Node
// resolves "@modelcontextprotocol/sdk/<sub>" through the exports map on its own.
function _sdkSpecifier(id) {
  const PREFIX = "@modelcontextprotocol/sdk";
  if (id !== PREFIX && !id.startsWith(`${PREFIX}/`)) return id;
  const sub = id === PREFIX ? "index.js" : id.slice(PREFIX.length + 1).replace(/^\.\//, "");
  return path.join(__dirname, "..", "vendor", "mcp-sdk-cjs", sub);
}
global.__hostRequire      = (id) => require(_sdkSpecifier(id));
global.__hostPkg          = !!process.pkg;
global.__runtimeVersion   = require("../package.json").version;
global.__versionManager   = versionManager;
global.__manifestPublicKey = require("../package.json").ed25519_public_key || "";

// `register-mcp` / `unregister-mcp` are host-exe-layer subcommands: they must
// work even when no app layer is installed yet (a thin installer stages this
// exe before the app layer is downloaded) and independent of the min_host
// gate below, so they run and exit here, before any app-layer resolution.
if (process.argv[2] === "register-mcp" || process.argv[2] === "unregister-mcp") {
  require("./mcp_register").run(process.argv);
  return;
}

const HOST_VERSION = require("../package.json").host_version || "host-v1.0.0";
const CONXA_DIR    = process.env.CONXA_DIR; // set by env.apply() above
// APP_ROOT is the component root (contains v1.0.0/, v1.1.0/, current/) — not the live dir itself.
const APP_ROOT = process.env.CONXA_APP_DIR;

// `sync` is an install-time-only subcommand: the NSIS installer's SkillPacks
// section already staged the app layer (SEC_RUNTIME runs first), so this just
// calls the same delta-sync server.js runs on every launch, but earlier and
// visibly, so a large enterprise pack downloads during install instead of
// stalling the first MCP tool call. Runs and exits here, same as
// register-mcp/unregister-mcp above.
if (process.argv[2] === "sync") {
  require("./cli_sync").run(CONXA_DIR, APP_ROOT, versionManager, HOST_VERSION);
  return;
}

// App-layer pre-load self-update. Unlike the conxa_runtime leg (still checked from
// server.js's startupSync, post-load — a running binary can't replace itself, and that
// leg's own download budget is generous because it isn't launch-blocking), this one runs
// BEFORE the app layer is require()'d below, so a newer conxa_app build takes effect on
// THIS launch instead of the next one. manifest_manager.js + http_client.js join
// version_manager.js as shared logic baked into the host exe (frozen until the next
// quarterly host release) specifically so it can run before any app layer exists on disk
// to load it from — see version_manager.js's header comment for the existing precedent.
const manifestManager = require("../app/manifest_manager");
const { loadInstallId } = require("../app/install_identity");

function _bootLog(level, event, data) {
  process.stderr.write(`[bootstrap] ${level} ${event} ${JSON.stringify(data || {})}\n`);
}

// Every failure path here (network down, bad signature, download failure, decode
// failure) is caught and swallowed — this must never block startup. Falling through
// just leaves `current` pointing at whatever it pointed at before, same as if this
// check never ran. Bounded to a few seconds by fetchManifest's 3s timeout and the
// tightened downloadArtifact retry budget below (60 KB zip; no need for the
// 2-minute-per-attempt default that server.js's post-load, non-blocking leg can afford).
async function _updateAppLayerBeforeLoad() {
  if (process.env.CONXA_SKIP_SELF_UPDATE === "1") return;
  // --selfcheck (manifest_manager.js's _selfcheck, used to verify a freshly-downloaded
  // host exe boots before conxa_runtime activates) must stay inert — a quick, read-only
  // "does this binary boot" smoke test, not a second update check. Without this, that
  // spawn would run this whole block too and could, in a rollout-timing race, actually
  // download and activate an app layer as a side effect of what's supposed to be a
  // no-op boot check.
  if (process.argv.includes("--selfcheck")) return;
  try {
    const installId = loadInstallId(envInfo.dataDir);
    const { manifest } = await manifestManager.checkForUpdates({
      apiUrl: envInfo.apiUrl,
      conxaDir: CONXA_DIR,
      installId,
      channel: envInfo.channel,
      publicKeyB64: global.__manifestPublicKey,
      hostVersion: HOST_VERSION,
      components: ["conxa_app"],
      appDownloadOptions: { maxRetries: 2, timeoutMs: 5000 },
      log: _bootLog,
    });
    // Let server.js's startupSync reuse this fetch for the conxa_runtime leg instead
    // of hitting the manifest endpoint a second time on the same launch.
    if (manifest) global.__conxaManifest = manifest;
  } catch (e) {
    _bootLog("warn", "app_update_skipped", { reason: e.message });
  }
}

// Thin wrapper over the pure gate in min_host_gate.js — same stderr strings,
// same fall-through-to-rollback contract. Kept here so bootstrap's control flow
// reads unchanged; see min_host_gate.js for the unit-tested implementation.
const { evaluateAppLayer } = require("./min_host_gate");

function tryLoad(dir) {
  const result = evaluateAppLayer(dir, HOST_VERSION, {
    loadEntry: (entry) => require(entry),
    warn: (message) => process.stderr.write(message),
  });
  return result.loaded;
}

(async () => {
  await _updateAppLayerBeforeLoad();

  // Re-resolve `current` — _updateAppLayerBeforeLoad may have just flipped it.
  const primaryDir = versionManager.resolveCurrent(APP_ROOT);
  if (!tryLoad(primaryDir)) {
    const rolledBack = versionManager.rollback(APP_ROOT);
    const fallbackDir = rolledBack ? versionManager.resolveCurrent(APP_ROOT) : null;
    if (fallbackDir && tryLoad(fallbackDir)) {
      process.stderr.write(
        `[bootstrap] primary app layer unusable — rolled back to ${fallbackDir}\n` +
        `  The app will re-download the latest version on next startup.\n`
      );
    } else {
      process.stderr.write(
        `[bootstrap] FATAL: no usable app layer found under ${APP_ROOT}\n` +
        `  Expected: ${path.join(APP_ROOT, "current", "server.js")}\n` +
        `  Reinstall or restore the conxa-app package.\n`
      );
      process.exit(1);
    }
  }
})();
