"use strict";

// scheduler_cli.js — pause/resume/run-now used to report success even with no daemon running,
// leaving a stale command file for whatever daemon starts next (possibly days later) to fire
// unexpectedly. This pins the fix: no live daemon lock -> refuse, exit 1, nothing left behind.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { run } = require("../../app/scheduler_cli");

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "conxa-sched-cli-"));
}

async function withDataDir(dir, fn) {
  const prev = process.env.CONXA_DATA_DIR;
  process.env.CONXA_DATA_DIR = dir;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.CONXA_DATA_DIR; else process.env.CONXA_DATA_DIR = prev;
  }
}

test("pause refuses (exit 1) and leaves no command file when no daemon is running", async () => {
  const dir = tmpDataDir();
  const code = await withDataDir(dir, () => run(["schedule", "pause"]));
  assert.strictEqual(code, 1);
  const commandsDir = path.join(dir, "scheduler", "commands");
  const left = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir) : [];
  assert.deepStrictEqual(left, []);
});

test("resume refuses (exit 1) with no daemon running", async () => {
  const dir = tmpDataDir();
  const code = await withDataDir(dir, () => run(["schedule", "resume"]));
  assert.strictEqual(code, 1);
});

test("run-now refuses (exit 1) with no daemon running, even for a real schedule id", async () => {
  const dir = tmpDataDir();
  const { createStore } = require("../../app/scheduler_store");
  const store = createStore({ dataDir: dir, getSessionKeyFn: async () => require("crypto").randomBytes(32).toString("hex"), log: () => {} });
  const rec = await store.create({ slug: "s", cron: "0 6 * * *" });

  const code = await withDataDir(dir, () => run(["schedule", "run-now", rec.id]));
  assert.strictEqual(code, 1);
  const commandsDir = path.join(dir, "scheduler", "commands");
  const left = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir) : [];
  assert.deepStrictEqual(left, []);
});

test("pause succeeds and writes a command file when a live daemon lock is present", async () => {
  const dir = tmpDataDir();
  const schedDir = path.join(dir, "scheduler");
  fs.mkdirSync(schedDir, { recursive: true });
  fs.writeFileSync(path.join(schedDir, "daemon.lock"), JSON.stringify({ pid: process.pid, heartbeat_at: new Date().toISOString() }));

  const code = await withDataDir(dir, () => run(["schedule", "pause"]));
  assert.strictEqual(code, 0);
  const commandsDir = path.join(schedDir, "commands");
  const left = fs.readdirSync(commandsDir);
  assert.strictEqual(left.length, 1);
  const cmd = JSON.parse(fs.readFileSync(path.join(commandsDir, left[0]), "utf8"));
  assert.strictEqual(cmd.type, "pause");
});
