/**
 * check_app_layer_files.js — CI guard for the conxa-app (disk-resident app layer)
 * file manifest. Mirrors the role check_host_manifest.js plays for the host exe:
 * it makes "this edit silently changes what ships" visible at review time.
 *
 * Consumes app-layer-files.json — the single source of truth shared by
 * .github/workflows/build-runtime-app.yml and scripts/build-app-local.ps1 — and
 * verifies it two ways:
 *
 *   1. COVERAGE: every .js file in runtime/app/ is listed (except the repo-side
 *      CI guard tools in EXCLUDE). A new module dropped into app/ that isn't
 *      listed here would otherwise ship as "works in dev, MODULE_NOT_FOUND in
 *      production" — exactly how the sync_errors.js and run.js-seam gaps happened.
 *
 *   2. CLOSURE: every relative require("./x") found in a listed file resolves to
 *      another listed file. A shipped module requiring an unlisted one is a
 *      guaranteed load-time crash on the customer machine.
 *
 * Exits non-zero with a diff-style report if either check fails.
 */

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const APP_DIR = path.join(RUNTIME_ROOT, "app");
const MANIFEST_PATH = path.join(RUNTIME_ROOT, "app-layer-files.json");

// Repo-side tooling that lives in app/ but must never ship in the zip.
const EXCLUDE = new Set(["check_recovery_purity.js"]);

const VALID_PROFILES = new Set(["default", "no-self-defending", "in-page"]);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const listed = new Set(manifest.files.map((f) => f.name));

const errors = [];

// ── schema sanity ─────────────────────────────────────────────────────────────
const seen = new Set();
for (const entry of manifest.files) {
  if (!VALID_PROFILES.has(entry.profile)) {
    errors.push(`manifest: ${entry.name} has unknown profile "${entry.profile}"`);
  }
  if (seen.has(entry.name)) {
    errors.push(`manifest: ${entry.name} is listed twice`);
  }
  seen.add(entry.name);
  const p = path.join(APP_DIR, entry.name);
  if (!fs.existsSync(p)) {
    errors.push(`manifest: ${entry.name} does not exist under runtime/app/`);
  }
}

// ── 1. coverage: every app/*.js must be listed ────────────────────────────────
const onDisk = fs
  .readdirSync(APP_DIR)
  .filter((f) => f.endsWith(".js") && !EXCLUDE.has(f));
for (const f of onDisk) {
  if (!listed.has(f)) {
    errors.push(
      `coverage: runtime/app/${f} exists on disk but is NOT in app-layer-files.json — ` +
        `it will be missing from the shipped conxa-app zip`
    );
  }
}

// ── 2. closure: every ./require in a listed file must be listed too ──────────
const REQ_RE = /require\(\s*["']\.\/([^"']+)["']\s*\)/g;
for (const name of listed) {
  const src = fs.readFileSync(path.join(APP_DIR, name), "utf8");
  let m;
  while ((m = REQ_RE.exec(src)) !== null) {
    const target = m[1].endsWith(".js") ? m[1] : `${m[1]}.js`;
    if (!listed.has(target)) {
      errors.push(
        `closure: ${name} requires "./${m[1]}" but ${target} is NOT in app-layer-files.json`
      );
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `app-layer-files.json check FAILED (${errors.length} problem(s)):\n\n` +
      errors.map((e) => `  - ${e}`).join("\n") +
      "\n\nFix the manifest or the source layout — do not skip this guard.\n"
  );
  process.exit(1);
}

process.stdout.write(
  `app-layer-files.json OK: ${listed.size} modules, coverage + require-closure verified\n`
);
