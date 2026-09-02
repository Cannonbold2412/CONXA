"use strict";
// Unit tests for artifact_store.js — the content-addressed store recovery artifacts land in.
//
// Naming files by their own hash is what makes the sync delta free: "do I already have this?"
// is answered locally, so the machine computes what it is missing and asks for exactly that.
// These tests pin the three properties that buys — dedupe, renumbering-immunity, and integrity.

const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");
const crypto = require("crypto");

const store = require("../../app/artifact_store");

let tmpDirs = [];
function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-store-"));
  tmpDirs.push(dir);
  const skillPacksDir = path.join(dir, "skill-packs");
  fs.mkdirSync(skillPacksDir, { recursive: true });
  return skillPacksDir;
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

test.after?.(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test("the store sits beside skill-packs, never inside it", () => {
  const skillPacksDir = tmpRoot();
  const dir = store.storeDir(skillPacksDir);
  assert.strictEqual(path.basename(dir), "artifacts");
  assert.strictEqual(path.dirname(dir), path.dirname(skillPacksDir));
  // version_manager prunes old version directories under skill-packs/. An artifact living in
  // there could be deleted while another retained version still points at it.
  assert.ok(!dir.startsWith(skillPacksDir + path.sep));
});

test("put stores under the hash and keeps the original extension", () => {
  const skillPacksDir = tmpRoot();
  const content = Buffer.from("screenshot-bytes");
  const target = store.put(skillPacksDir, sha(content), "visuals/Image_3.jpg", content);

  assert.strictEqual(path.basename(target), `${sha(content)}.jpg`);
  assert.ok(store.has(skillPacksDir, sha(content), "visuals/Image_3.jpg"));
  assert.deepStrictEqual(fs.readFileSync(target), content);
});

test("put refuses content that does not match the hash it was given", () => {
  const skillPacksDir = tmpRoot();
  const content = Buffer.from("real-bytes");
  const wrongSha = sha(Buffer.from("different-bytes"));

  assert.throws(
    () => store.put(skillPacksDir, wrongSha, "visuals/Image_1.jpg", content),
    /checksum mismatch/,
    "a store keyed by hash is only meaningful if the key is true of the bytes",
  );
  assert.ok(!store.has(skillPacksDir, wrongSha, "visuals/Image_1.jpg"), "nothing lands on a mismatch");
});

test("identical bytes stored under two different paths occupy one file", () => {
  const skillPacksDir = tmpRoot();
  const content = Buffer.from("same-login-screen");

  // Two different skills that both begin at the same login screen.
  store.put(skillPacksDir, sha(content), "visuals/Image_1.jpg", content);
  store.put(skillPacksDir, sha(content), "visuals/Image_9.jpg", content);

  const files = fs.readdirSync(store.storeDir(skillPacksDir));
  assert.strictEqual(files.length, 1, "content addressing means one copy, not one per reference");
});

test("haveHashes reports only what is genuinely on disk — that IS the delta", () => {
  const skillPacksDir = tmpRoot();
  const a = Buffer.from("first");
  const b = Buffer.from("second");
  store.put(skillPacksDir, sha(a), "visuals/Image_1.jpg", a);

  const listing = [
    { path: "visuals/Image_1.jpg", sha256: sha(a) },
    { path: "visuals/Image_2.jpg", sha256: sha(b) },
  ];
  assert.deepStrictEqual(store.haveHashes(skillPacksDir, listing), [sha(a)]);
  assert.strictEqual(store.missingCount(skillPacksDir, listing), 1);

  // An interrupted download resumes for free: whatever landed is already recognised.
  store.put(skillPacksDir, sha(b), "visuals/Image_2.jpg", b);
  assert.strictEqual(store.missingCount(skillPacksDir, listing), 0);
});

test("renaming a step does not invalidate its stored image", () => {
  // The builder names images positionally (Image_3.jpg), so inserting a step near the start
  // renames every image after it. A filename-based check would call that N changed files.
  const skillPacksDir = tmpRoot();
  const content = Buffer.from("unchanged-button-shot");
  store.put(skillPacksDir, sha(content), "visuals/Image_3.jpg", content);

  // Same bytes, new position after a step was inserted upstream.
  assert.ok(store.has(skillPacksDir, sha(content), "visuals/Image_4.jpg"),
    "the bytes did not change, so there is nothing to download");
  assert.deepStrictEqual(
    store.haveHashes(skillPacksDir, [{ path: "visuals/Image_4.jpg", sha256: sha(content) }]),
    [sha(content)],
  );
});

test("a malformed hash is rejected rather than used as a path", () => {
  const skillPacksDir = tmpRoot();
  assert.strictEqual(store.pathFor(skillPacksDir, "../../etc/passwd", "x.jpg"), null);
  assert.strictEqual(store.pathFor(skillPacksDir, "", "x.jpg"), null);
  assert.strictEqual(store.has(skillPacksDir, "not-a-hash", "x.jpg"), false);
  assert.throws(() => store.put(skillPacksDir, "nope", "x.jpg", Buffer.from("x")), /invalid artifact hash/);
});

test("resolveByPath maps a recovery.json visual_ref to the stored file", () => {
  const skillPacksDir = tmpRoot();
  const skillDir = path.join(skillPacksDir, "ws", "_default", "checkout", "v1");
  fs.mkdirSync(skillDir, { recursive: true });

  const content = Buffer.from("reference-image");
  store.put(skillPacksDir, sha(content), "visuals/Image_3.jpg", content);
  fs.writeFileSync(
    path.join(skillDir, store.ARTIFACT_INDEX_FILE),
    JSON.stringify({ artifacts: [{ path: "visuals/Image_3.jpg", sha256: sha(content) }] }),
  );

  const resolved = store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_3.jpg");
  assert.ok(resolved && fs.existsSync(resolved));
  assert.deepStrictEqual(fs.readFileSync(resolved), content);
});

test("resolveByPath returns null when the index or the file is missing — both are normal", () => {
  const skillPacksDir = tmpRoot();
  const skillDir = path.join(skillPacksDir, "ws", "_default", "checkout", "v1");
  fs.mkdirSync(skillDir, { recursive: true });

  // Pack synced before artifact sync shipped: no index at all.
  assert.strictEqual(store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_3.jpg"), null);

  // Index present, but the artifact pass has not fetched this one yet.
  const missingSha = sha(Buffer.from("not-downloaded"));
  fs.writeFileSync(
    path.join(skillDir, store.ARTIFACT_INDEX_FILE),
    JSON.stringify({ artifacts: [{ path: "visuals/Image_3.jpg", sha256: missingSha }] }),
  );
  assert.strictEqual(store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_3.jpg"), null);

  // A path the index never described.
  assert.strictEqual(store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_99.jpg"), null);
});
