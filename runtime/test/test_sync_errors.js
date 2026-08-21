"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { collectSyncErrors } = require("../sync_errors");

function mkSkillPacksDir(companies) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "se-test-"));
  for (const [company, pack] of Object.entries(companies)) {
    const companyDir = path.join(dir, company);
    fs.mkdirSync(companyDir, { recursive: true });
    if (pack !== undefined) {
      fs.writeFileSync(path.join(companyDir, "pack.json"), JSON.stringify(pack));
    }
  }
  return dir;
}

test("reads last_sync_errors off each company's pack.json", () => {
  const dir = mkSkillPacksDir({
    acme: { last_sync_errors: { deploy: { code: "checksum_mismatch", at: "2026-08-19T00:00:00Z" } } },
  });
  assert.deepStrictEqual(collectSyncErrors(dir), {
    acme: { deploy: { code: "checksum_mismatch", at: "2026-08-19T00:00:00Z" } },
  });
});

test("a company with no errors this round is omitted, not reported as {}", () => {
  const dir = mkSkillPacksDir({ acme: { last_sync_errors: {} } });
  assert.deepStrictEqual(collectSyncErrors(dir), {});
});

test("a company with no pack.json yet is skipped", () => {
  const dir = mkSkillPacksDir({ acme: undefined });
  assert.deepStrictEqual(collectSyncErrors(dir), {});
});

test("corrupt pack.json for one company doesn't break reporting for the rest", () => {
  const dir = mkSkillPacksDir({
    broken: { __raw__: true },
    ok: { last_sync_errors: { deploy: { code: "download_failed", at: "2026-08-19T00:00:00Z" } } },
  });
  fs.writeFileSync(path.join(dir, "broken", "pack.json"), "{not json");
  assert.deepStrictEqual(collectSyncErrors(dir), {
    ok: { deploy: { code: "download_failed", at: "2026-08-19T00:00:00Z" } },
  });
});

test("a missing skill-packs directory reports no companies", () => {
  assert.deepStrictEqual(collectSyncErrors(path.join(os.tmpdir(), "se-test-does-not-exist")), {});
});
