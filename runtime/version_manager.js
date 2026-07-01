"use strict";
// Shared versioned-directory manager used by bootstrap.js (host, baked into the pkg exe)
// and server.js/sync.js (app layer, loaded from disk). Every updateable component
// (conxa-runtime, conxa-app, each skill under skill-packs/<company>/<skill>/) is laid
// out as:
//   <componentDir>/
//     v1.0.0/           ← a fully self-contained installed version
//     v1.1.0/
//     current           ← directory junction (Windows) / symlink (POSIX) -> one of the above
//
// `current` is a directory junction rather than a JSON pointer file specifically because
// conxa-runtime's `current` must be resolvable by Claude Desktop's own process launcher,
// which only understands real filesystem paths — not our on-disk conventions. Using the
// same mechanism for conxa-app and skill-packs (which are only ever read by our own code)
// keeps one code path instead of two.
const fs   = require("fs");
const path = require("path");

const VERSION_DIR_RE = /^v\d+\.\d+\.\d+([-+].+)?$/;

function _junctionType() {
  return process.platform === "win32" ? "junction" : "dir";
}

function currentLinkPath(componentDir) {
  return path.join(componentDir, "current");
}

// Remove the `current` link itself. Never recurses into the link target — a Windows
// junction (or POSIX symlink) reported by lstat as a symbolic link is unlinked, full stop.
// This is the one place `current` is ever deleted; every call site must go through here
// instead of fs.rmSync(..., {recursive:true}), which can otherwise follow the reparse
// point and delete the version directory it points to.
function _removeCurrentLink(linkPath) {
  let st;
  try { st = fs.lstatSync(linkPath); } catch (_) { return; }
  if (st.isSymbolicLink()) {
    fs.unlinkSync(linkPath);
    return;
  }
  // Not a link (shouldn't normally happen) — leave it alone rather than guess.
  throw new Error(`refusing to remove non-link at ${linkPath}`);
}

function _linkCurrent(componentDir, targetVersionDir) {
  const linkPath = currentLinkPath(componentDir);
  const tmp = `${linkPath}.next-${process.pid}-${Date.now()}`;
  try { fs.unlinkSync(tmp); } catch (_) {}
  fs.symlinkSync(targetVersionDir, tmp, _junctionType());
  if (fs.existsSync(linkPath)) _removeCurrentLink(linkPath);
  fs.renameSync(tmp, linkPath);
}

// Resolve `current` to the absolute version directory it points at, or null if absent/broken.
function resolveCurrent(componentDir) {
  const linkPath = currentLinkPath(componentDir);
  let st;
  try { st = fs.lstatSync(linkPath); } catch (_) { return null; }
  try {
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(linkPath);
      const resolved = path.isAbsolute(target) ? target : path.resolve(componentDir, target);
      return fs.existsSync(resolved) ? resolved : null;
    }
    if (st.isDirectory()) return linkPath; // defensive fallback, not the normal case
  } catch (_) {}
  return null;
}

function currentVersion(componentDir) {
  const dir = resolveCurrent(componentDir);
  return dir ? path.basename(dir) : null;
}

// Sorted array of installed version directories, newest first, by version.json's
// released_at (falls back to name comparison if released_at is missing/equal).
function listVersions(componentDir) {
  if (!fs.existsSync(componentDir)) return [];
  let entries;
  try { entries = fs.readdirSync(componentDir, { withFileTypes: true }); } catch (_) { return []; }

  const versions = entries
    .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
    .map((e) => {
      const dir = path.join(componentDir, e.name);
      let releasedAt = "";
      try { releasedAt = JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")).released_at || ""; }
      catch (_) {}
      return { name: e.name, dir, releasedAt };
    });

  versions.sort((a, b) => {
    if (a.releasedAt && b.releasedAt && a.releasedAt !== b.releasedAt)
      return b.releasedAt.localeCompare(a.releasedAt);
    return b.name.localeCompare(a.name, undefined, { numeric: true });
  });
  return versions;
}

function isValidVersionDir(dir, requiredFiles) {
  if (!dir || !fs.existsSync(dir)) return false;
  for (const f of requiredFiles || []) {
    if (!fs.existsSync(path.join(dir, f))) return false;
  }
  try {
    JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8"));
  } catch (_) {
    return false;
  }
  return true;
}

// Prune installed versions beyond `keep`, oldest first, never touching anything in
// `protect` (absolute paths) — used to guarantee the version live immediately before
// an activation survives it, so a same-activation rollback never needs a re-download.
function _prune(componentDir, keep, protect) {
  const protectedSet = new Set((protect || []).filter(Boolean).map((d) => path.resolve(d)));
  const versions = listVersions(componentDir); // newest first
  let kept = 0;
  for (const v of versions) {
    if (protectedSet.has(path.resolve(v.dir))) { kept++; continue; }
    if (kept < keep) { kept++; continue; }
    try { fs.rmSync(v.dir, { recursive: true, force: true }); } catch (_) { /* retried on next activate */ }
  }
}

// Activate a newly-staged version directory as `current`. Validates first, flips the
// junction atomically (small unlink-then-rename window, same tradeoff the existing
// app-layer .bak/.next swap already accepts), then prunes old versions beyond retention.
function activate(componentDir, newVersionDir, options = {}) {
  const { keep = 3, requiredFiles = ["version.json"] } = options;
  if (!isValidVersionDir(newVersionDir, requiredFiles)) {
    throw new Error(
      `activate: ${newVersionDir} is not a valid version directory (needs ${requiredFiles.join(", ")} + version.json)`
    );
  }
  fs.mkdirSync(componentDir, { recursive: true });
  const previous = resolveCurrent(componentDir); // null on first install

  _linkCurrent(componentDir, newVersionDir);

  try { _prune(componentDir, keep, [newVersionDir, previous]); } catch (_) { /* non-fatal */ }

  return {
    version: path.basename(newVersionDir),
    previousVersion: previous ? path.basename(previous) : null,
  };
}

// Flip `current` back to the next-newest retained version. No download needed — the
// point of keeping old versions on disk. Returns null if there's nothing to roll back to.
function rollback(componentDir) {
  const cur = resolveCurrent(componentDir);
  const curName = cur ? path.basename(cur) : null;
  const candidate = listVersions(componentDir).find((v) => v.name !== curName);
  if (!candidate) return null;
  _linkCurrent(componentDir, candidate.dir);
  return { version: candidate.name };
}

module.exports = {
  currentLinkPath,
  resolveCurrent,
  currentVersion,
  listVersions,
  isValidVersionDir,
  activate,
  rollback,
  _removeCurrentLink,
};
