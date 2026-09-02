"use strict";
// The sync's SECOND pass — recovery artifacts.
//
// Pass one is the code files: workflows cannot run without them, so it stays inside the sync's
// hard timeout and the execution gate opens the moment it activates. Artifacts are bytes, and
// they are only ever read when a step FAILS and reaches the agent recovery tier — which for a
// healthy skill is never. So pass two is deliberately unawaited, and every failure mode in it
// must be silent: a missing screenshot costs the agent tier one signal out of several, whereas
// a sync marked failed would make a perfectly working skill look broken.

const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");
const crypto = require("crypto");

const sync        = require("../../app/sync");
const store       = require("../../app/artifact_store");
const httpClient  = require("../../app/http_client");
const hostBridge  = require("../../app/host_bridge");

let tmpDirs = [];
function tmpSkillPacks() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-artifacts-"));
  tmpDirs.push(dir);
  const skillPacksDir = path.join(dir, "skill-packs");
  fs.mkdirSync(skillPacksDir, { recursive: true });
  return skillPacksDir;
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Build a real zip so the extraction path under test is the real one (adm-zip), not a stub.
function makeZip(files) {
  const AdmZip = hostBridge.hostRequire("adm-zip");
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, content);
  return zip.toBuffer();
}

function withPost(handler, fn) {
  const original = httpClient.postForBuffer;
  httpClient.postForBuffer = handler;
  return Promise.resolve(fn()).finally(() => { httpClient.postForBuffer = original; });
}

function zipResponse(buf) {
  return { body: buf, statusCode: 200, headers: { "x-artifact-sha256": sha(buf) } };
}

