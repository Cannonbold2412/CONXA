"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { installedSkillVersions } = require("../installed_versions");

function mkSkillDir(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iv-test-"));
  if (version !== undefined) {
    fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ skill_version: version }));
  }
  return dir;
}

test("reads each skill's installed version off its current-junction dir", () => {
  const skillIndex = {
    "acme:deploy": { workspace_id: "acme", slug: "deploy", skillDir: mkSkillDir("1.1.0") },
    "acme:invoice": { workspace_id: "acme", slug: "invoice", skillDir: mkSkillDir("2.0.0") },
  };
  assert.deepStrictEqual(installedSkillVersions(skillIndex), {
    acme: { deploy: "1.1.0", invoice: "2.0.0" },
  });
});

test("groups multiple companies separately", () => {
  const skillIndex = {
    "acme:deploy": { workspace_id: "acme", slug: "deploy", skillDir: mkSkillDir("1.0.0") },
    "other:sync": { workspace_id: "other", slug: "sync", skillDir: mkSkillDir("3.0.0") },
  };
  assert.deepStrictEqual(installedSkillVersions(skillIndex), {
    acme: { deploy: "1.0.0" },
    other: { sync: "3.0.0" },
  });
});

test("a skill with no version.json yet is omitted, not reported as \"0\"", () => {
  const skillIndex = {
    "acme:deploy": { workspace_id: "acme", slug: "deploy", skillDir: mkSkillDir(undefined) },
  };
  assert.deepStrictEqual(installedSkillVersions(skillIndex), {});
});

test("corrupt version.json for one skill doesn't break reporting for the rest", () => {
  const badDir = fs.mkdtempSync(path.join(os.tmpdir(), "iv-test-"));
  fs.writeFileSync(path.join(badDir, "version.json"), "{not json");
  const skillIndex = {
    "acme:broken": { workspace_id: "acme", slug: "broken", skillDir: badDir },
    "acme:ok": { workspace_id: "acme", slug: "ok", skillDir: mkSkillDir("1.0.0") },
  };
  assert.deepStrictEqual(installedSkillVersions(skillIndex), {
    acme: { ok: "1.0.0" },
  });
});

test("empty skill index reports no companies", () => {
  assert.deepStrictEqual(installedSkillVersions({}), {});
});
