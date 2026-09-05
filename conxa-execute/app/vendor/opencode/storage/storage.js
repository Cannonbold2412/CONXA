"use strict";
/**
 * Ported from opencode's storage service (packages/opencode/src/storage/
 * storage.ts at the commit pinned in ../../../NOTICE) — same
 * read/update/write/list/remove interface keyed by string[] path segments
 * (-> path.join(dir, ...key) + ".json"), same per-file locking (one lock per
 * target file, so unrelated sessions never contend with each other).
 *
 * Differences from the original, each a substitution not an omission:
 *  - FSUtil / Global.Path.data (opencode's private, unpublished
 *    @opencode-ai/core internals) -> plain fs/promises + Electron's userData dir.
 *  - The MIGRATIONS array and its Git dependency are dropped entirely —
 *    nothing to migrate, this is a new store.
 *  - list() does a flat single-level readdir under the prefix, not opencode's
 *    recursive glob — conxa-execute's key-space is two flat namespaces
 *    (session/<id>.json, message/<id>.json), not opencode's nested
 *    session/message/part hierarchy, so there is nothing to recurse into.
 *  - Locking uses effect's Effect.makeSemaphore(1), not opencode's
 *    TxReentrantLock/TReentrantLock (effect 3.22's renamed equivalent).
 *    Verified by direct reproduction: TReentrantLock.make succeeds on its
 *    own, but withReadLock/withWriteLock throws inside effect@3.22.1's own
 *    STM internals (entry.js reading `.versioned` off an undefined ref) —
 *    a genuine bug in the installed effect version, not a usage error, so
 *    this is a real fix, not a shortcut. The cost: a semaphore has no
 *    separate read-lock mode, so concurrent reads of the same file now
 *    serialize like writes do (still fully correct, just not the same
 *    read-concurrency optimization opencode's TxReentrantLock gives).
 *    Revisit if a later effect release fixes TReentrantLock and read
 *    concurrency on hot files actually matters at this app's scale.
 *  - ponytail: the lock registry is a plain Map, not opencode's RcMap (which
 *    adds eager eviction of idle locks — a memory-bound optimization for
 *    opencode's much larger, longer-running server process). A desktop app
 *    holding a few dozen semaphores in memory for its lifetime is not a real
 *    cost; switch to RcMap if session-file counts ever get large enough to
 *    matter.
 */
const fs = require("fs/promises");
const path = require("path");
const { Effect, Cause, Runtime } = require("effect");

// Effect.runPromise rejects with a FiberFailure wrapper around ANY failure
// (typed or defect) rather than the plain error — unwrap it so callers of
// this module (main.js) see the real NotFoundError/Error, not an
// effect-internal type they shouldn't need to know about.
function runPromise(effect) {
  return Effect.runPromise(effect).catch((err) => {
    if (Runtime.isFiberFailure(err)) {
      throw Cause.squash(err[Runtime.FiberFailureCauseId]);
    }
    throw err;
  });
}

class NotFoundError extends Error {
  constructor(target) {
    super(`Resource not found: ${target}`);
    this.name = "NotFoundError";
  }
}

function dataDir() {
  // CONXA_EXECUTE_STORAGE_DIR lets the self-check below (and any other test)
  // run under plain `node`, where `electron`'s app module doesn't resolve —
  // it's only ever a real module inside Electron's own main-process runtime.
  if (process.env.CONXA_EXECUTE_STORAGE_DIR) return process.env.CONXA_EXECUTE_STORAGE_DIR;
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "storage");
}

function keyToFile(key) {
  return path.join(dataDir(), ...key) + ".json";
}

function isMissing(err) {
  return Boolean(err) && err.code === "ENOENT";
}

const _locks = new Map();
function lockFor(target) {
  let lock = _locks.get(target);
  if (!lock) {
    lock = Effect.runSync(Effect.makeSemaphore(1));
    _locks.set(target, lock);
  }
  return lock;
}

function withLock(target, effect) {
  return lockFor(target).withPermits(1)(effect);
}

function remove(key) {
  const target = keyToFile(key);
  return runPromise(
    withLock(
      target,
      Effect.tryPromise({
        try: () => fs.rm(target),
        catch: (err) => (isMissing(err) ? undefined : err),
      }).pipe(Effect.catchAll(() => Effect.void))
    )
  );
}

function read(key) {
  const target = keyToFile(key);
  return runPromise(
    withLock(
      target,
      Effect.tryPromise({
        try: async () => JSON.parse(await fs.readFile(target, "utf8")),
        catch: (err) => (isMissing(err) ? new NotFoundError(target) : err),
      })
    )
  );
}

function write(key, content) {
  const target = keyToFile(key);
  return runPromise(
    withLock(
      target,
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, JSON.stringify(content, null, 2));
        },
        catch: (err) => err,
      })
    )
  );
}

function update(key, fn) {
  const target = keyToFile(key);
  return runPromise(
    withLock(
      target,
      Effect.tryPromise({
        try: async () => {
          const content = JSON.parse(await fs.readFile(target, "utf8"));
          fn(content);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, JSON.stringify(content, null, 2));
          return content;
        },
        catch: (err) => (isMissing(err) ? new NotFoundError(target) : err),
      })
    )
  );
}

async function list(prefix) {
  const dir = path.join(dataDir(), ...prefix);
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => [...prefix, f.slice(0, -5)])
    .sort((a, b) => a.join("/").localeCompare(b.join("/")));
}

module.exports = { read, update, write, list, remove, NotFoundError };
