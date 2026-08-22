"use strict";
/**
 * config_edit.js — surgical, ownership-checked, atomic edits to a THIRD-PARTY
 * agent-host config file (claude_desktop_config.json, .cursor/mcp.json, …).
 *
 * These files belong to the customer and their agent host, not to Conxa. Every
 * write here follows the same rule: detect from evidence, edit one JSON path,
 * refuse to touch an entry we didn't write, publish atomically, never lose the
 * customer's comments or formatting.
 *
 * jsonc-parser is used for ALL JSON-shaped hosts (not just comment-bearing
 * ones) — it is a strict superset of JSON, so there is no reason to run a
 * separate lossy JSON.parse/stringify path for the "plain" hosts. One code
 * path, always comment- and format-preserving.
 *
 * This file is reachable from TWO different module-loading contexts: directly
 * from the host exe (bootstrap.js -> mcp_register.js -> here, pkg-bundled),
 * and from the disk-resident app layer (sync.js -> durable_context.js ->
 * here — see runtime/durable_context.js). The app layer ships as bare .js
 * files with no node_modules of its own, so a third-party package must be
 * reached via the host-bridged `__hostRequire` bootstrap.js sets up — same
 * pattern as browser.js/server.js/manifest_manager.js.
 */
const fs = require("fs");
const path = require("path");
const jsonc = require("./host_bridge").hostRequire("jsonc-parser");

const EMPTY_DOC = "{}";
const FORMATTING_OPTIONS = { insertSpaces: true, tabSize: 2, eol: "\n" };

/** Build the MCP entry object for a given schema shape. */
function buildEntry(shape, commandPath, envBlock) {
  switch (shape) {
    case "standard":
      return { command: commandPath, args: [], env: envBlock };
    case "stdio":
      return { command: commandPath, args: [], type: "stdio", env: envBlock };
    case "local":
      return { command: commandPath, args: [], type: "local", env: envBlock };
    case "local-array":
      return { command: [commandPath], type: "local", env: envBlock };
    default:
      throw new Error(`config_edit: unknown entry shape "${shape}"`);
  }
}

/**
 * Ours iff the existing entry's command resolves inside our install root.
 * Absent entry counts as "ours" (nothing to protect, free to write).
 * Mirrors cbm_json_mcp_owned_command (cli.c:879) adapted to Conxa's junction path.
 */
function isOwned(existingCommand, installRoot) {
  if (existingCommand == null) return true;
  const cmd = Array.isArray(existingCommand) ? existingCommand[0] : existingCommand;
  if (typeof cmd !== "string" || !cmd) return false;
  const resolvedCmd = path.resolve(cmd).toLowerCase();
  const resolvedRoot = path.resolve(installRoot).toLowerCase();
  return resolvedCmd === resolvedRoot || resolvedCmd.startsWith(resolvedRoot + path.sep);
}

/**
 * Read one regular file's exact bytes. Never follows symlinks/reparse points —
 * a config path that isn't a plain file fails closed rather than writing
 * through it.
 * Returns { exists, raw, error }. error is set (raw stays null) for anything
 * unsafe; exists=false + error=null is the normal "not created yet" case.
 */
function readRegularFile(filePath) {
  let st;
  try {
    st = fs.lstatSync(filePath);
  } catch (e) {
    if (e.code === "ENOENT") return { exists: false, raw: null, error: null };
    return { exists: false, raw: null, error: `stat-failed:${e.code || e.message}` };
  }
  if (!st.isFile()) {
    return { exists: true, raw: null, error: "not-a-regular-file" };
  }
  try {
    return { exists: true, raw: fs.readFileSync(filePath, "utf8"), error: null };
  } catch (e) {
    return { exists: true, raw: null, error: `read-failed:${e.code || e.message}` };
  }
}

function parseLoose(raw) {
  const errors = [];
  const value = jsonc.parse(raw, errors, { allowTrailingComma: true, disallowComments: false });
  return { value, ok: errors.length === 0 };
}

function getAtPath(root, jsonPath) {
  let cur = root;
  for (const seg of jsonPath) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}

