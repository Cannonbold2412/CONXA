"use strict";
/**
 * mcp_register.js — `conxa-runtime.exe register-mcp` / `unregister-mcp`.
 *
 * Replaces the throwaway PowerShell the NSIS installer used to generate
 * (see setup.nsi.tmpl, pre-Phase-1 history). Runs in the HOST-EXE layer
 * (dispatched from bootstrap.js before the disk-resident app layer loads),
 * because a thin installer may not have downloaded the app layer yet, and
 * because this must keep working even if the app layer fails its min_host
 * check.
 *
 * One run touches every detected host; one host failing never aborts the
 * rest (record_agent_config_error-style accounting). Exit code is non-zero
 * only if every DETECTED host failed — "nothing detected" is not a failure.
 */
const fs = require("fs");
const path = require("path");
const { resolve: resolveEnv } = require("../app/env");
const { HOSTS, buildContext } = require("../app/mcp_hosts");
const configEdit = require("../app/config_edit");
const { TOML_HOSTS } = require("./mcp_hosts_toml");
const configEditToml = require("./config_edit_toml");
const { YAML_HOSTS } = require("./mcp_hosts_yaml");
const configEditYaml = require("./config_edit_yaml");

const STATUS_FILE_NAME = "mcp-register-status.txt";

/** Everything derived from our own install: the entry key, command path, env block. */
function computeIdentity() {
  const envInfo = resolveEnv();
  const key = envInfo.dev ? "conxa-dev" : "conxa";
  const exeName = process.platform === "win32" ? "conxa-runtime.exe" : "conxa-runtime";
  // Always points through the stable `current` junction — self-updates flip
  // the junction, never the customer's config.
  const commandPath = path.join(envInfo.conxaDir, "conxa-runtime", "current", exeName);
  const envBlock = {
    CONXA_DIR: envInfo.conxaDir,
    CONXA_ENV: envInfo.env,
    CONXA_UPDATE_CHANNEL: envInfo.channel,
  };
  return { key, installRoot: envInfo.conxaDir, commandPath, envBlock };
}

