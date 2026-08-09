"use strict";
// Node-side counterpart to conxa-builder/python/services/machine_id.py — must
// produce the same hash for the same physical machine (see machine_hash.js
// header comment). Verified manually against the Python side during
// development; these tests only cover this module's own contract.

const test = require("node:test");
const assert = require("node:assert");

const { getMachineIdHash } = require("../machine_hash");

test("returns a stable value across repeated calls", () => {
  const first = getMachineIdHash();
  const second = getMachineIdHash();
  assert.strictEqual(first, second);
});

test("returns either a 64-char sha256 hex string or empty string", () => {
  const hash = getMachineIdHash();
  assert.ok(hash === "" || /^[a-f0-9]{64}$/.test(hash), `unexpected shape: ${hash}`);
});
