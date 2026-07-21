"use strict";
/**
 * config_edit_yaml.js — YAML config editor for Goose and Hermes, using the
 * `yaml` package's Document API (comment- and formatting-preserving edits,
 * confirmed empirically before writing this: setIn()/deleteIn() touch only
 * the target key, everything else — comments, other keys, key order —
 * survives byte-for-byte).
 *
 * Unlike the TOML hosts, no marker-block gymnastics are needed here: a YAML
 * mapping natively holds multiple sibling keys, so dev and prod coexist as
 * two ordinary keys under the same section (identity.key), exactly like the
 * JSON-shaped hosts. Ownership reuses config_edit.js's isOwned() directly —
 * same rule, same install-root check, just applied to a YAMLMap's decoded
 * value instead of a parsed JSON object.
 *
 * Same two-context caveat as config_edit.js — reachable from the app layer
 * (sync.js -> durable_context.js, though durable_context.js itself only pulls
 * in config_edit.js/mcp_hosts.js, not this file today; kept consistent in
 * case a future YAML-based discoverability target needs it) as well as the
 * host exe, so `yaml` is resolved via the host bridge.
 */
const YAML = (global.__hostRequire || require)("yaml");
const configEdit = require("./config_edit");

/** Decode the plain-JS value at a path, or undefined if absent. */
function getAtPath(doc, yamlPath) {
  const node = doc.getIn(yamlPath);
  return node && typeof node.toJSON === "function" ? node.toJSON() : node;
}

async function upsertEntry({ configPath, yamlPath, entry, installRoot, dryRun }) {
  const before = configEdit.readRegularFile(configPath);
  if (before.error) return { status: `error:${before.error}` };
  const rawBefore = before.exists ? before.raw : "";

  const doc = YAML.parseDocument(rawBefore);
  if (doc.errors.length && before.exists) return { status: "error:unparseable" };

  const existing = getAtPath(doc, yamlPath);
  // Goose uses `cmd`, Hermes uses `command` — check whichever the shape has.
  const existingCommand = existing && typeof existing === "object" ? (existing.command ?? existing.cmd) : undefined;
  if (!configEdit.isOwned(existingCommand, installRoot)) return { status: "skipped:foreign-entry" };

  if (dryRun) return { status: "would-write" };

  const now = configEdit.readRegularFile(configPath);
  if (now.error) return { status: `error:${now.error}` };
  const rawNow = now.exists ? now.raw : "";
  if (rawNow !== rawBefore) return { status: "error:changed-underneath" };

  const freshDoc = YAML.parseDocument(rawNow); // edit from the just-verified bytes
  freshDoc.setIn(yamlPath, entry);
  const newText = freshDoc.toString();

  try {
    await configEdit.atomicWrite(configPath, newText);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

async function removeEntry({ configPath, yamlPath, installRoot, dryRun }) {
  const before = configEdit.readRegularFile(configPath);
  if (!before.exists && !before.error) return { status: "skipped:not-detected" };
  if (before.error) return { status: `error:${before.error}` };

  const doc = YAML.parseDocument(before.raw);
  if (doc.errors.length) return { status: "error:unparseable" };
  const existing = getAtPath(doc, yamlPath);
  if (existing === undefined) return { status: "skipped:not-detected" };
  const existingCommand = typeof existing === "object" ? (existing.command ?? existing.cmd) : undefined;
  if (!configEdit.isOwned(existingCommand, installRoot)) return { status: "skipped:foreign-entry" };

  if (dryRun) return { status: "would-remove" };

  const now = configEdit.readRegularFile(configPath);
  if (now.error) return { status: `error:${now.error}` };
  if (!now.exists || now.raw !== before.raw) return { status: "error:changed-underneath" };

  const freshDoc = YAML.parseDocument(now.raw);
  freshDoc.deleteIn(yamlPath);
  const newText = freshDoc.toString();

  try {
    await configEdit.atomicWrite(configPath, newText);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

module.exports = { upsertEntry, removeEntry, getAtPath };
