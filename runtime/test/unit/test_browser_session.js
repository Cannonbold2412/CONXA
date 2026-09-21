// browser_session.js is the ONE registry of live Chromium instances (RT-3 lease model, generalized).
// An execution session owns exactly one instance across pre-flight -> sign-in -> execution, is
// reused by the next call with the same key (authenticate -> execute_skill), is never shared while
// leased, and at most `max` (CONXA_MAX_CONCURRENT_RUNS, default 5) are alive at once.
"use strict";

const assert = require("assert");

let pass = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; });
}

const sessions = require("../../app/browser_session");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A stand-in for what browser.js hands the registry: something with a liveness-checkable
// context (pages() throws once closed) and its own close().
function fake(label) {
  const s = {
    label,
    closed: false,
    context: { pages() { if (s.closed) throw new Error("closed"); return []; } },
    async close() { s.closed = true; },
  };
  return s;
}
function factory() {
  const made = [];
  const create = async () => { const s = fake(`s${made.length}`); made.push(s); return s; };
  return { create, made };
}

async function run() {
  console.log("browser_session:");

  await check("a released session is reused by the next call with the same key (one instance)", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    sessions.release(a.session);
    const b = await sessions.acquire("k", { create: f.create, max: 5 });
    assert.strictEqual(f.made.length, 1);
    assert.strictEqual(b.session, a.session);
    assert.strictEqual(b.reused, true);
  });

  await check("a leased session is never shared — a concurrent call gets its own instance", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    const b = await sessions.acquire("k", { create: f.create, max: 5 });
    assert.strictEqual(f.made.length, 2);
    assert.notStrictEqual(a.session, b.session);
    assert.strictEqual(sessions.size(), 2);
  });

  await check("different keys never share an instance", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k1", { create: f.create, max: 5 });
    sessions.release(a.session);
    const b = await sessions.acquire("k2", { create: f.create, max: 5 });
    assert.notStrictEqual(a.session, b.session);
  });

  await check("when every slot is leased the next call is refused with a human-readable message", async () => {
    sessions.closeAll();
    const f = factory();
    await sessions.acquire("a", { create: f.create, max: 2 });
    await sessions.acquire("b", { create: f.create, max: 2 });
    const c = await sessions.acquire("c", { create: f.create, max: 2 });
    assert.strictEqual(c.refused, true);
    assert.strictEqual(f.made.length, 2, "must not create a third instance");
    assert.match(c.message, /all 2 browser sessions are currently in use/i);
    assert.match(c.message, /wait/i);
    assert.doesNotMatch(c.message, /cancel/i, "the caller didn't start those runs — never suggest cancelling them");
  });

  await check("at the cap, an IDLE session of another key is evicted instead of refusing", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("a", { create: f.create, max: 2 });
    await sessions.acquire("b", { create: f.create, max: 2 });
    sessions.release(a.session);
    const c = await sessions.acquire("c", { create: f.create, max: 2 });
    assert.ok(c.session, "expected a session, not a refusal");
    assert.strictEqual(a.session.closed, true, "the idle session must be closed when evicted");
    assert.strictEqual(sessions.size(), 2);
  });

  await check("concurrent calls cannot overshoot the cap while create() is still awaiting", async () => {
    sessions.closeAll();
    let created = 0;
    const slow = async () => { created++; await sleep(20); return fake(`slow${created}`); };
    const [x, y] = await Promise.all([
      sessions.acquire("a", { create: slow, max: 1 }),
      sessions.acquire("b", { create: slow, max: 1 }),
    ]);
    assert.strictEqual(created, 1);
    assert.strictEqual([x, y].filter((r) => r.refused).length, 1);
  });

  await check("a create() that throws frees its slot", async () => {
    sessions.closeAll();
    await assert.rejects(() => sessions.acquire("a", { create: async () => { throw new Error("boom"); }, max: 1 }), /boom/);
    assert.strictEqual(sessions.size(), 0);
    const f = factory();
    const ok = await sessions.acquire("a", { create: f.create, max: 1 });
    assert.ok(ok.session);
  });

  await check("a dead session (context closed) is discarded and rebuilt, not handed out", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    sessions.release(a.session);
    a.session.closed = true; // e.g. the user closed the browser window
    const b = await sessions.acquire("k", { create: f.create, max: 5 });
    assert.notStrictEqual(b.session, a.session);
    assert.strictEqual(f.made.length, 2);
    assert.strictEqual(sessions.size(), 1);
  });

  await check("a released session is closed after the idle window; a leased one never is", async () => {
    sessions.closeAll();
    const f = factory();
    const held = await sessions.acquire("held", { create: f.create, max: 5, idleMs: 20 });
    const gone = await sessions.acquire("gone", { create: f.create, max: 5, idleMs: 20 });
    sessions.release(gone.session);
    await sleep(80);
    assert.strictEqual(gone.session.closed, true);
    assert.strictEqual(held.session.closed, false);
    assert.strictEqual(sessions.size(), 1);
  });

  await check("release() of a session that was already evicted is a harmless no-op", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("a", { create: f.create, max: 1 });
    sessions.release(a.session);
    await sessions.acquire("b", { create: f.create, max: 1 }); // evicts a
    assert.doesNotThrow(() => sessions.release(a.session));
  });

  console.log("\nreuse / ids / closeNow:");

  await check("reuse(key) leases an idle live session without ever creating one", async () => {
    sessions.closeAll();
    assert.strictEqual(sessions.reuse("k"), null, "nothing to reuse yet");
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    assert.strictEqual(sessions.reuse("k"), null, "a leased session must not be handed out");
    sessions.release(a.session);
    const r = sessions.reuse("k");
    assert.strictEqual(r.session, a.session);
    assert.strictEqual(sessions.reuse("k"), null, "reuse() leases it — a second caller gets nothing");
    assert.strictEqual(f.made.length, 1);
  });

  await check("reuse(key) discards a dead session and reports nothing to reuse", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    sessions.release(a.session);
    a.session.closed = true;
    assert.strictEqual(sessions.reuse("k"), null);
    assert.strictEqual(sessions.size(), 0);
  });

  await check("a lease can be released by its id (server.js carries a string leaseKey, not the object)", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    assert.strictEqual(typeof a.id, "string");
    sessions.release(a.id);
    assert.strictEqual(sessions.reuse("k").session, a.session, "released via id -> idle -> reusable");
  });

  await check("release() of a session whose browser already closed drops it at once, not after the idle window", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    a.session.closed = true; // server.js tears a visible run's browser down itself, then releases
    sessions.release(a.id);
    assert.strictEqual(sessions.size(), 0);
  });

  await check("release(id, { closeNow }) closes the instance instead of parking it idle", async () => {
    sessions.closeAll();
    const f = factory();
    const a = await sessions.acquire("k", { create: f.create, max: 5 });
    sessions.release(a.id, { closeNow: true });
    await sleep(5);
    assert.strictEqual(a.session.closed, true);
    assert.strictEqual(sessions.size(), 0);
  });

  await check("a session whose browser reports disconnected is dead even though context.pages() still answers", async () => {
    // Real Playwright: a closed context's pages() returns [] instead of throwing, so the browser's
    // own connection state is the signal.
    sessions.closeAll();
    let connected = true;
    const create = async () => ({
      browser: { isConnected: () => connected },
      context: { pages: () => [] },
      async close() {},
    });
    const a = await sessions.acquire("k", { create, max: 5 });
    sessions.release(a.id);
    assert.ok(sessions.reuse("k"), "connected -> reusable");
    sessions.release(a.id);
    connected = false;
    assert.strictEqual(sessions.reuse("k"), null, "disconnected -> discarded");
    assert.strictEqual(sessions.size(), 0);
  });

  await check("releasing an unknown id is a harmless no-op", () => {
    assert.doesNotThrow(() => sessions.release("nope"));
  });

  sessions.closeAll();
  console.log(`\n${pass} passed`);
  process.exit(process.exitCode || 0);
}

run();
