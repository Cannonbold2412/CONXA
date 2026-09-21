"use strict";
// The ONE registry of live Chromium instances (RT-3's per-workspace lease cache, generalized).
//
// An execution session owns exactly one instance across pre-flight -> sign-in -> execution, so the
// browser a login lands in is the browser the workflow runs in. A session is reused by the next
// call with the same key (authenticate -> execute_skill), is never shared while leased (tabs.js's
// popup registry and the per-run download listener both assume one run per context), and at most
// `max` are alive at once — an idle one is evicted to make room, a leased one never is.
//
// What a "session" is stays browser.js's business: create() returns any object with a
// liveness-checkable `context` (pages() throws once it is closed) and its own async close().

const IDLE_MS = 90 * 1000;
const MAX_SESSIONS = Number(process.env.CONXA_MAX_CONCURRENT_RUNS) || 5;

const _meta = new Map(); // session -> { id, key, busy, idleTimer, idleMs }, in creation order
const _byId = new Map(); // id -> session, so a caller can hold a string lease (server.js's leaseKey)
let _pending = 0;        // slots reserved by a create() still in flight
let _seq = 0;

// A closed Playwright context does not throw from pages() — the browser's own connection state is
// the real signal — so check that first, then fall back to pages() for anything without a browser.
function _alive(session) {
  try {
    if (session.browser && typeof session.browser.isConnected === "function" && !session.browser.isConnected()) return false;
    session.context.pages();
    return true;
  } catch (_) { return false; }
}
function _close(session) {
  return Promise.resolve().then(() => session.close()).catch(() => {});
}
// Removes synchronously (so the slot is free before any await), closes afterwards.
function _forget(session) {
  const m = _meta.get(session);
  if (!m) return;
  clearTimeout(m.idleTimer);
  _meta.delete(session);
  _byId.delete(m.id);
}
function _drop(session) {
  _forget(session);
  return _close(session);
}

// Leases an idle, live session for `key` if one exists; never creates. A dead one (the user closed
// the window, the browser crashed, ...) is discarded on the way past. -> { session, id, reused } | null
function reuse(key) {
  for (const [session, m] of _meta) {
    if (m.key !== key || m.busy) continue;
    if (!_alive(session)) { _drop(session); continue; }
    clearTimeout(m.idleTimer); // leased — not idle until released
    m.busy = true;
    return { session, id: m.id, reused: true };
  }
  return null;
}

// -> { session, id, reused } | { refused: true, message }. Throws whatever create() throws.
async function acquire(key, { create, max = MAX_SESSIONS, idleMs = IDLE_MS }) {
  const hit = reuse(key);
  if (hit) return hit;

  let victim = null;
  if (_meta.size + _pending >= max) {
    victim = [..._meta.keys()].find((s) => !_meta.get(s).busy);
    if (!victim) {
      return {
        refused: true,
        message: `All ${max} browser sessions are currently in use. Wait for one of the running ` +
          `workflows to finish, then try again — get_execution_status shows what is running.`,
      };
    }
    // Free its slot now: a concurrent caller must not see it as still taken (or take it twice).
    _forget(victim);
  }

  _pending++; // reserve the slot across create()'s awaits so concurrent callers can't overshoot
  try {
    if (victim) await _close(victim);
    const session = await create();
    const id = `bs${++_seq}`;
    _meta.set(session, { id, key, busy: true, idleTimer: null, idleMs });
    _byId.set(id, session);
    return { session, id, reused: false };
  } finally {
    _pending--;
  }
}

// Ends a lease; takes the session or the id acquire() returned. The idle clock starts now, not
// when the lease began, so a long execution is never reaped mid-run. A session whose browser is
// already gone (server.js tears a visible run's browser down itself, then releases) — or one the
// caller says not to keep (`closeNow`) — is dropped at once instead of parked. No-op for a session
// that was already evicted or closed.
function release(ref, { closeNow = false } = {}) {
  const session = typeof ref === "string" ? _byId.get(ref) : ref;
  const m = session && _meta.get(session);
  if (!m) return;
  if (closeNow || !_alive(session)) { _drop(session); return; }
  m.busy = false;
  clearTimeout(m.idleTimer);
  m.idleTimer = setTimeout(() => {
    if (_meta.get(session) === m && !m.busy) _drop(session);
  }, m.idleMs);
  if (m.idleTimer.unref) m.idleTimer.unref();
}

function size() {
  return _meta.size;
}

// Closes every live instance (graceful shutdown; tests use it to reset between cases). Leaves
// `_pending` alone: a create() still in flight owns its reservation and releases it itself.
function closeAll() {
  return Promise.all([..._meta.keys()].map(_drop));
}

module.exports = { acquire, reuse, release, size, closeAll, MAX_SESSIONS };
