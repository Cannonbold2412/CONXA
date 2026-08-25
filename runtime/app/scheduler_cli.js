"use strict";
/**
 * scheduler_cli.js — implementation of `conxa-runtime.exe schedule …` /
 * `conxa-runtime.exe runner …` (PROD-5 standalone launcher). Lives in the
 * disk-resident APP LAYER on purpose: host/cli_schedule.js only resolves this
 * module (min_host-gated) and hands over argv, so every fix here ships as a
 * normal app-vX.Y.Z update without touching the frozen exe.
 *
 * Commands:
 *   schedule add    --skill <slug> --cron "<m h dom mon dow>" [--name N]
 *                   [--workspace ID] [--inputs f.json] [--grace MIN] [--disabled]
 *   schedule list | show <id> | remove <id> | enable <id> | disable <id>
 *   schedule run-now <id> | pause | resume | daemon [--no-tray]
 *   runner start [--no-tray] | stop | status | autostart on|off | setup | doctor
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { nextAfter, parseCron } = require("./cron_lite");
const { createStore } = require("./scheduler_store");

const STARTUP_LNK = () => path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Conxa Runner.lnk"
);

// ─── tiny arg parsing ─────────────────────────────────────────────────────────

function _parseArgs(tokens) {
  const out = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = String(tokens[i]);
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = tokens[i + 1];
      if (next === undefined || String(next).startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(t);
  }
  return out;
}

function _usage() {
  return [
    "Usage:",
    "  conxa-runtime.exe schedule add --skill SLUG --cron \"M H DOM MON DOW\" [--name N] [--workspace ID] [--inputs f.json] [--grace MIN] [--disabled]",
    "  conxa-runtime.exe schedule list|show|remove|enable|disable|run-now <id>",
    "  conxa-runtime.exe schedule pause|resume",
    "  conxa-runtime.exe schedule daemon [--no-tray]        (resident scheduler; normally started via autostart)",
    "  conxa-runtime.exe runner start [--no-tray]|stop|status",
    "  conxa-runtime.exe runner autostart on|off",
    "  conxa-runtime.exe runner setup                       (autostart + power guidance + health check)",
    "  conxa-runtime.exe runner doctor",
    "",
    'Examples:',
    '  schedule add --skill weekly-sales-report --cron "0 6 * * 1-5" --name "Weekday reports"',
    '  schedule add --skill invoice-download --cron "0 */4 * * *" --grace 120',
  ].join("\n");
}

// ─── shared plumbing ──────────────────────────────────────────────────────────

function _paths(dataDir) {
  const baseDir = path.join(dataDir, "scheduler");
  return {
    baseDir,
    logsDir: path.join(baseDir, "logs"),
    commandsDir: path.join(baseDir, "commands"),
    stateFile: path.join(baseDir, "state.json"),
    daemonLockFile: path.join(baseDir, "daemon.lock"),
  };
}

function _store() {
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  const log = () => {};
  return createStore({
    dataDir,
    getSessionKeyFn: () => require("./auth_manager").getSessionKey("scheduler-v1", log),
    log,
  });
}

function _pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function _readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (_) { return null; }
}

/** Is a live scheduler daemon present for THIS install? Returns {running, pid} */
function _daemonStatus(dataDir) {
  const { daemonLockFile } = _paths(dataDir);
  const rec = _readJsonSafe(daemonLockFile);
  if (!rec || typeof rec.pid !== "number") return { running: false };
  const stale = Date.now() - new Date(rec.heartbeat_at || 0).getTime() > 20_000;
  if (!_pidAlive(rec.pid) || stale) return { running: false };
  return { running: true, pid: rec.pid };
}

