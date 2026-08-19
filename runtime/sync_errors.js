"use strict";
const fs = require("fs");
const path = require("path");

// {company: {skill_slug: {code, at}}} — read straight off each company's
// pack.json `last_sync_errors` field, which sync.js writes on every sync
// pass (cleared for a skill the moment it activates successfully). Used by
// server.js's phone-home telemetry so the cloud Deployment dashboard can show
// a real "failed" status instead of just "pending". Pure function of
// filesystem state, mirrors installed_versions.js's style/testability.
function collectSyncErrors(skillPacksDir) {
  const out = {};
  if (!fs.existsSync(skillPacksDir)) return out;
  for (const company of fs.readdirSync(skillPacksDir)) {
    const packPath = path.join(skillPacksDir, company, "pack.json");
    if (!fs.existsSync(packPath)) continue;
    try {
      const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
      if (pack.last_sync_errors && Object.keys(pack.last_sync_errors).length > 0) {
        out[company] = pack.last_sync_errors;
      }
    } catch (_) {
      // Corrupt/unreadable pack.json for one company must never break
      // reporting for the rest — same tolerance sync.js itself uses.
    }
  }
  return out;
}

module.exports = { collectSyncErrors };
