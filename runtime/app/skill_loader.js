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

// Load from cache (instant) — falls back to full scan if cache missing.
// The cache can be stale relative to each workspace's pack.json (e.g. a skill
// archived on the server since the cache was written) — drop any cached entry
// whose slug isn't currently in that workspace's pack.skills before returning,
// the same filter loadSkillRegistry applies when it builds the index fresh.
function loadSkillRegistryFromCache(skillPacksDir, cacheDir) {
  const cachePath = path.join(cacheDir, "manifests.json");
  let cached = null;
  if (fs.existsSync(cachePath)) {
    try {
      cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch (_) {}
  }
  if (!cached) return loadSkillRegistry(skillPacksDir, cacheDir);

  const packsByWorkspace = {};
  const index = {};
  for (const [key, entry] of Object.entries(cached)) {
    if (!entry || !entry.workspace_id || !entry.slug) continue;
    if (!(entry.workspace_id in packsByWorkspace)) {
      const packPath = path.join(skillPacksDir, entry.workspace_id, "pack.json");
      try { packsByWorkspace[entry.workspace_id] = JSON.parse(fs.readFileSync(packPath, "utf8")); }
      catch (_) { packsByWorkspace[entry.workspace_id] = null; }
    }
    const pack = packsByWorkspace[entry.workspace_id];
    if (pack && (pack.skills || []).includes(entry.slug)) index[key] = entry;
  }
  return index;
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
  const key      = `${workspace_id}:${slug}`;
  // A skill no longer in pack.skills (archived server-side, or never synced)
  // must not be reloaded from disk even though its files are still there —
  // same rule loadSkillRegistry applies when building the index fresh.
  if (!(pack.skills || []).includes(slug)) {
    delete index[key];
    return;
  }
  const group    = (pack.skill_groups || {})[slug] || "_default";
  const skillDir     = _skillCurrentDir(path.join(skillPacksDir, workspace_id), group, slug);
  const manifestPath = path.join(skillDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    delete index[key];
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    index[key] = { slug, workspace_id, skillDir, manifest, pack };
  } catch (_) {}
}

// Re-read the on-disk manifest, then verify checksums. A long-lived runtime (Studio's
// reused sandbox process) can hold a stale skillIndex after files were restaged in
// place; verifying against that copy produces a false checksum mismatch. One retry
// covers a restage that finished between the first read and the hash.
function ensureSkillIntegrity(skillPacksDir, index, workspace_id, slug) {
  const key = `${workspace_id}:${slug}`;
  const attempt = () => {
    hotReloadSkill(workspace_id, slug, skillPacksDir, index);
    const entry = index[key];
    if (!entry) throw new Error(`Integrity: missing skill ${slug}`);
    verifySkillIntegrity(entry.skillDir, entry.manifest, entry.slug);
    return entry;
  };
  try {
    return attempt();
  } catch (first) {
    try {
      return attempt();
    } catch (_) {
      throw first;
    }
  }
}

module.exports = {
  loadSkillRegistry,
  loadSkillRegistryFromCache,
  verifySkillIntegrity,
  hotReloadSkill,
  ensureSkillIntegrity,
};
