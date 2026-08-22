"use strict";
/**
 * cli_installer.js — the `--install-playwright` CLI mode that used to live
 * inline in server.js. Invoked two ways:
 *   1. directly by the NSIS installer (ExecWait needs a real exit code)
 *   2. spawned in the background by server.js's chromium-revision preflight
 *      when a .revision marker names a missing chromium-<rev> directory.
 *
 * Extracted verbatim; behavior identical. Runs and exits the process itself.
 */
const fs   = require("fs");
const path = require("path");
const hostBridge = require("./host_bridge");

function runInstallPlaywright(CONXA_DIR) {
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
    const _req = hostBridge.requireFn();
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
}

module.exports = { runInstallPlaywright };
