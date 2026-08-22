"use strict";
/**
 * config_edit_toml.js — managed-marker-block editor for TOML config files
 * (Codex, Mistral Vibe). No TOML parser dependency (deliberate — see
 * research-analysis/codebase-memory-mcp-auto-config-analysis.md Phase 5):
 * our content lives entirely inside an exact `# >>> conxa:<label> >>>` /
 * `# <<< conxa:<label> <<<` marker span (TOML's own comment syntax) — the
 * same "the marker pair IS the ownership signal" rule as
 * durable_context.js's upsertSharedBlock. Callers pass identity.key (conxa /
 * conxa-dev) as the label so dev and prod each get their own span and can
 * coexist, the same way they coexist as two distinct object keys in the
 * JSON-shaped hosts.
 *
 * One TOML-specific addition: before writing, callers may supply `isForeign`
 * to check the text OUTSIDE our span for an existing, conflicting entry.
 * Two table shapes need genuinely different checks and neither is generic
 * text matching:
 *   - a regular table ([mcp_servers.conxa]) can appear at most ONCE per file
 *     — TOML rejects a duplicate definition outright, so a second one
 *     anywhere outside our span means someone/something else already owns
 *     that exact table and we must not add a second, invalid one.
 *   - an array-of-tables ([[mcp_servers]]) is explicitly allowed to repeat —
 *     every other server on the host uses the identical header line, so
 *     header-text matching alone is a false-positive machine; the only real
 *     conflict is another entry whose own `name = "<our key>"` line already
 *     claims our identity.
 * See mcp_hosts_toml.js for each host's own isForeign() built from these.
 */
const configEdit = require("../app/config_edit");
const { upsertMarkerSpan, outsideOwnSpan: _outsideOwnSpan } = require("../app/marker_span");

function markerStart(label) {
  return `# >>> conxa:${label} >>>`;
}
function markerEnd(label) {
  return `# <<< conxa:${label} <<<`;
}

function tomlEscapeString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** The document text with our own marker span (if present) removed. */
function outsideOwnSpan(text, label) {
  return _outsideOwnSpan(text, markerStart(label), markerEnd(label));
}

// First-insert separation rule (TOML): trim any trailing newlines from existing
// content, then append with exactly one blank line of separation. Precise
// (rather than "however many newlines happen to already be there") so
// removeBlock can strip back off exactly what this adds — see removeBlock for
// the inverse.
function _firstInsert(existing) {
  const trimmed = existing.replace(/\n+$/, "");
  return { base: trimmed, sep: trimmed.length === 0 ? "" : "\n\n" };
}

async function upsertBlock({ configPath, label, blockBody, isForeign, dryRun }) {
  // Span mechanics live in app/marker_span.js (shared with durable_context.js).
  // The foreign check runs as a guard on the SAME read the CAS compares against.
  return upsertMarkerSpan({
    filePath: configPath,
    start: markerStart(label),
    end: markerEnd(label),
    blockBody,
    firstInsert: _firstInsert,
    dryRun,
    guard: (text) =>
      isForeign && isForeign(outsideOwnSpan(text, label))
        ? { status: "skipped:foreign-entry" }
        : null,
  });
}

async function removeBlock({ configPath, label, dryRun }) {
  const before = configEdit.readRegularFile(configPath);
  if (!before.exists && !before.error) return { status: "skipped:not-detected" };
  if (before.error) return { status: `error:${before.error}` };

  const start = markerStart(label);
  const end = markerEnd(label);
  const startIdx = before.raw.indexOf(start);
  const endIdx = before.raw.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { status: "skipped:not-detected" };
  }
  if (dryRun) return { status: "would-remove" };

  // Exact inverse of upsertBlock's first-insert separator: strip the "\n\n"
  // we know precedes a trailing-appended block, and the single "\n" that
  // follows it, rather than a blind multi-newline collapse (which cannot
  // distinguish "our separator" from a blank line the customer had there
  // deliberately).
  const beforeSpan = before.raw.slice(0, startIdx);
  const afterSpan = before.raw.slice(endIdx + end.length);
  const beforeTrimmed = beforeSpan.endsWith("\n\n") ? beforeSpan.slice(0, -2) : beforeSpan;
  const afterTrimmed = afterSpan.startsWith("\n") ? afterSpan.slice(1) : afterSpan;
  const next = afterTrimmed === "" && beforeTrimmed !== "" ? `${beforeTrimmed}\n` : beforeTrimmed + afterTrimmed;

  const now = configEdit.readRegularFile(configPath);
  if (now.error) return { status: `error:${now.error}` };
  if ((now.exists ? now.raw : "") !== before.raw) return { status: "error:changed-underneath" };

  try {
    await configEdit.atomicWrite(configPath, next);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

module.exports = { upsertBlock, removeBlock, markerStart, markerEnd, tomlEscapeString, outsideOwnSpan };
