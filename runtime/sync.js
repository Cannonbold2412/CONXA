"use strict";
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const https  = require("https");

// Prefer the host-bridged instance (bootstrap.js sets this) so every layer shares one
// implementation of the junction-handling logic; fall back to a local copy for direct
// `node server.js` dev runs or test fixtures that never went through bootstrap.js.
const versionManager = (typeof global !== "undefined" && global.__versionManager)
  ? global.__versionManager
  : require("./version_manager");

function _fetchJSON(url, token, timeoutMs) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "conxa-runtime/1.0" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        } else if (res.statusCode === 304) {
          resolve({ files: [] }); // not modified
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.setTimeout(timeoutMs || 3000, () => { req.destroy(); reject(new Error("request timeout")); });
    req.on("error", reject);
  });
}

function _downloadBuffer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs || 8000, () => { req.destroy(); reject(new Error("download timeout")); });
    req.on("error", reject);
  });
}

// Write to .tmp, verify SHA-256, rename atomically
function atomicWrite(targetPath, content, expectedSha256) {
  const tmpPath = targetPath + ".tmp";
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(tmpPath, content);
  const actual = crypto.createHash("sha256").update(content).digest("hex");
  if (actual !== expectedSha256) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw new Error(`Checksum mismatch for ${path.basename(targetPath)}: expected ${expectedSha256}`);
  }
  fs.renameSync(tmpPath, targetPath);
}

// version_manager.activate() already keeps the last few versions on disk, so rollback
// never needs a backup-copy dance the way flat-file sync used to — a failed activation
// just leaves `current` pointing at whatever it pointed at before.

async function _syncCompany(skillPacksDir, company, log) {
  const packPath = path.join(skillPacksDir, company, "pack.json");
  if (!fs.existsSync(packPath)) return;

  let pack;
  try { pack = JSON.parse(fs.readFileSync(packPath, "utf8")); } catch (_) { return; }

  const syncEndpoint = pack.sync_endpoint;
  if (!syncEndpoint) return;

  const token = pack.sync_token || null;
  if (!token) {
    log(`[sync:warn] ${company} no sync_token in pack.json — skipping sync (pack may need to be republished)`);
    return;
  }

  // Recency check: skip if synced within the last 5 minutes
  if (pack.last_synced) {
    const ageMs = Date.now() - new Date(pack.last_synced).getTime();
    if (ageMs < 5 * 60 * 1000) {
      log(`[sync:skip] ${company} synced ${Math.floor(ageMs / 1000)}s ago — skipping`);
      return;
    }
  }

  // Each skill is compared independently against its own last-known version (read
  // from its own version.json, not one shared company-wide counter), so republishing
  // one skill never triggers a redownload of skills that haven't changed.
  const sinceMap = {};
  for (const slug of pack.skills || []) {
    const skillRoot = path.join(skillPacksDir, company, slug);
    const currentDir = versionManager.resolveCurrent(skillRoot);
    let version = "0";
    if (currentDir) {
      try { version = JSON.parse(fs.readFileSync(path.join(currentDir, "version.json"), "utf8")).skill_version || "0"; }
      catch (_) {}
    }
    sinceMap[slug] = version;
  }

  let delta;
  {
    const url = `${syncEndpoint}?since=${encodeURIComponent(JSON.stringify(sinceMap))}`;
    let lastErr;
    for (const waitMs of [0, 300]) {
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
      try {
        delta = await _fetchJSON(url, token, 3000);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      log(`[sync:error] ${company} delta fetch failed — ${lastErr.message}`);
      return;
    }
  }

  const changed = (delta.skills || []).filter((s) => s.action === "update");
  if (changed.length === 0) {
    log(`[sync:status] ${company} up-to-date`);
    return;
  }

  // Download all files for all changed skills in parallel first — nothing touches
  // disk until every buffer is in hand, so a mid-batch network failure never leaves
  // a skill half-written.
  let downloaded;
  try {
    downloaded = await Promise.all(changed.map(async (skillEntry) => {
      const files = await Promise.all((skillEntry.files || []).map(async (fileEntry) => {
        let content;
        if (fileEntry.content_base64) {
          content = Buffer.from(fileEntry.content_base64, "base64");
        } else if (fileEntry.content_url) {
          content = await _downloadBuffer(fileEntry.content_url, 8000);
        } else {
          throw new Error(`no content source for ${skillEntry.name}/${fileEntry.path}`);
        }
        return { fileEntry, content };
      }));
      return { skillEntry, files };
    }));
  } catch (e) {
    log(`[sync:error] ${company} download failed — ${e.message}`);
    return;
  }

  const activated = [];
  for (const { skillEntry, files } of downloaded) {
    const slug = skillEntry.name;
    const rawVersion = String(skillEntry.version || "0");
    const versionDirName = /^v/.test(rawVersion) ? rawVersion : `v${rawVersion}`;
    const skillRoot  = path.join(skillPacksDir, company, slug);
    const versionDir = path.join(skillRoot, versionDirName);
    try {
      // Clear any stale partial staging from a previously interrupted attempt at
      // this exact version before writing fresh files into it.
      try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch (_) {}
      for (const { fileEntry, content } of files) {
        atomicWrite(path.join(versionDir, fileEntry.path), content, fileEntry.sha256);
      }
      if (!fs.existsSync(path.join(versionDir, "version.json"))) {
        fs.writeFileSync(path.join(versionDir, "version.json"), JSON.stringify({
          skill_version: skillEntry.version,
          released_at: new Date().toISOString(),
        }));
      }
      versionManager.activate(skillRoot, versionDir, { keep: 3, requiredFiles: ["manifest.json"] });
      activated.push(`${slug}@${skillEntry.version}`);
    } catch (e) {
      log(`[sync:error] ${company}/${slug}: activation failed — ${e.message}`);
      try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  if (activated.length === 0) return;

  pack.last_synced = new Date().toISOString();
  const packTmp = packPath + ".tmp";
  fs.writeFileSync(packTmp, JSON.stringify(pack, null, 2));
  fs.renameSync(packTmp, packPath);

  log(`[sync:status] ${company} updated (${activated.length} skill${activated.length !== 1 ? "s" : ""}: ${activated.join(", ")})`);
}

async function _doSync(skillPacksDir, log) {
  if (!fs.existsSync(skillPacksDir)) return;
  const companies = fs.readdirSync(skillPacksDir);
  await Promise.allSettled(companies.map(c => _syncCompany(skillPacksDir, c, log)));
}

// Public: run sync with a hard timeout.
// Default 4s — skill packs are small JSON files; parallel downloads complete well within this.
async function syncSkillPacks(skillPacksDir, { timeoutMs = 4000, log = console.error } = {}) {
  await Promise.race([
    _doSync(skillPacksDir, log),
    new Promise((_, reject) => setTimeout(() => reject(new Error("sync timeout")), timeoutMs)),
  ]);
}

module.exports = { syncSkillPacks };
