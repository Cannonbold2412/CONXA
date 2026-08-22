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
// "@modelcontextprotocol/sdk" is stubbed via RELATIVE requires of the vendored
// CJS copy (host/vendor-sdk.js -> vendor/mcp-sdk-cjs/) because pkg cannot
// resolve the package's bare specifiers through its exports map — see
// _pkg_stubs.js and bootstrap.js's _sdkSpecifier.
const depAliases = { "@modelcontextprotocol/sdk": "mcp-sdk-cjs" };
const missing = declared.filter((dep) => {
  const needle = depAliases[dep] || dep;
  const escaped = needle.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return !new RegExp(`require\\(["'][^"']*${escaped}`).test(stubs);
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

// _pkg_stubs.js only matters if @yao-pkg/pkg actually reads package.json's `pkg`
// config (that's what makes it walk pkg.scripts / pkg.dependencies at all). Without
// `--config package.json` on the CLI, pkg silently builds with an EMPTY config and
// ships an exe missing every dependency above — this bit the build on 2026-08-22.
const buildScripts = ["build:win", "build:mac"];
const missingConfigFlag = buildScripts.filter((name) => {
  const cmd = (pkg.scripts || {})[name] || "";
  return cmd.includes("@yao-pkg/pkg") && !cmd.includes("--config package.json");
});

if (missingConfigFlag.length) {
  console.error(
    `DRIFT: these npm scripts invoke @yao-pkg/pkg WITHOUT --config package.json:\n` +
    missingConfigFlag.map((d) => `  - ${d}`).join("\n") +
    `\nWithout it, pkg never reads package.json's "pkg" block or "dependencies" — ` +
    `every stub in _pkg_stubs.js is silently dropped and the exe ships with no deps at all.`
  );
  process.exit(1);
}

console.log(`check_pkg_stubs: OK — all ${declared.length} dependencies are stubbed.`);
