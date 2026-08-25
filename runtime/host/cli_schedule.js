"use strict";
/**
 * cli_schedule.js — `conxa-runtime.exe schedule …` / `conxa-runtime.exe runner …`
 * (PROD-5 standalone launcher). Dispatches into the disk-resident app layer's
 * scheduler_cli.js, same as cli_sync.js dispatches into sync.js: the host exe only
 * resolves the app layer (min_host-gated) and hands over argv — all real logic is
 * app-layer code so subcommand fixes ship via normal app-vX.Y.Z updates without a
 * host reinstall.
 */
const path = require("path");
// Same pure gate bootstrap's tryLoad uses — never execute app-layer code built for
// a newer host against an old host (audit finding #2 precedent).
const { evaluateAppLayer } = require("./min_host_gate");

async function run(args) {
  // args[0] is "schedule" or "runner" (bootstrap matched it); the rest are user args.
  const conxaDir = process.env.CONXA_DIR;
  const APP_ROOT = process.env.CONXA_APP_DIR;
  const versionManager = require("../app/version_manager");
  const hostVersion = require("../package.json").host_version || "";

  const appDir = versionManager.resolveCurrent(APP_ROOT);
  if (!appDir) {
    process.stderr.write(
      "[bootstrap] schedule/runner: no app layer installed under " + APP_ROOT + "\n" +
      "  Reinstall Conxa, or start the runtime once so the app layer downloads.\n"
    );
    process.exit(1);
  }
  const gate = evaluateAppLayer(appDir, hostVersion, { quiet: true });
  if (!gate.loaded && gate.reason === "host-too-old") {
    process.stderr.write(gate.message.replace("[bootstrap]", "[bootstrap] schedule") +
      "[bootstrap] The scheduler needs an updated host — reinstall Conxa to continue.\n");
    process.exit(1);
  }

  let cli;
  try {
    cli = require(path.join(appDir, "scheduler_cli.js"));
  } catch (e) {
    process.stderr.write(`[bootstrap] schedule/runner: app layer unusable (${e.message})\n`);
    process.exit(1);
  }

  try {
    const code = await cli.run(args, { conxaDir, appDir });
    process.exit(typeof code === "number" ? code : 0);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { run };
