"use strict";
// Covers the Free-tier machine lock: loadSkillRegistry must exclude a
// company's skills entirely when pack.json.build_machine_id doesn't match
// the current machine, and must include them (as before) when it matches
// or is absent (paid tiers never get the field — see backend.py's publish
// flow and skill_loader.js's own comment).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadSkillRegistry } = require("../skill_loader");
const { getMachineIdHash } = require("../machine_hash");

function mkSkillPacksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-loader-test-"));
}

function writeCompany(skillPacksDir, company, pack, skills) {
  const companyDir = path.join(skillPacksDir, company);
  fs.mkdirSync(companyDir, { recursive: true });
  fs.writeFileSync(path.join(companyDir, "pack.json"), JSON.stringify(pack, null, 2));
  for (const slug of skills) {
    const currentDir = path.join(companyDir, slug, "current");
    fs.mkdirSync(currentDir, { recursive: true });
    fs.writeFileSync(path.join(currentDir, "manifest.json"), JSON.stringify({ name: slug }));
  }
}

test("a company with no build_machine_id loads normally (paid tiers)", () => {
  const dir = mkSkillPacksDir();
  writeCompany(dir, "acme", { company: "acme", skills: ["skill-a"] }, ["skill-a"]);

  const index = loadSkillRegistry(dir, null);

  assert.ok(index["acme:skill-a"], "unlocked company must be indexed");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a company whose build_machine_id matches this machine loads normally", () => {
  const dir = mkSkillPacksDir();
  const currentHash = getMachineIdHash();
  if (!currentHash) return; // can't exercise the match path without a real hash on this host
  writeCompany(dir, "acme", { company: "acme", skills: ["skill-a"], build_machine_id: currentHash }, ["skill-a"]);

  const index = loadSkillRegistry(dir, null);

  assert.ok(index["acme:skill-a"], "matching machine must still be indexed");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a company whose build_machine_id mismatches this machine is excluded", () => {
  const dir = mkSkillPacksDir();
  writeCompany(
    dir,
    "locked-co",
    { company: "locked-co", skills: ["skill-a"], build_machine_id: "not-this-machine" },
    ["skill-a"]
  );
  writeCompany(dir, "unlocked-co", { company: "unlocked-co", skills: ["skill-b"] }, ["skill-b"]);

  const index = loadSkillRegistry(dir, null);

  assert.ok(!index["locked-co:skill-a"], "mismatched machine must exclude that company entirely");
  assert.ok(index["unlocked-co:skill-b"], "other companies on this machine must be unaffected");
  fs.rmSync(dir, { recursive: true, force: true });
});