function parseArgs(argv) {
  const flags = argv.slice(3); // [exe, 'register-mcp'|'unregister-mcp', ...flags]
  const plan = flags.includes("--plan");
  const onlyIdx = flags.indexOf("--only");
  const only = onlyIdx === -1 ? null
    : (flags[onlyIdx + 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    plan,
    dryRun: plan || flags.includes("--dry-run"),
    force: flags.includes("--force"),
    only: only && only.length ? only : null,
  };
}

/** Register/unregister one JSON-host config file. */
async function applyJson(mode, host, configPath, identity, opts) {
  if (mode === "unregister-mcp") {
    return configEdit.removeEntry({
      configPath,
      objectPath: host.objectPath,
      entryKey: identity.key,
      installRoot: identity.installRoot,
      dryRun: opts.dryRun,
    });
  }
  const entry = configEdit.buildEntry(host.shape, identity.commandPath, identity.envBlock);
  return configEdit.upsertEntry({
    configPath,
    objectPath: host.objectPath,
    entryKey: identity.key,
    entry,
    installRoot: identity.installRoot,
    dryRun: opts.dryRun,
  });
}

/** Register/unregister one TOML marker block (label = identity key, so dev and
 * prod each get their own span). */
async function applyToml(mode, host, configPath, identity, opts) {
  const label = host.label(identity);
  if (mode === "unregister-mcp") {
    return configEditToml.removeBlock({ configPath, label, dryRun: opts.dryRun });
  }
  const { blockBody, isForeign } = host.build(identity);
  return configEditToml.upsertBlock({ configPath, label, blockBody, isForeign, dryRun: opts.dryRun });
}

/** Register/unregister one YAML nested key (plain sibling keys — dev/prod
 * coexist natively, no marker dance needed). */
async function applyYaml(mode, host, configPath, identity, opts) {
  const yamlPath = host.yamlPath(identity);
  if (mode === "unregister-mcp") {
    return configEditYaml.removeEntry({ configPath, yamlPath, installRoot: identity.installRoot, dryRun: opts.dryRun });
  }
  const entry = host.build(identity);
  return configEditYaml.upsertEntry({ configPath, yamlPath, entry, installRoot: identity.installRoot, dryRun: opts.dryRun });
}

/**
 * The three host families differ only in HOW a config file is located and
 * written — detection gating, --only filtering, multi-file handling, result
 * shapes, and error accounting are identical. Each adapter states its
 * difference; runFamily owns everything they used to duplicate (three
 * near-identical orchestrator bodies).
 *
 *   hosts    — the family's host table
 *   targets  — config files this host owns (JSON hosts may own several:
 *              VS Code profiles, Cline's two locations; TOML/YAML: exactly one)
 *   apply    — write or remove our entry in one target file via that
 *              family's editor; returns the editor's status object
 */
const FAMILIES = [
  {
    id: "json",
    hosts: HOSTS,
    targets: (host, ctx) => host.configPaths(ctx),
    apply: applyJson,
  },
  {
    id: "toml",
    hosts: TOML_HOSTS,
    targets: (host, ctx) => [host.configPath(ctx)],
    apply: applyToml,
  },
  {
    id: "yaml",
    hosts: YAML_HOSTS,
    targets: (host, ctx) => [host.configPath(ctx)],
    apply: applyYaml,
  },
];

async function runFamily(mode, family, ctx, identity, opts) {
  const results = [];
  for (const host of family.hosts) {
    if (opts.only && !opts.only.includes(host.id)) {
      results.push({ host: host.id, name: host.name, status: "skipped:not-selected" });
      continue;
    }
    if (!host.detect(ctx)) {
      results.push({ host: host.id, name: host.name, status: "skipped:not-detected" });
      continue;
    }

    const configPaths = family.targets(host, ctx);
    if (!configPaths.length) {
      results.push({ host: host.id, name: host.name, status: "skipped:no-config-path" });
      continue;
    }
    for (const configPath of configPaths) {
      const base = { host: host.id, name: host.name, file: configPath };
      try {
        results.push({ ...base, ...(await family.apply(mode, host, configPath, identity, opts)) });
      } catch (e) {
        results.push({ ...base, status: `error:${e.code || e.message}` });
      }
    }
  }
  return results;
}

/**
 * One line NSIS can read whole and drop straight into a MessageBox — this is
 * what makes a PARTIAL failure visible. A process exit code alone can't: exit
 * is only nonzero when every detected host fails, so 15 hosts succeeding
 * alongside 2 silently failing would otherwise show "Setup complete!" with no
 * hint anything went wrong.
 */
function summarize(mode, results) {
  const counts = { ok: 0, "not-detected": 0, "not-selected": 0, "foreign-entry": 0, "no-config-path": 0, error: 0 };
  for (const r of results) {
    if (r.status === "ok" || r.status === "would-write" || r.status === "would-remove") counts.ok++;
    else if (r.status.startsWith("error")) counts.error++;
    else if (r.status === "skipped:not-detected") counts["not-detected"]++;
    else if (r.status === "skipped:not-selected") counts["not-selected"]++;
    else if (r.status === "skipped:foreign-entry") counts["foreign-entry"]++;
    else if (r.status === "skipped:no-config-path") counts["no-config-path"]++;
  }
  const parts = [`${counts.ok} ok`];
  if (counts["not-detected"]) parts.push(`${counts["not-detected"]} not installed`);
  if (counts["foreign-entry"]) parts.push(`${counts["foreign-entry"]} left alone (not ours)`);
  if (counts.error) parts.push(`${counts.error} FAILED`);
  return `conxa ${mode}: ${parts.join(", ")}`;
}

/** Best-effort diagnostic file NSIS reads for its completion message. Never
 * throws — a failure to write our OWN status file must not fail the run. */
function writeStatusFile(installRoot, summaryLine, results) {
  try {
    fs.mkdirSync(installRoot, { recursive: true });
    const detailLines = results.map((r) => `  ${r.name}: ${r.status}${r.file ? ` -> ${r.file}` : ""}`);
    fs.writeFileSync(path.join(installRoot, STATUS_FILE_NAME), `${summaryLine}\n\n${detailLines.join("\n")}\n`);
  } catch (_) { /* diagnostic only — never fail the run over this */ }
}

async function run(argv) {
  const mode = argv[2]; // 'register-mcp' | 'unregister-mcp'
  const opts = parseArgs(argv);
  const identity = computeIdentity();
  const ctx = buildContext();

  const results = [];
  for (const family of FAMILIES) {
    results.push(...(await runFamily(mode, family, ctx, identity, opts)));
  }

  const summaryLine = summarize(mode, results);
  for (const r of results) {
    const suffix = r.file ? ` -> ${r.file}` : "";
    process.stdout.write(`  ${r.name}: ${r.status}${suffix}\n`);
  }
  process.stdout.write(`${summaryLine}\n`);
  if (opts.plan) {
    process.stdout.write(`${JSON.stringify({ mode, key: identity.key, results }, null, 2)}\n`);
  }
  // --plan/--dry-run touch nothing, including our own diagnostic file.
  if (!opts.dryRun) {
    writeStatusFile(identity.installRoot, summaryLine, results);
  }

  const detected = results.filter((r) => !r.status.startsWith("skipped:"));
  const allFailed = detected.length > 0 && detected.every((r) => r.status.startsWith("error"));
  process.exitCode = allFailed ? 1 : 0;
  return results;
}

module.exports = { run, computeIdentity, parseArgs, summarize };
