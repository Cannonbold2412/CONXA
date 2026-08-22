"use strict";
// Never executed at runtime. Listed in pkg.scripts so that @yao-pkg/pkg's
// static analyser bundles these deps into the host exe — they are exposed to
// the app layer (server.js, run.js, etc.) via global.__hostRequire.
require("playwright");
require("keytar");
require("adm-zip");
require("semver");
require("jsonc-parser");
require("yaml");
// The MCP SDK ships ONLY through its package.json "exports" map whose "./*"
// wildcard @yao-pkg/pkg's static analyser cannot follow — and its
// "type": "module" package.json stops pkg from bundling the SDK's own .js
// files even when they are listed explicitly or reached via bare specifiers.
// That is what used to kill the exe with "Cannot find module
// '@modelcontextprotocol/sdk/server/index.js'" on first MCP initialize.
// Two-part fix:
//   1. host/vendor-sdk.js (run by build:win / build:mac) copies the SDK's CJS
//      build to vendor/mcp-sdk-cjs/, and the RELATIVE requires below make pkg
//      bundle it (relative requires are plain filesystem resolution — no
//      exports map, no module-type interference).
//   2. bootstrap.js's __hostRequire rewrites "@modelcontextprotocol/sdk/<sub>"
//      to the vendored real file before requiring (see _sdkSpecifier).
require("../vendor/mcp-sdk-cjs/server/index.js");
require("../vendor/mcp-sdk-cjs/server/stdio.js");
require("../vendor/mcp-sdk-cjs/types.js");
