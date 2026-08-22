"use strict";
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// Each skill is a versioned component (skill-packs/<workspace_id>/<group>/<slug>/v1.0.0/ +
// current/, see runtime/version_manager.js). skillDir always points at the `current`
// junction, which the OS resolves transparently to the active version dir for every fs
// call below. `group` is the skill's entry in pack.skill_groups (falls back to
// "_default" — see runtime/sync.js for why every skill always has one).
function _skillCurrentDir(workspaceDir, group, slug) {
  return path.join(workspaceDir, group, slug, "current");
}

// Scan skill-packs/ dir → flat index { "workspace_id:slug": {slug, workspace_id, skillDir, manifest, pack} }
function loadSkillRegistry(skillPacksDir, cacheDir) {
  const index = {};
  if (!fs.existsSync(skillPacksDir)) return index;

  for (const workspaceId of fs.readdirSync(skillPacksDir)) {
    const workspaceDir = path.join(skillPacksDir, workspaceId);
    let stat;
    try { stat = fs.statSync(workspaceDir); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    const packPath = path.join(workspaceDir, "pack.json");
    if (!fs.existsSync(packPath)) continue;

    let pack;
    try { pack = JSON.parse(fs.readFileSync(packPath, "utf8")); } catch (_) { continue; }

    const skillGroups = pack.skill_groups || {};
    for (const slug of (pack.skills || [])) {
      const group         = skillGroups[slug] || "_default";
      const skillDir     = _skillCurrentDir(workspaceDir, group, slug);
      const manifestPath = path.join(skillDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      let manifest;
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (_) { continue; }
      index[`${workspaceId}:${slug}`] = { slug, workspace_id: workspaceId, skillDir, manifest, pack };
    }
  }

  // Persist flat index to cache for fast startup
  if (cacheDir) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, "manifests.json"), JSON.stringify(index, null, 2));
    } catch (_) {}
  }

  return index;
}

// Load from cache (instant) — falls back to full scan if cache missing
function loadSkillRegistryFromCache(skillPacksDir, cacheDir) {
  const cachePath = path.join(cacheDir, "manifests.json");
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch (_) {}
  }
  return loadSkillRegistry(skillPacksDir, cacheDir);
}

// Verify SHA-256 checksums declared in manifest.json
// Throws Error if any file is missing or hash mismatches
function verifySkillIntegrity(skillDir, manifest, label) {
  const checksums = manifest.checksum || {};
  // skillDir normally resolves through a `current` junction, so path.basename(skillDir)
  // would just say "current" — prefer an explicit label (the skill slug) when given.
  const name = label || path.basename(skillDir);
  for (const [file, expected] of Object.entries(checksums)) {
    const fullPath = path.join(skillDir, file);
    if (!fs.existsSync(fullPath))
      throw new Error(`Integrity: missing ${file} in ${name}`);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
    if (actual !== expected)
      throw new Error(`Integrity: ${file} checksum mismatch`);
  }
}

// Reload a single skill in the live index without process restart
function hotReloadSkill(workspace_id, slug, skillPacksDir, index) {
  const packPath = path.join(skillPacksDir, workspace_id, "pack.json");
  const pack     = fs.existsSync(packPath) ? JSON.parse(fs.readFileSync(packPath, "utf8")) : {};
  const group    = (pack.skill_groups || {})[slug] || "_default";
  const skillDir     = _skillCurrentDir(path.join(skillPacksDir, workspace_id), group, slug);
  const manifestPath = path.join(skillDir, "manifest.json");
  const key          = `${workspace_id}:${slug}`;
  if (!fs.existsSync(manifestPath)) {
    delete index[key];
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    index[key] = { slug, workspace_id, skillDir, manifest, pack };
  } catch (_) {}
}

module.exports = { loadSkillRegistry, loadSkillRegistryFromCache, verifySkillIntegrity, hotReloadSkill };