test.after?.(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ── endpoint derivation ─────────────────────────────────────────────────────────────────────

test("the artifact endpoint is derived from the versioned delta endpoint", () => {
  assert.strictEqual(
    sync._artifactEndpoint("https://api.example/api/v1/workflows/v1/ws-1/skill-packs/delta", "checkout"),
    "https://api.example/api/v1/workflows/v1/ws-1/skill-packs/checkout/artifacts",
  );
});

test("a legacy unversioned sync endpoint yields no artifact endpoint", () => {
  // There is no artifact route on the legacy shape. Returning null here is what makes such a
  // pack skip pass two entirely rather than POST at a URL that does not exist.
  assert.strictEqual(sync._artifactEndpoint("https://api.example/api/v1/skill-packs/ws-1/delta", "checkout"), null);
  assert.strictEqual(sync._artifactEndpoint("", "checkout"), null);
});

// ── the pass itself ─────────────────────────────────────────────────────────────────────────

function task(skillPacksDir, artifacts, { skillDir = null } = {}) {
  return {
    workspace_id: "ws-1",
    slug: "checkout",
    url: "https://api.example/api/v1/workflows/v1/ws-1/skill-packs/checkout/artifacts",
    token: "sync-token",
    artifacts,
    skillDir,
  };
}

test("fetches only what is missing, and sends the hashes it already holds", async () => {
  const skillPacksDir = tmpSkillPacks();
  const a = Buffer.from("shot-one");
  const b = Buffer.from("shot-two");
  store.put(skillPacksDir, sha(a), "visuals/Image_1.jpg", a);   // already on disk

  const listing = [
    { path: "visuals/Image_1.jpg", sha256: sha(a) },
    { path: "visuals/Image_2.jpg", sha256: sha(b) },
  ];

  let sentHave = null;
  await withPost(async (_url, opts) => {
    sentHave = opts.json.have;
    return zipResponse(makeZip({ "visuals/Image_2.jpg": b }));
  }, () => sync._syncArtifacts(skillPacksDir, [task(skillPacksDir, listing)], () => {}));

  assert.deepStrictEqual(sentHave, [sha(a)], "the request IS the delta computation");
  assert.ok(store.has(skillPacksDir, sha(b), "visuals/Image_2.jpg"));
});

test("a skill whose artifacts are all present makes no request at all", async () => {
  const skillPacksDir = tmpSkillPacks();
  const a = Buffer.from("shot-one");
  store.put(skillPacksDir, sha(a), "visuals/Image_1.jpg", a);

  let called = false;
  await withPost(async () => { called = true; return zipResponse(makeZip({})); },
    () => sync._syncArtifacts(
      skillPacksDir,
      [task(skillPacksDir, [{ path: "visuals/Image_1.jpg", sha256: sha(a) }])],
      () => {},
    ));

  assert.strictEqual(called, false, "nothing missing means nothing to ask for");
});

test("a zip entry the listing never described is ignored", async () => {
  const skillPacksDir = tmpSkillPacks();
  const wanted = Buffer.from("legit");
  const smuggled = Buffer.from("not-in-the-listing");

  await withPost(async () => zipResponse(makeZip({
    "visuals/Image_1.jpg": wanted,
    "visuals/Image_666.jpg": smuggled,
  })), () => sync._syncArtifacts(
    skillPacksDir,
    [task(skillPacksDir, [{ path: "visuals/Image_1.jpg", sha256: sha(wanted) }])],
    () => {},
  ));

  assert.ok(store.has(skillPacksDir, sha(wanted), "visuals/Image_1.jpg"));
  assert.strictEqual(fs.readdirSync(store.storeDir(skillPacksDir)).length, 1,
    "only files the delta vouched for are stored");
});

test("a corrupted archive stores nothing and never throws", async () => {
  const skillPacksDir = tmpSkillPacks();
  const real = Buffer.from("real-bytes");
  const listing = [{ path: "visuals/Image_1.jpg", sha256: sha(real) }];

  const logs = [];
  await withPost(
    // Bytes that do not match the hash the listing named — corrupted or substituted in transit.
    async () => zipResponse(makeZip({ "visuals/Image_1.jpg": Buffer.from("tampered") })),
    () => sync._syncArtifacts(skillPacksDir, [task(skillPacksDir, listing)], (m) => logs.push(m)),
  );

  assert.ok(!store.has(skillPacksDir, sha(real), "visuals/Image_1.jpg"));
  assert.ok(logs.some(m => /artifacts:warn/.test(m)), "logged, not thrown");
});

test("an archive whose own checksum does not match is rejected wholesale", async () => {
  const skillPacksDir = tmpSkillPacks();
  const content = Buffer.from("shot");
  const listing = [{ path: "visuals/Image_1.jpg", sha256: sha(content) }];

  await withPost(async () => ({
    body: makeZip({ "visuals/Image_1.jpg": content }),
    statusCode: 200,
    headers: { "x-artifact-sha256": sha(Buffer.from("some other archive")) },
  }), () => sync._syncArtifacts(skillPacksDir, [task(skillPacksDir, listing)], () => {}));

  assert.ok(!store.has(skillPacksDir, sha(content), "visuals/Image_1.jpg"),
    "nothing is extracted from an archive that is not the one the server said it sent");
});

test("a network failure on one skill never stops the next one", async () => {
  const skillPacksDir = tmpSkillPacks();
  const b = Buffer.from("second-skill-shot");
  const failing = task(skillPacksDir, [{ path: "visuals/Image_1.jpg", sha256: sha(Buffer.from("x")) }]);
  const working = { ...task(skillPacksDir, [{ path: "visuals/Image_1.jpg", sha256: sha(b) }]), slug: "refund" };

  let call = 0;
  const logs = [];
  await withPost(async () => {
    if (++call === 1) throw new Error("network down");
    return zipResponse(makeZip({ "visuals/Image_1.jpg": b }));
  }, () => sync._syncArtifacts(skillPacksDir, [failing, working], (m) => logs.push(m)));

  assert.ok(store.has(skillPacksDir, sha(b), "visuals/Image_1.jpg"), "the second skill still synced");
  assert.ok(logs.some(m => /network down/.test(m)));
});

test("the path→hash index is written so recovery can find the image later", async () => {
  const skillPacksDir = tmpSkillPacks();
  const skillDir = path.join(skillPacksDir, "ws-1", "_default", "checkout", "v1");
  fs.mkdirSync(skillDir, { recursive: true });

  const content = Buffer.from("reference-shot");
  const listing = [{ path: "visuals/Image_3.jpg", sha256: sha(content) }];

  await withPost(async () => zipResponse(makeZip({ "visuals/Image_3.jpg": content })),
    () => sync._syncArtifacts(skillPacksDir, [task(skillPacksDir, listing, { skillDir })], () => {}));

  // The store is keyed by CONTENT; recovery.json only knows the PATH. Without this index the
  // bytes would be on disk and unreachable.
  const resolved = store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_3.jpg");
  assert.ok(resolved, "visual_ref resolves through the index to the stored file");
  assert.deepStrictEqual(fs.readFileSync(resolved), content);
});

test("the index is still written when the download fails, for artifacts already stored", async () => {
  const skillPacksDir = tmpSkillPacks();
  const skillDir = path.join(skillPacksDir, "ws-1", "_default", "checkout", "v1");
  fs.mkdirSync(skillDir, { recursive: true });

  const stored = Buffer.from("already-here");
  const missing = Buffer.from("never-arrives");
  store.put(skillPacksDir, sha(stored), "visuals/Image_1.jpg", stored);

  const listing = [
    { path: "visuals/Image_1.jpg", sha256: sha(stored) },
    { path: "visuals/Image_2.jpg", sha256: sha(missing) },
  ];

  await withPost(async () => { throw new Error("network down"); },
    () => sync._syncArtifacts(skillPacksDir, [task(skillPacksDir, listing, { skillDir })], () => {}));

  assert.ok(store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_1.jpg"),
    "a failed fetch must not also cost the index for what already landed");
  assert.strictEqual(store.resolveByPath(skillPacksDir, skillDir, "visuals/Image_2.jpg"), null);
});
