"use strict";
const test   = require("node:test");
const assert = require("node:assert");
const fs   = require("fs");
const os   = require("os");
const path = require("path");
const { MAX_STRIKES, shouldGate, recordLaunch } = require("../../app/update_gate");

const gt = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
};
const base = { running: "1.0.0", staged: "1.1.0", strikes: 1, skip: false, isLocalDev: false, gt };

test("newer staged gates", () => assert.strictEqual(shouldGate(base), true));
test("rolled-back / equal staged never gates", () => {
  assert.strictEqual(shouldGate({ ...base, staged: "0.9.0" }), false);
  assert.strictEqual(shouldGate({ ...base, staged: "1.0.0" }), false);
});
test("nothing staged, local dev, or skip env never gates", () => {
  assert.strictEqual(shouldGate({ ...base, staged: null }), false);
  assert.strictEqual(shouldGate({ ...base, isLocalDev: true }), false);
  assert.strictEqual(shouldGate({ ...base, skip: true }), false);
});
test("strike ceiling releases the gate", () => {
  assert.strictEqual(shouldGate({ ...base, strikes: MAX_STRIKES }), true);
  assert.strictEqual(shouldGate({ ...base, strikes: MAX_STRIKES + 1 }), false);
});
test("recordLaunch counts per staged version and clears when nothing is staged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-gate-"));
  assert.strictEqual(recordLaunch(dir, "1.1.0"), 1);
  assert.strictEqual(recordLaunch(dir, "1.1.0"), 2);
  assert.strictEqual(recordLaunch(dir, "1.2.0"), 1);
  assert.strictEqual(recordLaunch(dir, null), 0);
  assert.strictEqual(fs.existsSync(path.join(dir, "update-gate.json")), false);
});
