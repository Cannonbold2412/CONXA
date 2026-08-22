"use strict";
/**
 * Build-time drift check: every runtime dependency declared in package.json
 * must be require()'d by _pkg_stubs.js, because that file is the only thing
 * that makes @yao-pkg/pkg bundle the deps into the host exe. A dep missing
 * from _pkg_stubs.js works fine in dev (`node server.js` resolves from
 * node_modules) and breaks ONLY in the packaged exe — the exact silent-failure
 * class this check exists to kill.
 *
 * Usage: node check_pkg_stubs.js   (exit 1 on drift, 0 otherwise)
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const stubs = fs.readFileSync(path.join(root, "host", "_pkg_stubs.js"), "utf8");

const declared = Object.keys(pkg.dependencies || {});
const missing = declared.filter((dep) => {
  const escaped = dep.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return !new RegExp(`require\\(["']${escaped}(/|["'])`).test(stubs);
});

if (missing.length) {
  console.error(
    `DRIFT: these package.json dependencies are NOT require()'d by _pkg_stubs.js\n` +
    `and therefore will be MISSING from the packaged host exe:\n` +
    missing.map((d) => `  - ${d}`).join("\n") +
    `\nAdd a require("<dep>") line to host/_pkg_stubs.js (see its header comment).`
  );
  process.exit(1);
}

console.log(`check_pkg_stubs: OK — all ${declared.length} dependencies are stubbed.`);
