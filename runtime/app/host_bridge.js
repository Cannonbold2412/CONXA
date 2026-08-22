"use strict";
/**
 * host_bridge.js — the single access point for the host-exe globals that
 * bootstrap.js exposes to disk-loaded app-layer code (__hostRequire,
 * __versionManager, __conxaEnv, __runtimeVersion, __manifestPublicKey,
 * __conxaManifest, __hostPkg).
 *
 * Every consumer used to invent its own guard idiom
 * (`(global.__hostRequire || require)(...)`,
 *  `(typeof global !== "undefined" && global.__versionManager) ? ... : ...`, …).
 * A typo in any of them degraded silently to a disk fallback that only broke
 * in packaged prod. All idioms live here now, each preserving the exact
 * fallback its former call sites had.
 *
 * This file is APP-LAYER code: it must never depend on exports that only exist
 * in a NEW host release (deployed hosts are old; see AGENTS.md Key Invariants).
 */

// npm dep / host-builtin resolution: bundled copy inside the pkg exe when one
// exists, disk require otherwise (standalone dev mode, tests).
function hostRequire(id) {
  if (typeof global !== "undefined" && global.__hostRequire) return global.__hostRequire(id);
  return require(id);
}

// A require FUNCTION (not a resolved module) for call sites that hold on to it:
// `const _req = hostBridge.requireFn();`
function requireFn() {
  return (typeof global !== "undefined" && global.__hostRequire) ? global.__hostRequire : require;
}

// version_manager.js singleton — bootstrap shares the exact junction-handling
// instance the host uses; standalone runs/tests get the local copy.
function versionManager() {
  return (typeof global !== "undefined" && global.__versionManager)
    ? global.__versionManager
    : require("./version_manager");
}

// Resolved environment (env.apply() output). Under the host exe bootstrap ran
// env.apply() before loading this file, so this is always populated there;
// standalone dev mode re-derives via env.resolve().
function env() {
  return (typeof global !== "undefined" && global.__conxaEnv)
    ? global.__conxaEnv
    : require("./env").resolve();
}

// Version stamped into the host exe's package.json at build time.
// NOTE: the disk require is lazy and guarded — when running under the host
// exe, __runtimeVersion always exists and the app layer is loaded from a
// versioned directory whose parent has no package.json.
function runtimeVersion(devFallback) {
  if (typeof global !== "undefined" && global.__runtimeVersion) return global.__runtimeVersion;
  if (devFallback) return devFallback;
  try {
    return require("../package.json").version;
  } catch {
    return "";
  }
}

// Ed25519 public key baked into the host exe at build time, used to verify the
// signed update manifest without shipping it in the app-layer zip.
function manifestPublicKey() {
  return (typeof global !== "undefined" && global.__manifestPublicKey) || "";
}

// Manifest fetched by bootstrap's pre-load conxa_app update check this launch;
// lets server.js's post-load conxa_runtime leg reuse it instead of refetching.
function preloadedManifest() {
  return (typeof global !== "undefined" && global.__conxaManifest) || undefined;
}

module.exports = {
  hostRequire,
  requireFn,
  versionManager,
  env,
  runtimeVersion,
  manifestPublicKey,
  preloadedManifest,
};
