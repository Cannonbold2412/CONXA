"use strict";
const fs = require("fs");
const path = require("path");

// {workspace_id: {skill_slug: installed_version}} — read straight off each skill's
// `current` junction (skillIndex[key].skillDir, as built by skill_loader.js),
// the same version.json file sync.js writes on every successful skill update.
// Used by server.js's phone-home telemetry for the release system's Deployment
// view — see docs/App-Flow.md. Pure function of the given index + filesystem
// state, so it's testable without booting server.js.
//
// Best-effort: a skill with no version.json yet (a very first install, before
// its first sync) is simply omitted rather than reporting a fabricated "0".
function installedSkillVersions(skillIndex) {
  const out = {};
  for (const entry of Object.values(skillIndex)) {
    try {
      const versionPath = path.join(entry.skillDir, "version.json");
      if (!fs.existsSync(versionPath)) continue;
      const version = JSON.parse(fs.readFileSync(versionPath, "utf8")).skill_version;
      if (!version) continue;
      if (!out[entry.workspace_id]) out[entry.workspace_id] = {};
      out[entry.workspace_id][entry.slug] = String(version);
    } catch (_) {
      // Corrupt/unreadable version.json for one skill must never break
      // reporting for the rest — same tolerance sync.js itself uses.
    }
  }
  return out;
}

module.exports = { installedSkillVersions };
