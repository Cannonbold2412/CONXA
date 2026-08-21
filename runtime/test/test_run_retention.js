"use strict";

// W-7: nothing used to delete a finished run's workspace under {CONXA_DATA_DIR}/runs/{runId}/,
// so files accumulated forever. sweepOldRuns() is called at the start of every execution and
// removes sibling run dirs older than the retention window, without ever touching the run
// that's currently starting up.

const test = require("node:test");
const assert = require("node:assert");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { sweepOldRuns } = require("../run");

function makeRunsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "conxa-runs-"));
}

function makeRun(runsDir, name, ageMs) {
  const dir = path.join(runsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "file.txt"), "x");
  const mtime = new Date(Date.now() - ageMs);
  fs.utimesSync(dir, mtime, mtime);
  return dir;
}

test("sweepOldRuns removes directories older than the retention window", () => {
  const runsDir = makeRunsDir();
  try {
    const stale = makeRun(runsDir, "r_old", 10 * 86400000);
    const fresh = makeRun(runsDir, "r_new", 1 * 86400000);
    sweepOldRuns(runsDir, 7 * 86400000, null);
    assert.strictEqual(fs.existsSync(stale), false);
    assert.strictEqual(fs.existsSync(fresh), true);
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }
});

test("sweepOldRuns never removes the excluded (currently starting) run, even if stale", () => {
  const runsDir = makeRunsDir();
  try {
    const current = makeRun(runsDir, "r_current", 10 * 86400000);
    sweepOldRuns(runsDir, 7 * 86400000, "r_current");
    assert.strictEqual(fs.existsSync(current), true);
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }
});

test("sweepOldRuns is a no-op when the runs base directory doesn't exist yet", () => {
  const missing = path.join(os.tmpdir(), "conxa-runs-does-not-exist-" + Date.now());
  assert.doesNotThrow(() => sweepOldRuns(missing, 7 * 86400000, null));
});
