"use strict";
/**
 * artifact_store.js — content-addressed store for recovery artifacts (today: the
 * recording-time screenshots the agent recovery tier compares the live page against).
 *
 * Why content-addressed rather than a folder per skill version:
 *
 *   1. Naming a file by its own hash makes the delta check free. "Do I already have this?" is
 *      answered locally, with no protocol and no server round-trip — the machine computes what
 *      it is missing and asks for exactly that. First install and a later update stop being two
 *      different cases.
 *   2. It survives step renumbering. Images are named positionally by the builder
 *      (`Image_3.jpg`), so inserting a step near the start renames every image after it. A
 *      filename-based check would call that thirty changed files; the bytes are unchanged, so
 *      this sees nothing to do.
 *   3. It deduplicates across versions AND across skills. version_manager keeps three versions
 *      of every skill on disk; without this, three copies of every unchanged screenshot. Two
 *      different workflows that both start at the same login screen share one copy too.
 *   4. An interrupted download resumes for free — whatever landed is already recognised.
 *
 * The store lives beside `skill-packs/`, NOT inside it, precisely so the per-version directory
 * pruning in version_manager.js can never delete an artifact another version still points at.
 *
 * Files keep their original extension after the hash (`<sha256>.jpg`) so the MIME type stays
 * derivable and the store stays inspectable by a human.
 *
 * ponytail: flat directory, no sharding. A pack is tens of images, not millions; shard by the
 * first two hex chars if a fleet ever makes one directory unwieldy.
 */
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const SHA256_RE = /^[0-9a-f]{64}$/i;

// Per-skill path→hash index, written into the skill's active version directory by the sync's
// artifact pass. The store is keyed by CONTENT; recovery only ever knows an artifact's PATH
// (`visual_ref` in recovery.json). Without this mapping the bytes would be on disk and
// unreachable — so this file is what makes a content-addressed store usable at read time.
const ARTIFACT_INDEX_FILE = "artifacts.json";

/** Resolve one artifact by its pack-relative path (e.g. "visuals/Image_3.jpg") to a file in the
 *  store, via the skill's own index. Returns null when the index is absent (a pack synced before
 *  artifact sync shipped) or the file has not been fetched yet — both are ordinary states the
 *  caller must handle, not errors. */
function resolveByPath(skillPacksDir, skillDir, artifactPath) {
  if (!skillDir || !artifactPath) return null;
  let index;
  try {
    index = JSON.parse(fs.readFileSync(path.join(skillDir, ARTIFACT_INDEX_FILE), "utf8"));
  } catch (_) {
    return null;
  }
  const wanted = String(artifactPath).replace(/\\/g, "/");
  const entry = (index && Array.isArray(index.artifacts) ? index.artifacts : [])
    .find(a => a && String(a.path).replace(/\\/g, "/") === wanted);
  if (!entry) return null;
  const p = pathFor(skillPacksDir, entry.sha256, entry.path);
  return p && fs.existsSync(p) ? p : null;
}

// Derived from the skill-packs dir rather than read from env: sync.js is handed only that path,
// and the Studio sandbox relocates the whole tree. Keeping them siblings means both move together.
function storeDir(skillPacksDir) {
  return path.join(path.dirname(skillPacksDir), "artifacts");
}

// `<sha256><ext>` — the extension comes from the artifact's path in the pack, never from user
// input at read time, so it cannot be used to escape the store directory.
function fileNameFor(sha256, artifactPath) {
  const ext = path.extname(String(artifactPath || "")).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? `${sha256}${ext}` : String(sha256);
}

function pathFor(skillPacksDir, sha256, artifactPath) {
  if (!SHA256_RE.test(String(sha256 || ""))) return null;
  return path.join(storeDir(skillPacksDir), fileNameFor(String(sha256).toLowerCase(), artifactPath));
}

function has(skillPacksDir, sha256, artifactPath) {
  const p = pathFor(skillPacksDir, sha256, artifactPath);
  return !!p && fs.existsSync(p);
}

/**
 * Write one artifact under its hash. The content is hashed and compared before anything lands
 * on disk: a store keyed by hash is only meaningful if the key is actually true of the bytes,
 * and a mismatch here means the artifact was corrupted or substituted in transit — exactly the
 * case where the agent tier must NOT be handed a picture of the wrong thing.
 *
 * Writes to a temp name and renames, so a crash mid-write can never leave a truncated file that
 * `has()` would then report as present.
 */
function put(skillPacksDir, sha256, artifactPath, content) {
  const target = pathFor(skillPacksDir, sha256, artifactPath);
  if (!target) throw new Error(`invalid artifact hash: ${sha256}`);
  const actual = crypto.createHash("sha256").update(content).digest("hex");
  if (actual !== String(sha256).toLowerCase()) {
    throw new Error(`artifact checksum mismatch for ${artifactPath}: expected ${sha256}, got ${actual}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, target);
  return target;
}

/**
 * The hashes from `entries` that are already on disk. This is the whole delta computation —
 * the caller sends this list and receives precisely what it does not have.
 *
 * `entries` is the `artifacts: [{path, sha256}]` array from the sync delta response.
 */
function haveHashes(skillPacksDir, entries) {
  const out = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e && SHA256_RE.test(String(e.sha256 || "")) && has(skillPacksDir, e.sha256, e.path)) {
      out.push(String(e.sha256).toLowerCase());
    }
  }
  return out;
}

function missingCount(skillPacksDir, entries) {
  const list = Array.isArray(entries) ? entries : [];
  return list.length - haveHashes(skillPacksDir, list).length;
}

module.exports = {
  storeDir, fileNameFor, pathFor, has, put, haveHashes, missingCount,
  resolveByPath, ARTIFACT_INDEX_FILE, SHA256_RE,
};
