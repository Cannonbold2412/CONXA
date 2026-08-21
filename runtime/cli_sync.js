"use strict";
/**
 * cli_sync.js — `conxa-runtime.exe sync`, invoked by the NSIS installer right
 * after the SkillPacks section stages pack.json, so the customer's skills are
 * already on disk before the first MCP launch instead of downloading on that
 * first launch (bad first-run experience for a large enterprise pack).
 *
 * Reuses the app layer's sync.js unchanged — same delta-sync server.js's
 * startupSync calls on every launch. This is just an earlier, visible,
 * blocking call to it.
 */
const path = require("path");

async function run(CONXA_DIR, APP_ROOT, versionManager) {
  const skillPacksDir = path.join(CONXA_DIR, "skill-packs");
  const appDir = versionManager.resolveCurrent(APP_ROOT);
  if (!appDir) {
    process.stderr.write("[bootstrap] sync: no app layer staged — skipping install-time sync\n");
    return;
  }

  let sync;
  try {
    sync = require(path.join(appDir, "sync.js"));
  } catch (e) {
    process.stderr.write(`[bootstrap] sync: app layer unusable (${e.message}) — skipping install-time sync\n`);
    return;
  }

  try {
    // server.js's background startupSync budgets 4s because it never blocks
    // anything the user is watching. This call does — it's a visible install
    // step — so it can afford real time for a large enterprise pack.
    await sync.syncSkillPacks(skillPacksDir, {
      timeoutMs: 5 * 60 * 1000,
      log: (m) => process.stdout.write(`${m}\n`),
    });
    process.stdout.write("[bootstrap] sync: install-time skill sync complete\n");
  } catch (e) {
    // Never fail the install over this — server.js's normal startupSync on
    // first launch is the fallback safety net if this didn't finish.
    process.stderr.write(`[bootstrap] sync: install-time sync failed (${e.message}) — will retry on first launch\n`);
  }
}

module.exports = { run };
