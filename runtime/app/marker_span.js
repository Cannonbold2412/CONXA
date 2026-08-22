"use strict";
/**
 * marker_span.js — the one implementation of managed-marker-block surgery,
 * shared by host/config_edit_toml.js (Codex/Vibe TOML configs) and
 * app/durable_context.js (HTML-comment spans in AGENTS.md-style files).
 *
 * Previously each module carried its own near-identical copy of the
 * "replace our exact span, or append a fresh one, then CAS-re-read and
 * atomically write" sequence (~35 lines × 2) that could silently drift.
 *
 * Callers own their MARKER FORMAT (`# >>> conxa:<label> >>>` for TOML,
 * `<!-- >>> conxa:<id> >>>` for markdown) — they pass the literal start/end
 * strings in; this module owns the SPAN MECHANICS. The two formats'
 * first-insert separation rules genuinely differ, so that part is injected:
 *
 *   TOML    — trim ALL trailing newlines off the existing content, then join
 *             with exactly "\n\n" (precise so removeBlock can invert it).
 *   durable — keep existing content verbatim; "" / "\n" / "\n\n" separator
 *             depending on how it already ends (never rewrites customer text).
 *
 * Dual-shipped: bundled into the exe via host/config_edit_toml.js AND shipped
 * in the app-layer zip for durable_context.js (see host-manifest.json).
 */
const configEdit = require("./config_edit");

/**
 * Produce the full next-file text: our span replaced in place if both markers
 * exist in order, otherwise a fresh span appended using the caller's
 * first-insert rule. Pure.
 */
function spliceSpan({ existing, start, end, blockBody, firstInsert }) {
  const startIdx = existing.indexOf(start);
  const endIdx = existing.indexOf(end);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return existing.slice(0, startIdx) + start + "\n" + blockBody + "\n" + end + existing.slice(endIdx + end.length);
  }
  const { base, sep } = firstInsert(existing);
  return base + sep + start + "\n" + blockBody + "\n" + end + "\n";
}

/**
 * Read → [guard] → splice → no-op check → (dry-run short-circuit) → CAS
 * re-read → atomic write. Returns the same status-object shape every editor
 * in this codebase speaks: { status: "ok" | "would-write" | "error:…" }.
 *
 * `guard(existingText)` runs against the ONE baseline read and may return a
 * short-circuit status object (e.g. config_edit_toml's foreign-entry check).
 * It deliberately shares this read — callers must never open the file twice
 * before the CAS compare, or the "changed-underneath" guarantee weakens.
 */
async function upsertMarkerSpan({ filePath, start, end, blockBody, firstInsert, dryRun = false, guard = null }) {
  const before = configEdit.readRegularFile(filePath);
  if (before.error) return { status: `error:${before.error}` };
  const existing = before.exists ? before.raw : "";

  if (guard) {
    const blocked = guard(existing);
    if (blocked) return blocked;
  }

  const next = spliceSpan({ existing, start, end, blockBody, firstInsert });
  if (next === existing) return { status: "ok" };
  if (dryRun) return { status: "would-write" };

  // Re-read immediately before writing, same CAS discipline as config_edit.js.
  const now = configEdit.readRegularFile(filePath);
  if (now.error) return { status: `error:${now.error}` };
  if ((now.exists ? now.raw : "") !== existing) return { status: "error:changed-underneath" };

  try {
    await configEdit.atomicWrite(filePath, next);
  } catch (e) {
    return { status: `error:write-failed:${e.code || e.message}` };
  }
  return { status: "ok" };
}

/** The document text with our own marker span (if present) removed. Pure. */
function outsideOwnSpan(text, start, end) {
  const startIdx = text.indexOf(start);
  const endIdx = text.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return text;
  return text.slice(0, startIdx) + text.slice(endIdx + end.length);
}

module.exports = { spliceSpan, upsertMarkerSpan, outsideOwnSpan };
