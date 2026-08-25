"use strict";

// scheduler_store.js — local schedule records (PROD-5). Pinned here: validation
// (bad cron/grace rejected at the door), encrypted-at-rest inputs with a REAL
// AES-256-GCM roundtrip, listMeta() never exposing input values, atomic writes
// leaving no .tmp litter, and one corrupt file never losing the rest of the store.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const { createStore } = require("../../app/scheduler_store");

const KEY_HEX = crypto.randomBytes(32).toString("hex");

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "conxa-sched-store-"));
}

function makeStore(dataDir) {
  return createStore({
    dataDir,
    getSessionKeyFn: async () => KEY_HEX,
    log: () => {},
  });
}

test("create validates cron, slug, and grace before touching disk", async () => {
  const store = makeStore(tmpDataDir());
  await assert.rejects(() => store.create({ slug: "x", cron: "not a cron" }), /cron|fields/i);
  await assert.rejects(() => store.create({ slug: "", cron: "0 6 * * *" }), /slug/);
  await assert.rejects(() => store.create({ slug: "x", cron: "0 6 * * *", catchup_grace_minutes: -1 }), /grace/);
});

test("create/list/get roundtrip decrypts inputs; listMeta NEVER exposes them", async () => {
  const dir = tmpDataDir();
  const store = makeStore(dir);
  const rec = await store.create({
    slug: "weekly-report",
    cron: "0 6 * * 1",
    name: "Weekly report",
    inputs: { api_key: "secret-value" },
  });

  const full = await store.list();
  assert.strictEqual(full.length, 1);
  assert.deepStrictEqual(full[0].inputs, { api_key: "secret-value" });

  const meta = store.listMeta();
  assert.strictEqual(meta.length, 1);
  assert.strictEqual(meta[0].has_inputs, true);
  assert.strictEqual("inputs" in meta[0], false);
  assert.strictEqual("inputs_enc" in meta[0], false);

  const got = await store.get(rec.id);
  assert.deepStrictEqual(got.inputs, { api_key: "secret-value" });
});

test("inputs are actually ciphertext on disk (AES-256-GCM, not plaintext JSON)", async () => {
  const dir = tmpDataDir();
  const store = makeStore(dir);
  const rec = await store.create({ slug: "s", cron: "0 6 * * *", inputs: { password: "hunter2" } });
  const raw = fs.readFileSync(path.join(dir, "scheduler", "schedules", `${rec.id}.json`), "utf8");
  assert.ok(!raw.includes("hunter2"), "input values must never appear in plaintext on disk");
  const parsed = JSON.parse(raw);
  assert.ok(parsed.inputs_enc.iv && parsed.inputs_enc.tag && parsed.inputs_enc.data);
});

test("update allows only whitelisted fields; unknown fields are refused", async () => {
  const store = makeStore(tmpDataDir());
  const rec = await store.create({ slug: "s", cron: "0 6 * * *" });
  await assert.rejects(() => store.update(rec.id, { slug: "evil" }), /not updatable/);
  const updated = await store.update(rec.id, { enabled: false, last_slot_fired: "2026-08-26T06:00:00.000Z" });
  assert.strictEqual(updated.enabled, false);
  assert.strictEqual(updated.last_slot_fired, "2026-08-26T06:00:00.000Z");
});

test("update rejects invalid cron and negative grace", async () => {
  const store = makeStore(tmpDataDir());
  const rec = await store.create({ slug: "s", cron: "0 6 * * *" });
  await assert.rejects(() => store.update(rec.id, { cron: "bogus" }), /cron|fields/i);
  await assert.rejects(() => store.update(rec.id, { catchup_grace_minutes: -5 }), /grace/);
});

test("remove deletes only the named record; missing id returns false", async () => {
  const store = makeStore(tmpDataDir());
  const a = await store.create({ slug: "a", cron: "0 6 * * *" });
  const b = await store.create({ slug: "b", cron: "0 7 * * *" });
  assert.strictEqual(await store.remove(a.id), true);
  assert.strictEqual(store.listMeta().length, 1);
  assert.strictEqual(store.listMeta()[0].id, b.id);
  assert.strictEqual(await store.remove(a.id), false);
});

test("malformed ids are refused before they can touch the filesystem", async () => {
  const store = makeStore(tmpDataDir());
  await assert.rejects(() => store.update("../escape", { enabled: false }), /invalid schedule id/);
  assert.throws(() => store.remove("sch_; rm -rf"), /invalid schedule id/);
});

test("one corrupt file is skipped — the rest of the store survives", () => {
  const dir = tmpDataDir();
  const store = makeStore(dir);
  return (async () => {
    await store.create({ slug: "good", cron: "0 6 * * *" });
    fs.writeFileSync(path.join(dir, "scheduler", "schedules", "sch_garbage.json"), "{not json");
    const rows = store.listMeta();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].slug, "good");
  })();
});

test("writes leave no .tmp litter behind", async () => {
  const dir = tmpDataDir();
  const store = makeStore(dir);
  await store.create({ slug: "s", cron: "0 6 * * *" });
  const files = fs.readdirSync(path.join(dir, "scheduler", "schedules"));
  assert.ok(files.every((f) => !f.endsWith(".tmp")), `found tmp files: ${files}`);
});
