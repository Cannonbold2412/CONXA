"use strict";
/**
 * Mechanical guard for EXEC-34/EXEC-29's "every page/locator .evaluate()/.count() call routes
 * through page_eval.js's deadline seam" rule (see CLAUDE.md/TODO.md EXEC-34, page_eval.js's own
 * header comment for why: Playwright gives evaluate()/count() no timeout of their own, so a
 * blocked renderer — a native dialog, a beforeunload prompt, a throttled background tab — can
 * hang the call past the run's own EXECUTION_DEADLINE_MS watchdog, which is poll-based and
 * cannot interrupt a call it isn't awaiting between operations).
 *
 * Scans every runtime/app/*.js file except page_eval.js itself (the seam) and page_scripts.js
 * (functions that run IN the page realm via evalOn/locator serialization — they call browser
 * DOM APIs, not Playwright's own .evaluate()/.count()) for a bare `.evaluate(`/`.count(` call.
 * A narrow allow-list covers identifier collisions that are not Playwright calls at all
 * (runRegistry.count(), policyGate.evaluate()).
 *
 * Usage: node check_page_eval_seam.js   (exit 1 on violation)
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const EXCLUDE_FILES = new Set(["page_eval.js", "page_scripts.js", "check_page_eval_seam.js"]);

// Identifier prefixes known NOT to be a Playwright Page/Locator/FrameLocator — checked against
// the text immediately before the matched `.evaluate(`/`.count(` call.
const ALLOWED_PREFIXES = [/\brunRegistry\.count\($/, /\bpolicyGate\.evaluate\($/];

function stripComments(src) {
  // Naive but sufficient for this codebase's style: strip //... line comments and /* ... */
  // block comments. Does not attempt to be string-literal-aware (no `//` or `/*` appears inside
  // a string literal anywhere near an .evaluate(/.count( call site in this codebase today).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

function findViolations(file, src) {
  const clean = stripComments(src);
  const violations = [];
  const re = /[.\]]\s*(evaluate|count)\s*\(/g;
  let m;
  while ((m = re.exec(clean))) {
    const before = clean.slice(Math.max(0, m.index - 60), m.index + m[0].length);
    if (ALLOWED_PREFIXES.some((p) => p.test(before))) continue;
    const line = clean.slice(0, m.index).split("\n").length;
    violations.push(`${file}:${line}: bare .${m[1]}( call — route through page_eval.js's evalOn/countOn`);
  }
  return violations;
}

const files = fs.readdirSync(root).filter((f) => f.endsWith(".js") && !EXCLUDE_FILES.has(f));
let violations = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  violations = violations.concat(findViolations(f, src));
}

if (violations.length) {
  console.error(
    `PAGE_EVAL SEAM VIOLATION — every .evaluate()/.count() in runtime/app/ must route through ` +
    `page_eval.js's evalOn/countOn (EXEC-34):\n` + violations.map((v) => `  - ${v}`).join("\n")
  );
  process.exit(1);
}

console.log(`check_page_eval_seam: OK — ${files.length} module(s) scanned, no bare .evaluate()/.count() calls.`);
