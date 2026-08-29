"use strict";
// canonical_json.js — deterministic JSON serialization shared by manifest verification
// (manifest_manager.js) and evidence-chain hashing (tracker.js). Sorted keys, no
// whitespace. Mirrors conxa-cloud/backend/app/api/manifest_signer.py::_canonical_json
// exactly (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
// — that byte-for-byte agreement is what lets the cloud recompute a client-produced hash.

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") {
    return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = sortKeysDeep(obj[k]); return acc; }, {});
  }
  return obj;
}

// Canonical JSON of `obj` with `omitKeys` (top-level only) excluded — used for a signed
// manifest excluding its own `signature` field, or a chain-linked object excluding `h`.
function canonicalJSON(obj, omitKeys) {
  const omit = new Set(omitKeys || []);
  const filtered = {};
  for (const k of Object.keys(obj || {})) {
    if (!omit.has(k)) filtered[k] = obj[k];
  }
  return JSON.stringify(sortKeysDeep(filtered));
}

module.exports = { sortKeysDeep, canonicalJSON };