async function _sendCommand(dataDir, cmd) {
  const { commandsDir, daemonLockFile } = _paths(dataDir);
  fs.mkdirSync(commandsDir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.cmd`;
  fs.writeFileSync(path.join(commandsDir, name), JSON.stringify(cmd));
  // Only meaningful when a daemon is around to consume it.
  return _daemonStatus(dataDir).running || !!_readJsonSafe(daemonLockFile);
}

// ─── schedule commands ────────────────────────────────────────────────────────

async function _cmdAdd(rest) {
  const a = _parseArgs(rest);
  if (!a.skill || !a.cron) {
    process.stdout.write(_usage() + "\n");
    return 2;
  }
  let inputs = {};
  if (a.inputs) {
    inputs = _readJsonSafe(String(a.inputs));
    if (!inputs || typeof inputs !== "object") {
      process.stderr.write(`error: could not read inputs JSON from ${a.inputs}\n`);
      return 1;
    }
  }
  const fields = {
    slug: String(a.skill),
    workspace_id: a.workspace ? String(a.workspace) : null,
    cron: String(a.cron),
    name: a.name ? String(a.name) : undefined,
    enabled: !a.disabled,
    catchup_grace_minutes: a.grace !== undefined ? Number(a.grace) : undefined,
    inputs,
  };
  try { parseCron(fields.cron); } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }

  // Fail fast on an unknown slug — but non-fatally warn rather than refuse when the
  // index can't be read at all (a fresh install may sync skills later today).
  try {
    const skillLoader = require("./skill_loader");
    const conxaDir = process.env.CONXA_DIR || require("./host_bridge").env().conxaDir;
    const cacheDir = path.join(process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir, "cache");
    const index = skillLoader.loadSkillRegistryFromCache(path.join(conxaDir, "skill-packs"), cacheDir);
    const hit = Object.values(index).find((v) => v.slug === fields.slug || v.slug.replace(/-/g, "_") === fields.slug.replace(/-/g, "_"));
    if (!hit && Object.keys(index).length > 0) {
      process.stderr.write(`warning: skill "${fields.slug}" is not currently installed — the schedule stays disabled until it exists.\n`);
      fields.enabled = false;
    } else if (hit && fields.workspace_id && hit.workspace_id !== fields.workspace_id) {
      process.stderr.write(`warning: skill exists in workspace "${hit.workspace_id}", not "${fields.workspace_id}".\n`);
    }
  } catch (_) { /* index unavailable — proceed, daemon validates again per run */ }

  const store = _store();
  const rec = await store.create(fields);
  const next = nextAfter(rec.cron, new Date());
  await store.update(rec.id, { next_run_at: next ? next.toISOString() : null });
  process.stdout.write(
    `Created schedule ${rec.id}\n` +
    `  ${rec.name}\n  skill: ${rec.slug}${rec.workspace_id ? ` (workspace ${rec.workspace_id})` : ""}\n` +
    `  cron: ${rec.cron}  enabled: ${rec.enabled}  grace: ${rec.catchup_grace_minutes}m\n` +
    `  next run: ${next ? next.toLocaleString() : "never"}\n`
  );
  return 0;
}

function _fmtLast(lr) {
  if (!lr) return "never";
  return `${lr.status} @ ${lr.at}${lr.slot ? ` (slot ${lr.slot})` : ""}`;
}

function _cmdList(json) {
  const rows = _store().listMeta();
  if (json) { process.stdout.write(JSON.stringify(rows, null, 2) + "\n"); return 0; }
  if (!rows.length) { process.stdout.write("No schedules. Create one with: schedule add --skill SLUG --cron \"…\"\n"); return 0; }
  for (const r of rows) {
    process.stdout.write(
      `${r.id}  ${r.enabled ? "enabled " : "DISABLED"}  ${r.cron}\n` +
      `    ${r.name}  [${r.slug}${r.workspace_id ? "@" + r.workspace_id : ""}]${r.has_inputs ? " (inputs stored)" : ""}\n` +
      `    next: ${r.next_run_at || "?"}   last: ${_fmtLast(r.last_run)}\n`
    );
  }
  return 0;
}

function _cmdShow(id) {
  const row = _store().listMeta().find((r) => r.id === id);
  if (!row) { process.stderr.write(`error: no such schedule: ${id}\n`); return 1; }
  process.stdout.write(JSON.stringify(row, null, 2) + "\n");
  return 0;
}

async function _cmdToggle(id, enabled) {
  try {
    await _store().update(id, { enabled });
  } catch (e) { process.stderr.write(`error: ${e.message}\n`); return 1; }
  process.stdout.write(`${id} is now ${enabled ? "enabled" : "disabled"}\n`);
  return 0;
}

async function _cmdRemove(id) {
  const ok = _store().remove(id);
  process.stdout.write(ok ? `Removed ${id}\n` : `No such schedule: ${id}\n`);
  return ok ? 0 : 1;
}

// ─── runner commands ──────────────────────────────────────────────────────────

function _engineSpawnCommand(daemonArgs) {
  // Packaged: the exe IS the entrypoint (bootstrap dispatches on argv[2]).
  // Dev: re-enter through the repo's bootstrap so env lanes resolve identically.
  if (process.pkg) return { command: process.execPath, args: [...daemonArgs] };
  const bootstrap = path.join(__dirname, "..", "host", "bootstrap.js");
  if (fs.existsSync(bootstrap)) return { command: process.execPath, args: [bootstrap, ...daemonArgs] };
  return null;
}

async function _cmdDaemonStart(rest) {
  const a = _parseArgs(rest);
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  const st = _daemonStatus(dataDir);
  if (st.running) {
    process.stdout.write(`Scheduler already running (pid ${st.pid}).\n`);
    return 0;
  }
  const cmdSpec = _engineSpawnCommand(["schedule", "daemon", ...(a["no-tray"] ? ["--no-tray"] : [])]);
  if (!cmdSpec) {
    process.stderr.write("error: cannot locate the runtime entrypoint from this install layout.\n");
    return 1;
  }
  const child = spawn(cmdSpec.command, cmdSpec.args, {
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  // Give the daemon a moment to write its lock, then confirm.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const now = _daemonStatus(dataDir);
    if (now.running) {
      process.stdout.write(`Scheduler started (pid ${now.pid}). Tray icon should appear in the notification area.\n`);
      return 0;
    }
  }
  process.stderr.write("error: scheduler did not come up — check logs under %CONXA_DATA_DIR%\\scheduler\\logs\n");
  return 1;
}

async function _cmdStop() {
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  const st = _daemonStatus(dataDir);
  if (!st.running) { process.stdout.write("Scheduler is not running.\n"); return 0; }
  await _sendCommand(dataDir, { type: "quit" });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!_daemonStatus(dataDir).running) { process.stdout.write("Scheduler stopped.\n"); return 0; }
  }
  process.stderr.write("warning: daemon still shows alive after quit request — check its log.\n");
  return 1;
}

async function _cmdPauseResume(type) {
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  await _sendCommand(dataDir, { type });
  process.stdout.write(type === "pause" ? "Scheduler paused (running jobs finish; nothing new starts).\n" : "Scheduler resumed.\n");
  return 0;
}

async function _cmdRunNow(id) {
  const store = _store();
  const rows = store.listMeta();
  if (!rows.find((r) => r.id === id)) { process.stderr.write(`error: no such schedule: ${id}\n`); return 1; }
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  await _sendCommand(dataDir, { type: "run_now", schedule_id: id });
  process.stdout.write(`Run requested for ${id} — watch progress with: runner status\n`);
  return 0;
}

function _cmdStatus() {
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  const { stateFile } = _paths(dataDir);
  const st = _daemonStatus(dataDir);
  process.stdout.write(st.running ? `Scheduler: RUNNING (pid ${st.pid})\n` : "Scheduler: STOPPED\n");
  const state = _readJsonSafe(stateFile);
  if (state) {
    process.stdout.write(`Paused: ${!!state.paused}   Engine: ${state.engine_running ? "loaded" : "idle"}\n`);
    for (const s of state.schedules || []) {
      process.stdout.write(
        `${s.enabled ? " " : "*"} ${s.id} ${s.name}\n` +
        `    next: ${s.next_run_at || "-"}   last: ${s.last_run ? `${s.last_run.status} @ ${s.last_run.at}` : "never"}\n`
      );
    }
  } else if (st.running) {
    process.stdout.write("(state file not written yet)\n");
  }
  return 0;
}

// ─── autostart / setup / doctor ───────────────────────────────────────────────

function _psRun(script) {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || "") }));
  });
}

async function _cmdAutostart(mode) {
  if (mode !== "on" && mode !== "off") {
    process.stderr.write('usage: runner autostart on|off\n');
    return 2;
  }
  if (!process.pkg) {
    process.stderr.write("autostart registration requires the installed Conxa runtime (exe). In development, register your own startup entry pointing at:\n" +
      `  ${process.execPath} ${path.join(__dirname, "..", "host", "bootstrap.js")} schedule daemon\n`);
    return mode === "on" ? 1 : 0;
  }
  const lnk = STARTUP_LNK();
  if (mode === "off") {
    try { fs.unlinkSync(lnk); process.stdout.write(`Removed startup entry (${lnk}).\n`); return 0; }
    catch (_) { process.stdout.write("No startup entry found.\n"); return 0; }
  }
  // WScript.Shell shortcut creation — no admin rights needed (per-user Startup folder).
  const ps =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}'); ` +
    `$s.TargetPath = '${String(process.execPath).replace(/'/g, "''")}'; ` +
    `$s.Arguments = 'schedule daemon'; ` +
    `$s.Description = 'Conxa Runner — scheduled workflow execution'; ` +
    `$s.Save();`;
  const { err, stderr } = await _psRun(ps);
  if (err) { process.stderr.write(`error: could not create startup shortcut: ${(stderr || err.message).trim()}\n`); return 1; }
  process.stdout.write(`Startup entry created (${lnk}). The scheduler starts when you sign in.\n`);
  return 0;
}

async function _cmdDoctor() {
  const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
  const conxaDir = process.env.CONXA_DIR || require("./host_bridge").env().conxaDir;
  let hard = 0;

  const line = (ok, label, note) => {
    process.stdout.write(`${ok === null ? "[i]" : ok ? "[OK]" : "[X]"}  ${label}${note ? ` — ${note}` : ""}\n`);
    if (ok === false) hard += 1;
  };

  line(true, `install root: ${conxaDir}`);
  line(process.pkg ? true : null, process.pkg ? "packaged runtime" : "development mode (not packaged)");

  // Chromium staged?
  const chromiumBase = path.join(conxaDir, "chromium");
  const revFile = path.join(chromiumBase, ".revision");
  const chromiumOk = fs.existsSync(revFile)
    || (fs.existsSync(chromiumBase) && fs.readdirSync(chromiumBase).some((d) => d.startsWith("chromium-")));
  line(chromiumOk, "browser (Chromium) staged");

  // Skill packs staged?
  let packCount = 0;
  try { packCount = fs.readdirSync(path.join(conxaDir, "skill-packs")).filter((n) => !n.startsWith(".")).length; } catch (_) {}
  line(packCount > 0, "skill packs staged", `${packCount} pack(s)`);

  // Scheduler key reachable (exercises the keychain path used to encrypt inputs)?
  try {
    await require("./auth_manager").getSessionKey("scheduler-v1", () => {});
    line(true, "scheduler encryption key reachable");
  } catch (e) {
    line(false, "scheduler encryption key reachable", e.message);
  }

  // Schedules parse + have a computable next run?
  const store = _store();
  const rows = store.listMeta();
  let badCron = 0;
  for (const r of rows) {
    try {
      parseCron(r.cron);
      if (!r.next_run_at) throw new Error("next_run_at missing");
    } catch (_) { badCron += 1; }
  }
  line(badCron === 0, `schedules valid (${rows.length})`, badCron ? `${badCron} broken` : "");

  // Locks dir writable (cross-process platform locking needs it)?
  const locksDir = path.join(dataDir, "locks");
  try {
    fs.mkdirSync(locksDir, { recursive: true });
    const probe = path.join(locksDir, ".doctor-probe");
    fs.writeFileSync(probe, "x");
    fs.unlinkSync(probe);
    line(true, "cross-process lock directory writable");
  } catch (e) {
    line(false, "cross-process lock directory writable", e.message);
  }

  // Daemon + autostart (informational).
  const st = _daemonStatus(dataDir);
  line(null, "scheduler daemon", st.running ? `running (pid ${st.pid})` : "stopped");
  if (process.platform === "win32") line(fs.existsSync(STARTUP_LNK()), "autostart entry", STARTUP_LNK());

  // Never-sleep posture (Windows): read-only query of the AC standby timeout.
  if (process.platform === "win32") {
    const { stdout } = await _psRun("powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE");
    const m = /Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)/.exec(stdout);
    const acSeconds = m ? parseInt(m[1], 16) : null;
    if (acSeconds === null) line(null, "power plan standby timeout", "could not read (skipped)");
    else if (acSeconds === 0) line(true, "power plan standby timeout", "AC sleep disabled — good for a runner machine");
    else line(null, "power plan standby timeout", `PC sleeps after ${acSeconds}s on AC — scheduled runs will be missed. Consider: powercfg /change standby-timeout-ac 0`);
  }

  process.stdout.write(hard === 0 ? "\nAll required checks passed.\n" : `\n${hard} required check(s) FAILED.\n`);
  return hard === 0 ? 0 : 1;
}

