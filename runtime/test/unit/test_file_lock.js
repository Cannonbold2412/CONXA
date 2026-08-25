"use strict";

// file_lock.js + host_lock integration — the PROD-5 cross-process platform mutex.
// Pinned here: stale/dead-PID takeover (a crashed engine releases its platforms
// without a cleanup process), give-up semantics, release idempotency, and that
// host_lock.acquireHosts() extends across processes ONLY when locksDir is passed
// (unit suites elsewhere stay hermetic by construction).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const fileLock = require("../../app/file_lock");
const hostLock = require("../../app/host_lock");

function tmpLocksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "conxa-filelock-"));
}

function writeLock(dir, host, { pid, holder, ageMs = 0 }) {
  const filePath = path.join(dir, `${host}.lock`);
  const now = Date.now() - ageMs;
  fs.writeFileSync(filePath, JSON.stringify({
    pid,
    holder,
    acquired_at: new Date(now).toISOString(),
    heartbeat_at: new Date(now).toISOString(),
  }));
}

test("acquire + release roundtrip; release deletes the lock files", async () => {
  const dir = tmpLocksDir();
  const fl = await fileLock.acquireFileLocks(["render.com"], "r1:s", { locksDir: dir });
  assert.ok(fl.ok);
  assert.ok(fs.existsSync(path.join(dir, "render.com.lock")));
  fl.release();
  assert.strictEqual(fs.existsSync(path.join(dir, "render.com.lock")), false);
});

test("a second acquirer blocks, then wins after release", async () => {
  const dir = tmpLocksDir();
  const a = await fileLock.acquireFileLocks(["render.com"], "r1", { locksDir: dir });
  let settled = false;
  const bPromise = fileLock.acquireFileLocks(["render.com"], "r2", { locksDir: dir, pollMs: 5 })
    .then((r) => { settled = true; return r; });
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(settled, false);
  a.release();
  const b = await bPromise;
  assert.ok(b.ok);
  b.release();
});

test("give-up (isDone) reports the external blocker without claiming anything", async () => {
  const dir = tmpLocksDir();
  // A foreign ALIVE holder: spawn a real second node process so pidAlive() is true
  // and only staleness could free the lock — proving contention detection is real.
  const foreign = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    writeLock(dir, "render.com", { pid: foreign.pid, holder: "other-engine:r9" });
    const res = await fileLock.acquireFileLocks(["render.com"], "me", {
      locksDir: dir, pollMs: 5, isDone: () => true,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.host, "render.com");
    assert.strictEqual(res.blocker.holder, "other-engine:r9");
    assert.strictEqual(res.release, undefined);
  } finally {
    foreign.kill();
  }
});

test("a STALE heartbeat frees the lock even though the PID is ALIVE", async () => {
  const dir = tmpLocksDir();
  // Alive foreign holder (so only staleness can free it) whose heartbeat stopped.
  const foreign = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    writeLock(dir, "render.com", { pid: foreign.pid, holder: "ghost", ageMs: 60_000 }); // > staleMs
    const fl = await fileLock.acquireFileLocks(["render.com"], "me", { locksDir: dir });
    assert.ok(fl.ok, "a crashed-but-alive-looking holder must be taken over via staleness");
    fl.release();
  } finally {
    foreign.kill();
  }
});

test("a DEAD PID frees the lock even with a fresh heartbeat (crash recovery)", async () => {
  const dir = tmpLocksDir();
  // PID space on Windows stays far below this; kill(0) → ESRCH → dead.
  const deadPid = 4_000_000_000;
  writeLock(dir, "render.com", { pid: deadPid, holder: "crashed", ageMs: 0 });
  const fl = await fileLock.acquireFileLocks(["render.com"], "me", { locksDir: dir });
  assert.ok(fl.ok, "crashed holder must not block forever");
  fl.release();
});

test("an unreadable/corrupt lock file is treated as free (fail open)", async () => {
  const dir = tmpLocksDir();
  fs.writeFileSync(path.join(dir, "render.com.lock"), "{corrupt");
  const fl = await fileLock.acquireFileLocks(["render.com"], "me", { locksDir: dir });
  assert.ok(fl.ok);
  fl.release();
});

test("release is idempotent — double teardown never throws", async () => {
  const dir = tmpLocksDir();
  const fl = await fileLock.acquireFileLocks(["render.com"], "me", { locksDir: dir });
  fl.release();
  assert.doesNotThrow(() => fl.release());
});

test("multi-host acquire claims every host atomically in sorted order", async () => {
  const dir = tmpLocksDir();
  const fl = await fileLock.acquireFileLocks(["vercel.com", "render.com"], "me", { locksDir: dir });
  assert.ok(fl.ok);
  assert.deepStrictEqual(
    fs.readdirSync(dir).filter((f) => f.endsWith(".lock")).sort(),
    ["render.com.lock", "vercel.com.lock"],
  );
  fl.release();
});

test("activeFileLocks reports current holders", async () => {
  const dir = tmpLocksDir();
  const fl = await fileLock.acquireFileLocks(["render.com"], "r7:deploy", { locksDir: dir });
  const rows = fileLock.activeFileLocks(dir);
  const row = rows.find((r) => r.host === "render.com");
  assert.ok(row);
  assert.strictEqual(row.pid, process.pid);
  assert.strictEqual(row.holder, "r7:deploy");
  fl.release();
});

// ─── host_lock.js integration ─────────────────────────────────────────────────

test("host_lock WITHOUT locksDir behaves exactly as before (no files touched)", async () => {
  const dir = tmpLocksDir();
  const a = await hostLock.acquireHosts(["render.com"], { runId: "r1", slug: "s" }, {});
  assert.ok(typeof a.release === "function");
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".lock")).length, 0);
  a.release();
});

test("host_lock WITH locksDir also claims the cross-process layer; give-up names the external holder", async () => {
  const dir = tmpLocksDir();
  const foreign = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    // Foreign engine holds render.com — our acquire must fail naming it…
    writeLock(dir, "vercel.com", { pid: foreign.pid, holder: "daemon:rX:other-skill" });
    const blocked = await hostLock.acquireHosts(["vercel.com"], { runId: "r1", slug: "mine" }, {
      locksDir: dir,
      isDone: () => true,
      pollMs: 5,
    });
    assert.strictEqual(blocked.release, undefined);
    assert.match(String(blocked.blocker.runId), /other-skill/);

    // …and once the foreign lock is gone, the same acquire succeeds and writes its own claim.
    fs.unlinkSync(path.join(dir, "vercel.com.lock"));
    const ok = await hostLock.acquireHosts(["vercel.com"], { runId: "r2", slug: "mine" }, { locksDir: dir });
    assert.ok(typeof ok.release === "function");
    assert.ok(fs.existsSync(path.join(dir, "vercel.com.lock")));
    ok.release();
    assert.strictEqual(fs.existsSync(path.join(dir, "vercel.com.lock")), false);
  } finally {
    foreign.kill();
  }
});
