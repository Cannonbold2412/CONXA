"use strict";
// Pure-function coverage for manifest_manager.js's decision logic: rollout bucketing,
// update decisions, and Ed25519 signature verification. Deliberately excludes the
// network/download/activate path (requires a TLS cert + a real packed exe to exercise
// --selfcheck meaningfully) — that round trip is validated manually per the canary
// checklist in docs/TRD.md rather than as a lightweight per-commit unit test.

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

const mm = require("../manifest_manager");

// ── rolloutBucket ──────────────────────────────────────────────────────────────

test("rolloutBucket is deterministic for the same (installId, component)", () => {
  const a = mm.rolloutBucket("install-abc", "conxa_app");
  const b = mm.rolloutBucket("install-abc", "conxa_app");
  assert.strictEqual(a, b);
  assert.ok(a >= 0 && a < 100);
});

test("rolloutBucket is roughly uniform across many install ids", () => {
  let below50 = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    if (mm.rolloutBucket(`install-${i}`, "conxa_app") < 50) below50++;
  }
  const frac = below50 / N;
  assert.ok(frac > 0.4 && frac < 0.6, `expected ~50% under bucket 50, got ${frac}`);
});

test("rolloutBucket is salted per component — one install isn't globally first-or-last", () => {
  // Not a strict mathematical guarantee for any single install, but the two buckets
  // must be produced by genuinely different hash inputs, not just copies of one value.
  const appBucket = mm.rolloutBucket("install-xyz", "conxa_app");
  const runtimeBucket = mm.rolloutBucket("install-xyz", "conxa_runtime");
  const skillBucket = mm.rolloutBucket("install-xyz", "skill_packs:acme:invoice-automation");
  const buckets = new Set([appBucket, runtimeBucket, skillBucket]);
  assert.ok(buckets.size >= 2, "salting should usually produce different buckets per component");
});

// ── decideUpdate ────────────────────────────────────────────────────────────────

test("decideUpdate: nothing installed yet always takes the manifest version", () => {
  const d = mm.decideUpdate({ componentName: "conxa_app", manifestEntry: { version: "1.2.0" }, currentVersion: null, installId: "x" });
  assert.strictEqual(d.update, true);
  assert.strictEqual(d.reason, "not_installed");
});

test("decideUpdate: already at the manifest version is a no-op", () => {
  const d = mm.decideUpdate({ componentName: "conxa_app", manifestEntry: { version: "1.2.0" }, currentVersion: "1.2.0", installId: "x" });
  assert.strictEqual(d.update, false);
  assert.strictEqual(d.reason, "up_to_date");
});

test("decideUpdate: never auto-downgrades", () => {
  const d = mm.decideUpdate({ componentName: "conxa_app", manifestEntry: { version: "1.0.0" }, currentVersion: "1.2.0", installId: "x" });
  assert.strictEqual(d.update, false);
});

test("decideUpdate: required=true bypasses rollout gating entirely", () => {
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", required: true, rollout: { percentage: 0 } },
    currentVersion: "1.0.0", installId: "x",
  });
  assert.strictEqual(d.update, true);
  assert.strictEqual(d.reason, "required");
});

test("decideUpdate: below the minimum_versions floor forces an update even at 0% rollout", () => {
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", rollout: { percentage: 0 } },
    currentVersion: "0.5.0", installId: "x", minimumVersion: "1.0.0",
  });
  assert.strictEqual(d.update, true);
  assert.strictEqual(d.reason, "below_minimum_version");
});

test("decideUpdate: a halted rollout blocks updates even at 100%", () => {
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", rollout: { percentage: 100, halted: true } },
    currentVersion: "1.0.0", installId: "x",
  });
  assert.strictEqual(d.update, false);
  assert.strictEqual(d.reason, "rollout_halted");
});

test("decideUpdate: 0% rollout excludes every install", () => {
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", rollout: { percentage: 0 } },
    currentVersion: "1.0.0", installId: "any-install-id",
  });
  assert.strictEqual(d.update, false);
  assert.strictEqual(d.reason, "rollout_out");
});

test("decideUpdate: 100% rollout includes every install without hashing", () => {
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", rollout: { percentage: 100 } },
    currentVersion: "1.0.0", installId: "any-install-id",
  });
  assert.strictEqual(d.update, true);
  assert.strictEqual(d.reason, "rollout_100");
});

test("decideUpdate: a partial rollout is consistent with rolloutBucket for the same inputs", () => {
  const installId = "consistency-check-install";
  const bucket = mm.rolloutBucket(installId, "conxa_app");
  const pct = bucket + 1; // just inside the window
  const d = mm.decideUpdate({
    componentName: "conxa_app",
    manifestEntry: { version: "2.0.0", rollout: { percentage: pct } },
    currentVersion: "1.0.0", installId,
  });
  assert.strictEqual(d.update, true, "install should be included once the rollout window passes its own bucket");
});

// ── verifyManifestSignature (Ed25519, Node-native keypair) ──────────────────────

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") return Object.keys(obj).sort().reduce((a, k) => { a[k] = sortKeysDeep(obj[k]); return a; }, {});
  return obj;
}

function signWith(privateKey, manifest) {
  const { signature, ...unsigned } = manifest;
  const canonical = JSON.stringify(sortKeysDeep(unsigned));
  return crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");
}

test("verifyManifestSignature accepts a validly signed manifest and rejects tampering", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubB64 = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64");

  const manifest = { conxa_app: { version: "1.0.0" }, signature: "" };
  manifest.signature = signWith(privateKey, manifest);

  assert.strictEqual(mm.verifyManifestSignature(manifest, pubB64), true);

  const tampered = { ...manifest, conxa_app: { version: "9.9.9" } };
  assert.strictEqual(mm.verifyManifestSignature(tampered, pubB64), false);
});

test("verifyManifestSignature rejects an empty or missing signature/public key", () => {
  assert.strictEqual(mm.verifyManifestSignature({ a: 1, signature: "" }, "somekey=="), false);
  assert.strictEqual(mm.verifyManifestSignature({ a: 1, signature: "abc=" }, ""), false);
  assert.strictEqual(mm.verifyManifestSignature(null, "somekey=="), false);
});

test("verifyManifestSignature rejects a signature verified against the wrong public key", () => {
  const kp1 = crypto.generateKeyPairSync("ed25519");
  const kp2 = crypto.generateKeyPairSync("ed25519");
  const wrongPubB64 = Buffer.from(kp2.publicKey.export({ format: "jwk" }).x, "base64url").toString("base64");

  const manifest = { a: 1, signature: "" };
  manifest.signature = signWith(kp1.privateKey, manifest);

  assert.strictEqual(mm.verifyManifestSignature(manifest, wrongPubB64), false);
});
