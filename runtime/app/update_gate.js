"use strict";
// Refuse new runs while a newer host exe is staged but this process is still the old one.
// The host can't replace itself, so the only way the update takes effect is a restart by
// whatever launched it — this gate is how the user finds out, in every MCP client alike.
const fs   = require("fs");
const path = require("path");

// A restart that never clears the gate (launcher pinned to a version dir, stale override)
// must not lock a customer out forever: after this many armed launches for the same
// staged version, stop refusing.
const MAX_STRIKES = 3;

// Pure. `gt` is semver.gt-shaped (injected so tests need no semver).
function shouldGate({ running, staged, strikes, skip, isLocalDev, gt }) {
  if (skip || isLocalDev || !staged || !running) return false;
  if (!gt(staged, running)) return false; // equal, or a rolled-back `current` — never an "update"
  return strikes <= MAX_STRIKES;
}

function _strikeFile(dataDir) { return path.join(dataDir, "update-gate.json"); }

// Record one armed launch for `staged` and return the running strike count for it.
// staged == null clears the file (restart worked, or nothing pending).
function recordLaunch(dataDir, staged) {
  const file = _strikeFile(dataDir);
  if (!staged) {
    try { fs.unlinkSync(file); } catch (_) {}
    return 0;
  }
  let prev = { staged: null, strikes: 0 };
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  const strikes = prev.staged === staged ? (prev.strikes || 0) + 1 : 1;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ staged, strikes }));
  } catch (_) {}
  return strikes;
}

module.exports = { MAX_STRIKES, shouldGate, recordLaunch };
