"use strict";
/**
 * CI guard for the host/app boundary: verifies runtime/host-manifest.json exactly
 * matches the transitive require-closure of host/bootstrap.js (relative requires
 * across the host/ and app/ folders — npm deps are bundled separately via
 * host/_pkg_stubs.js).
 *
 * Human rule of thumb:
 *   edit in runtime/host/  → ships with the next host-vX.Y.Z release
 *   edit in runtime/app/   → ships with the next app-vX.Y.Z release
 *   …except files listed under dual_shipped (app/ modules the exe also bundles),
 *     whose edits are host changes too.
 *
 * Usage: node check_host_manifest.js   (exit 1 on drift)
 */
const fs   = require("fs");
const path = require("path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "host-manifest.json"), "utf8"));

function resolveRequire(fromFile, spec) {
  // "./x" → sibling of fromFile; "../app/x" / "../host/x" → across the folder line.
  const base = path.dirname(path.join(root, fromFile));
  let p = path.join(base, spec);
  if (!p.endsWith(".js")) p += ".js";
  return path.relative(root, p).replace(/\\/g, "/");
}

function closureOf(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of src.matchAll(/require\("(\.\.?\/[^"]+)"/g)) {
      const rel = resolveRequire(f, m[1]);
      if (!fs.existsSync(path.join(root, rel))) continue; // package.json etc.
      if (!rel.startsWith("host/") && !rel.startsWith("app/")) continue; // root files aren't bundled modules
      if (!seen.has(rel)) queue.push(rel);
    }
  }
  return seen;
}

const actual = closureOf(manifest.entry);
const declared = new Set(manifest.modules);

const missing = [...actual].filter((f) => !declared.has(f)).sort();
const stale = [...declared].filter((f) => !actual.has(f) && f !== "host/_pkg_stubs.js").sort();

if (missing.length || stale.length) {
  let msg = "HOST MANIFEST DRIFT detected:\n";
  if (missing.length) {
    msg +=
      `  Frozen into the exe by ${manifest.entry}'s require graph but NOT listed\n` +
      `  in host-manifest.json (edits to these ship only with the next host release):\n` +
      missing.map((f) => `    - ${f}`).join("\n") + "\n";
  }
  if (stale.length) {
    msg +=
      `  Listed in host-manifest.json but no longer reachable from ${manifest.entry}:\n` +
      stale.map((f) => `    - ${f}`).join("\n") + "\n";
  }
  msg += `Update runtime/host-manifest.json to match.`;
  console.error(msg);
  process.exit(1);
}

console.log(`check_host_manifest: OK — ${actual.size} modules match the manifest.`);
