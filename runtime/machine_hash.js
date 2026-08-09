"use strict";
// Node-side counterpart to conxa-builder/python/services/machine_id.py — must
// produce the IDENTICAL hash for the same physical machine so a pack.json
// stamped with build_machine_id by Build Studio (Python) can be verified here.
// Both sides read the same Windows registry value
// (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid) and SHA-256 it the same way.
const crypto = require("crypto");

let _cache = null; // null = not yet computed; "" = computed, unavailable

function getMachineIdHash() {
  if (_cache !== null) return _cache;
  try {
    const { machineIdSync } = require("node-machine-id");
    const guid = machineIdSync(true); // raw MachineGuid, not pre-hashed
    _cache = guid ? crypto.createHash("sha256").update(String(guid), "utf-8").digest("hex") : "";
  } catch (_) {
    // Non-Windows, locked-down registry, or package unavailable — fails open,
    // matching machine_id.py's convention: callers skip enforcement on "".
    _cache = "";
  }
  return _cache;
}

module.exports = { getMachineIdHash };