/**
 * Atomic, symlink-safe publish: temp file (O_CREAT|O_EXCL, never clobbers a
 * stale temp) -> fsync -> rename over the target. Retries the rename a few
 * times on Windows EBUSY/EPERM (a host may hold the file briefly). Best-effort
 * fsync of the parent directory on POSIX (Node has no directory-fd fsync on
 * Windows).
 */
async function atomicWrite(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.conxa.tmp.${process.pid}.${Date.now()}`;
  const fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
  try {
    fs.writeFileSync(fd, text, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmpPath, filePath);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (e.code !== "EBUSY" && e.code !== "EPERM") break;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  if (lastErr) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ }
    throw lastErr;
  }

  if (process.platform !== "win32") {
    try {
      const dirFd = fs.openSync(path.dirname(filePath), "r");
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch (_) { /* best-effort — a missed directory fsync is not fatal */ }
  }
}

/**
 * Insert or replace `entry` at objectPath/entryKey in configPath.
 * Ownership-checked, CAS-protected, atomic. dryRun performs every check but
 * skips the write.
 */
async function upsertEntry({ configPath, objectPath, entryKey, entry, installRoot, dryRun }) {
  const before = readRegularFile(configPath);
  if (before.error) return { status: `error:${before.error}` };

  const rawBefore = before.exists ? before.raw : EMPTY_DOC;
  const parsed = parseLoose(rawBefore);
  if (!parsed.ok && before.exists) return { status: "error:unparseable" };
  const root = parsed.value && typeof parsed.value === "object" ? parsed.value : {};

  const existing = getAtPath(root, [...objectPath, entryKey]);
  const existingCommand = existing && typeof existing === "object" ? existing.command : undefined;
  if (!isOwned(existingCommand, installRoot)) return { status: "skipped:foreign-entry" };

  if (dryRun) return { status: "would-write" };

  // Re-read immediately before writing — the edit is computed from THIS read,
  // so if the host rewrote the file between our check above and now, we edit
  // stale bytes and CAS below catches it before it can land.
  const now = readRegularFile(configPath);
  if (now.error) return { status: `error:${now.error}` };
  const rawNow = now.exists ? now.raw : EMPTY_DOC;
  if (rawNow !== rawBefore) return { status: "error:changed-underneath" };

  const edits = jsonc.modify(rawNow, [...objectPath, entryKey], entry, { formattingOptions: FORMATTING_OPTIONS });
  const newText = jsonc.applyEdits(rawNow, edits);

  try {
    await atomicWrite(configPath, newText);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

/**
 * Remove the entry at objectPath/entryKey, only if it is still ours.
 * Missing file/path/entry is a successful no-op, matching cbm's uninstall
 * semantics.
 */
async function removeEntry({ configPath, objectPath, entryKey, installRoot, dryRun }) {
  const before = readRegularFile(configPath);
  if (!before.exists && !before.error) return { status: "skipped:not-detected" };
  if (before.error) return { status: `error:${before.error}` };

  const parsed = parseLoose(before.raw);
  if (!parsed.ok) return { status: "error:unparseable" };
  const root = parsed.value && typeof parsed.value === "object" ? parsed.value : {};

  const existing = getAtPath(root, [...objectPath, entryKey]);
  if (existing === undefined) return { status: "skipped:not-detected" };
  const existingCommand = typeof existing === "object" ? existing.command : undefined;
  if (!isOwned(existingCommand, installRoot)) return { status: "skipped:foreign-entry" };

  if (dryRun) return { status: "would-remove" };

  const now = readRegularFile(configPath);
  if (now.error) return { status: `error:${now.error}` };
  if (!now.exists || now.raw !== before.raw) return { status: "error:changed-underneath" };

  const edits = jsonc.modify(now.raw, [...objectPath, entryKey], undefined, { formattingOptions: FORMATTING_OPTIONS });
  const newText = jsonc.applyEdits(now.raw, edits);

  try {
    await atomicWrite(configPath, newText);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

module.exports = {
  buildEntry,
  isOwned,
  readRegularFile,
  atomicWrite,
  upsertEntry,
  removeEntry,
  // exported for tests / future TOML+YAML editors that need raw path access
  getAtPath,
  parseLoose,
};