async function _cmdSetup() {
  process.stdout.write("Setting up this machine as a Conxa runner…\n\n");
  const rcAuto = process.pkg ? await _cmdAutostart("on") : 0;
  process.stdout.write("\n");
  if (process.platform === "win32") {
    process.stdout.write(
      "Recommended power settings for unattended runs (run these yourself, or hand them to IT):\n" +
      "  powercfg /change standby-timeout-ac 0     (never sleep on AC power)\n" +
      "  powercfg /change monitor-timeout-ac 15    (screen off is fine — runs continue headless)\n" +
      "  powercfg /change hibernate-timeout-ac 0   (never hibernate on AC power)\n\n"
    );
  }
  process.stdout.write("Health check:\n");
  const rcDoctor = await _cmdDoctor();
  if (rcAuto === 0) {
    process.stdout.write("\nStarting the scheduler now…\n");
    await _cmdDaemonStart([]);
  }
  return rcDoctor;
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

async function run(args) {
  const verb = args[0];
  const rest = args.slice(1);

  if (verb === "schedule") {
    const sub = rest[0];
    const tail = rest.slice(1);
    switch (sub) {
      case "add": return _cmdAdd(tail);
      case "list": return _cmdList(tail.includes("--json"));
      case "show": return tail[0] ? _cmdShow(String(tail[0])) : (process.stderr.write("usage: schedule show <id>\n"), 2);
      case "remove": return tail[0] ? _cmdRemove(String(tail[0])) : (process.stderr.write("usage: schedule remove <id>\n"), 2);
      case "enable": return tail[0] ? _cmdToggle(String(tail[0]), true) : (process.stderr.write("usage: schedule enable <id>\n"), 2);
      case "disable": return tail[0] ? _cmdToggle(String(tail[0]), false) : (process.stderr.write("usage: schedule disable <id>\n"), 2);
      case "run-now": return tail[0] ? _cmdRunNow(String(tail[0])) : (process.stderr.write("usage: schedule run-now <id>\n"), 2);
      case "pause": return _cmdPauseResume("pause");
      case "resume": return _cmdPauseResume("resume");
      case "daemon": {
        const a = _parseArgs(tail);
        const dataDir = process.env.CONXA_DATA_DIR || require("./host_bridge").env().dataDir;
        const existing = _daemonStatus(dataDir);
        if (existing.running) { process.stderr.write(`[scheduler] already running (pid ${existing.pid})\n`); return 0; }
        const daemon = require("./scheduler_daemon");
        return daemon.start({ tray: !a["no-tray"], foreground: true });
      }
      default:
        process.stdout.write(_usage() + "\n");
        return sub === undefined ? 0 : 2;
    }
  }

  if (verb === "runner") {
    const sub = rest[0];
    const tail = rest.slice(1);
    switch (sub) {
      case "start": return _cmdDaemonStart(tail);
      case "stop": return _cmdStop();
      case "status": return _cmdStatus();
      case "autostart": return _cmdAutostart(String(tail[0] || ""));
      case "setup": return _cmdSetup();
      case "doctor": return _cmdDoctor();
      default:
        process.stdout.write(_usage() + "\n");
        return sub === undefined ? 0 : 2;
    }
  }

  process.stdout.write(_usage() + "\n");
  return verb === undefined ? 0 : 2;
}

// Direct dev invocation (`node app/scheduler_cli.js schedule …`) — the packaged
// path enters through bootstrap → cli_schedule instead.
if (require.main === module) {
  run(process.argv.slice(2))
    .then((code) => process.exit(typeof code === "number" ? code : 0))
    .catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(1); });
}

module.exports = { run, _parseArgs, _daemonStatus };
