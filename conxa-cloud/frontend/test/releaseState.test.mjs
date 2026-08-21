// Plain node:test for Cloud's Release Center state-derivation logic
// (src/lib/releaseState.ts). Run with:
//   node --experimental-strip-types --test test/releaseState.test.mjs
// Mirrors conxa-builder/electron/test/releaseState.test.mjs's style — no new
// test dependencies, Node's native TypeScript type-stripping needs no
// transpile step since releaseState.ts only uses erasable syntax.

import assert from "node:assert/strict";
import test from "node:test";
import {
  canReleaseTo,
  canRollbackTo,
  changeCounts,
  deploymentStatusLabel,
  diffHeadline,
  releaseBadge,
  upToDatePercent,
} from "../src/lib/releaseState.ts";

test("release badges: stable / ready / superseded / failed(pending)", () => {
  assert.equal(releaseBadge({ version: "1.1.0", status: "published" }, "1.1.0"), "stable");
  assert.equal(releaseBadge({ version: "1.0.0", status: "published" }, "1.1.0"), "superseded");
  assert.equal(releaseBadge({ version: "1.2.0", status: "ready" }, "1.1.0"), "ready");
  assert.equal(releaseBadge({ version: "1.2.0", status: "pending" }, "1.1.0"), "failed");
});

test("release is only offered for a version awaiting release (ready)", () => {
  assert.equal(canReleaseTo({ version: "1.2.0", status: "ready" }), true);
  assert.equal(canReleaseTo({ version: "1.1.0", status: "published" }), false);
  assert.equal(canReleaseTo({ version: "1.0.0", status: "pending" }), false);
});

test("rollback is only offered for a published, non-current release", () => {
  assert.equal(canRollbackTo({ version: "1.0.0", status: "published" }, "1.1.0"), true);
  assert.equal(canRollbackTo({ version: "1.1.0", status: "published" }, "1.1.0"), false); // already stable
  assert.equal(canRollbackTo({ version: "1.2.0", status: "ready" }, "1.1.0"), false); // not deployed yet
  assert.equal(canRollbackTo({ version: "1.2.0", status: "pending" }, "1.1.0"), false); // never activated
});

test("diff headline and change counts", () => {
  const diff = {
    steps_added: 2,
    steps_removed: 1,
    steps_modified: 3,
    skills_added: [],
    skills_removed: [],
    recovery_changed_skills: ["deploy"],
  };
  assert.deepEqual(changeCounts(diff), { added: 2, modified: 3, removed: 1, total: 6 });
  assert.equal(diffHeadline(diff, "1.3.0"), "6 changes from v1.3.0");
  const noChange = { steps_added: 0, steps_removed: 0, steps_modified: 0, skills_added: [], skills_removed: [], recovery_changed_skills: [] };
  assert.equal(diffHeadline(noChange, "1.3.0"), "No changes from v1.3.0");
});

test("deployment status includes a real failed state, and percent handles zero machines without NaN", () => {
  assert.equal(deploymentStatusLabel("failed"), "Failed");
  const summary = { total: 0, up_to_date: 0, pending: 0, failed: 0, offline: 0, unknown: 0 };
  assert.equal(upToDatePercent(summary), 0);
  assert.equal(upToDatePercent({ ...summary, total: 4, up_to_date: 3, failed: 1 }), 75);
});
