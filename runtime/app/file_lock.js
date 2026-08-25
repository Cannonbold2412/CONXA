"use strict";
/**
 * file_lock.js — cross-process, per-external-host mutex for the runtime (PROD-5).
 *
 * host_lock.js already serializes runs that overlap on an external platform — but
 * only within ONE engine process. The moment a second engine exists (Claude Desktop
 * AND the scheduler daemon's engine, or Claude AND Cursor), the in-process map can
 * no longer see the other holder and two isolated runs could still double-hit the
 * same platform. This module extends the same guarantee across processes with
 * heartbeat-stamped lock files under <CONXA_DATA_DIR>/locks/<host>.lock.
 *
 * Crash safety: a holder refreshes heartbeat_at every few seconds; a lock is free
 * when its file is gone, its PID is dead, or its heartbeat is older than staleMs.
 * A crashed process therefore releases its platforms within ~staleMs of dying,
 * with no cleanup process required. Deadlock safety: acquisition order is the same
 * canonical (sorted) order host_lock.js uses in-process, so two processes needing
 * the same two hosts in different orders cannot interleave into a cycle.
 *
 * Deliberately fail-open on filesystem errors (unwritable dir, etc.): degraded to
 * in-process-only locking is strictly better than refusing to execute. Callers
 * opt in by passing locksDir (server.js does; unit tests don't) so test suites
 * never touch a real user directory.
 */

const fs = require("fs");
const path = require("path");

const DEFAULTS = { pollMs: 250, heartbeatMs: 5000, staleMs: 15000 };

function _safeName(host) {
  return String(host).replace(/[^A-Za-z0-9._-]/g, "_");
}

function _lockPath(locksDir, host) {
  return path.join(locksDir, `${_safeName(host)}.lock`);
}

function _readLock(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw.pid !== "number") return null;
    return raw;
  } catch (_) {
    return null;
  }
}

function _defaultPidAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence probe only
    return true;
  } catch (e) {
    return e.code === "EPERM"; // EPERM means it EXISTS but is owned by someone else
  }
}

// A lock is free when: no file / unreadable, holder PID dead, heartbeat stale, or
// held by THIS process AND this same holder id (a retry after a partial multi-host
// write re-claims its own files). Same-process DIFFERENT holders still block — the
// file layer is defense-in-depth behind host_lock's in-process map, not a bypass.
function _isFree(rec, opts) {
  if (!rec) return true;
  if (rec.pid === process.pid && rec.holder === opts.holderId) return true;
  if (!(opts.pidAlive || _defaultPidAlive)(rec.pid)) return true;
  const age = opts.now() - new Date(rec.heartbeat_at || rec.acquired_at || 0).getTime();
  return !(age >= 0) || age > opts.staleMs;
}

function _writeAll(locksDir, hosts, holderId, nowIso) {
  const written = [];
  for (const host of hosts) {
    const filePath = _lockPath(locksDir, host);
    const tmp = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({
      pid: process.pid,
      holder: holderId,
      acquired_at: nowIso(),
      heartbeat_at: nowIso(),
    }));
    fs.renameSync(tmp, filePath);
    written.push(filePath);
  }
  return written;
}

function _removeIfOwned(locksDir, host, holderId) {
  const filePath = _lockPath(locksDir, host);
  try {
    const rec = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (rec.pid === process.pid && rec.holder === holderId) fs.unlinkSync(filePath);
  } catch (_) { /* gone or unreadable — nothing to release */ }
}

/**
 * Acquire every host in `hosts` across processes, or block until `isDone()` says
 * to give up. Resolves `{ ok:true, release }` or `{ ok:false, host, blocker }` —
 * never throws for expected contention. A filesystem failure mid-write rolls back
 * the partial claim and reports it as a give-up on "" (caller fails open to
 * in-process-only semantics rather than aborting the run).
 */
async function acquireFileLocks(hosts, holderId, opts = {}) {
  const o = {
    ...DEFAULTS,
    ...opts,
    now: opts.now || Date.now,
  };
  const clean = [...new Set((hosts || []).filter(Boolean))].sort(); // canonical order = deadlock-free
  if (clean.length === 0) return { ok: true, release: () => {} };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const readOpts = { now: o.now, staleMs: o.staleMs, pidAlive: opts.pidAlive, holderId };

  for (;;) {
    let firstBlocker = null;
    for (const host of clean) {
      const rec = _readLock(_lockPath(o.locksDir, host));
      if (!_isFree(rec, readOpts)) { firstBlocker = { host, rec }; break; }
    }
    if (!firstBlocker) break;
    if (o.isDone && o.isDone()) {
      return { ok: false, host: firstBlocker.host, blocker: { pid: firstBlocker.rec.pid, holder: firstBlocker.rec.holder } };
    }
    await sleep(o.pollMs);
  }

  // Claim phase. If the disk betrays us halfway, undo what we wrote and report.
  let written;
  try {
    written = _writeAll(o.locksDir, clean, holderId, () => new Date().toISOString());
  } catch (e) {
    return { ok: false, host: "", blocker: { error: e.message } };
  }

  // Heartbeat: one interval refreshes every file we hold, so staleness never
  // misfires while the owner lives. unref'd — locks must not keep Node alive.
  const timer = setInterval(() => {
    for (const filePath of written) {
      try {
        const rec = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (rec.pid === process.pid && rec.holder === holderId) {
          rec.heartbeat_at = new Date().toISOString();
          const tmp = `${filePath}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(rec));
          fs.renameSync(tmp, filePath);
        }
      } catch (_) { /* transient — next beat retries */ }
    }
  }, o.heartbeatMs);
  if (timer.unref) timer.unref();

  let released = false;
  function release() {
    if (released) return; // idempotent — callers may release from multiple teardown paths
    released = true;
    clearInterval(timer);
    for (const host of clean) _removeIfOwned(o.locksDir, host, holderId);
  }

  return { ok: true, release };
}

/** Diagnostics snapshot — which lock files exist right now (raw filenames as labels). */
function activeFileLocks(locksDir) {
  let names;
  try {
    names = fs.readdirSync(locksDir).filter((n) => n.endsWith(".lock"));
  } catch (_) {
    return [];
  }
  const out = [];
  for (const name of names) {
    const rec = _readLock(path.join(locksDir, name));
    if (rec) out.push({ host: name.slice(0, -".lock".length), pid: rec.pid, holder: rec.holder, heartbeat_at: rec.heartbeat_at });
  }
  return out;
}

module.exports = { acquireFileLocks, activeFileLocks };
