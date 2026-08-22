"use strict";
/**
 * Mechanical guard for the "Tier 1/2 recovery costs zero LLM tokens" invariant
 * (AGENTS.md Key Invariants): nothing reachable from recovery.js may perform
 * network I/O. Today that's protected by convention only — this makes it
 * machine-checked.
 *
 * Walks the transitive require-closure of recovery.js (relative requires) and
 * fails if any module in it:
 *   - requires node core network modules (http, https, net, dns, tls, undici)
 *   - requires an npm package whose name suggests a network client
 *   - references `fetch(` / `XMLHttpRequest` / `WebSocket`
 *
 * Usage: node check_recovery_purity.js   (exit 1 on violation)
 */
const fs   = require("fs");
const path = require("path");

const root = __dirname;
const ENTRY = "recovery.js";const BANNED_CORE = ["http", "https", "net", "dns", "tls", "undici", "http2"];
const BANNED_PATTERNS = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
];

function closureOf(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(root, f), "utf8");
    const reqs = [...src.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    for (const r of reqs) {
      if (r.startsWith(".") || r.startsWith("/")) {
        let n = r;
        if (!n.endsWith(".js")) n += ".js";
        const resolved = path.join(path.dirname(path.join(root, f)), n);
        const rel = path.relative(root, resolved).replace(/\\/g, "/");
        if (!seen.has(rel)) queue.push(rel);
      }
    }
  }
  return seen;
}

const files = closureOf(ENTRY);
const violations = [];

for (const rel of files) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const m of src.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const id = m[1];
    if (BANNED_CORE.includes(id)) violations.push(`${rel}: requires banned core module '${id}'`);
    else if (!id.startsWith(".") && !id.startsWith("/") && !id.startsWith("node:")
          && /(http|fetch|axios|request|got|undici|ws)/i.test(id)) {
      violations.push(`${rel}: requires suspicious network package '${id}'`);
    }
  }
  const body = src.replace(/require\(["'][^"']+["']\)/g, "");
  for (const p of BANNED_PATTERNS) {
    if (p.test(body)) violations.push(`${rel}: matches banned network pattern ${p}`);
  }
}

if (violations.length) {
  console.error(
    `RECOVERY PURITY VIOLATION — Tier 1/2 must stay zero-network (zero LLM tokens):\n` +
    violations.map((v) => `  - ${v}`).join("\n")
  );
  process.exit(1);
}

console.log(`check_recovery_purity: OK — ${files.size} module(s) reachable from ${ENTRY}, no network access.`);
