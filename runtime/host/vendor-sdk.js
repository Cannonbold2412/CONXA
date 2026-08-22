"use strict";
/**
 * vendor-sdk.js — copy the MCP SDK's CommonJS build into vendor/mcp-sdk-cjs/
 * so @yao-pkg/pkg can bundle it.
 *
 * Why: the SDK ships only through its package.json "exports" map and declares
 * "type": "module". pkg's static analyser can neither resolve bare subpaths
 * through the "./*" wildcard export nor bundle .js files from a "module"-typed
 * package, so every previous host build silently shipped WITHOUT the SDK and
 * died on first MCP initialize ("Cannot find module
 * '@modelcontextprotocol/sdk/server/index.js'"). The vendored copy lives in a
 * package-less directory, so pkg treats it as plain CommonJS and bundles it;
 * bootstrap.js's __hostRequire rewrites "@modelcontextprotocol/sdk/<sub>"
 * specifiers to vendor/mcp-sdk-cjs/<sub> at runtime (dev mode keeps using the
 * real package via Node's exports resolution — this file only runs on build).
 *
 * Idempotent; called automatically by the build:win / build:mac npm scripts.
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const src = path.join(root, "..", "node_modules", "@modelcontextprotocol", "sdk", "dist", "cjs");
const dst = path.join(root, "..", "vendor", "mcp-sdk-cjs");

if (!fs.existsSync(path.join(src, "server", "index.js"))) {
  console.error(`vendor-sdk: MCP SDK CJS build not found at ${src} — run npm install first.`);
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.cpSync(src, dst, { recursive: true });

// Drop the d.ts/ts.map noise; only the .js entry points and their sources matter.
for (const f of fs.readdirSync(dst)) {
  if (f.endsWith(".d.ts") || f.endsWith(".d.ts.map")) fs.rmSync(path.join(dst, f));
}
console.log(`vendor-sdk: copied MCP SDK CJS build -> ${dst}`);
