// Runs under `node --experimental-strip-types` so it can import the renderer's plain-TS parser.
import test from "node:test";
import assert from "node:assert/strict";
import { parseRunResult, formatDuration } from "../../renderer/src/runResult.ts";

test("parses a finished run with downloads and warnings", () => {
  const r = parseRunResult(
    "Done. URL: https://drive.google.com/x\nDownloaded files:\n  C:\\dl\\Fancy.gitignore\n\nWarning:\n  Page looked different\n  Second note\n(run_id: r_abc)",
  );
  assert.equal(r.status, "completed");
  assert.equal(r.runId, "r_abc");
  assert.equal(r.url, "https://drive.google.com/x");
  assert.deepEqual(r.downloads, ["C:\\dl\\Fancy.gitignore"]);
  assert.deepEqual(r.warnings, ["Page looked different", "Second note"]);
  assert.equal(r.detail, "");
});

test("classifies sign-in, busy and failure replies", () => {
  assert.equal(parseRunResult("Authentication required — please sign in to GitHub. (run_id: r_1)").status, "awaiting_auth");
  assert.equal(parseRunResult("Too many workflows are already running").status, "busy");
  const f = parseRunResult("Step 3 failed: element not found\n(run_id: r_2)");
  assert.equal(f.status, "failed");
  assert.equal(f.detail, "Step 3 failed: element not found");
  assert.deepEqual(f.warnings, []);
});

test("formatDuration", () => {
  assert.equal(formatDuration(38_400), "0:38");
  assert.equal(formatDuration(125_000), "2:05");
  assert.equal(formatDuration(null), "");
});
