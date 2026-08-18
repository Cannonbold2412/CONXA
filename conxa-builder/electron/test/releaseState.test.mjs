// Plain node:test for the Release Center's pure state-derivation logic
// (renderer/src/lib/releaseState.ts). Run with:
//   node --experimental-strip-types test/releaseState.test.js
// No new test dependencies — matches the plain node:assert style already used
// by test/bridge.test.js. Node's native TypeScript type-stripping (stable
// since Node 22.x) needs no transpile step, but only understands erasable
// syntax, which is all releaseState.ts uses.

import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageReleases,
  canPublish,
  canRollbackTo,
  changeCounts,
  deriveCandidateReadiness,
  derivePublishUiState,
  diffHeadline,
  isValidSemver,
  releaseBadge,
  stageChecklist,
  suggestNextVersion,
  untestedCount,
  upToDatePercent,
} from "../renderer/src/lib/releaseState.ts";

// 1. Draft / no package built yet.
test("candidate readiness: no package built yet", () => {
  assert.equal(deriveCandidateReadiness(false, []), "no_package");
});

// 2. Tested state: some workflows still failing/never-tested.
test("candidate readiness: needs test when any workflow hasn't passed", () => {
  const workflows = [{ last_test_status: "passed" }, { last_test_status: "never" }];
  assert.equal(deriveCandidateReadiness(true, workflows), "needs_test");
  assert.equal(untestedCount(workflows), 1);
});

// 3. Ready-to-publish state.
test("candidate readiness: ready when every workflow passed", () => {
  const workflows = [{ last_test_status: "passed" }, { last_test_status: "passed" }];
  assert.equal(deriveCandidateReadiness(true, workflows), "ready");
  assert.equal(untestedCount(workflows), 0);
});

test("canPublish requires every gate to hold, including admin role", () => {
  const base = {
    hasPackage: true,
    allTestsPassed: true,
    versionValid: true,
    versionAvailable: true,
    notesValid: true,
    publishing: false,
    canManage: true,
  };
  assert.equal(canPublish(base), true);
  assert.equal(canPublish({ ...base, canManage: false }), false);
  assert.equal(canPublish({ ...base, versionAvailable: false }), false);
  assert.equal(canPublish({ ...base, publishing: true }), false);
});

test("semver + next-version suggestion", () => {
  assert.equal(isValidSemver("1.2.3"), true);
  assert.equal(isValidSemver("1.2.3-beta.1"), true);
  assert.equal(isValidSemver("v1.2.3"), false);
  assert.equal(suggestNextVersion(undefined), "1.0.0");
  assert.equal(suggestNextVersion("1.2.3"), "1.2.4");
});

// 4-6. Publishing progress / success / failure.
test("publish UI state derivation covers idle/publishing/success/failure", () => {
  assert.equal(derivePublishUiState({ publishing: true, publishError: "", publishDone: false }), "publishing");
  assert.equal(derivePublishUiState({ publishing: false, publishError: "boom", publishDone: false }), "failure");
  assert.equal(derivePublishUiState({ publishing: false, publishError: "", publishDone: true }), "success");
  assert.equal(derivePublishUiState({ publishing: false, publishError: "", publishDone: false }), "idle");
});

test("stage checklist never claims a step happened before it was observed", () => {
  assert.deepEqual(
    stageChecklist(null).map((s) => s.state),
    ["pending", "pending", "pending"],
  );
  assert.deepEqual(
    stageChecklist("validated").map((s) => s.state),
    ["done", "active", "pending"],
  );
  assert.deepEqual(
    stageChecklist("uploading").map((s) => s.state),
    ["done", "done", "active"],
  );
  assert.deepEqual(
    stageChecklist("published").map((s) => s.state),
    ["done", "done", "done"],
  );
  // A failure mid-flight never shows a later step as done.
  assert.deepEqual(
    stageChecklist("failed").map((s) => s.state),
    ["pending", "pending", "pending"],
  );
});

// 7. Version history badges.
test("release badges: stable / superseded / failed(pending)", () => {
  assert.equal(releaseBadge({ version: "1.1.0", status: "published" }, "1.1.0"), "stable");
  assert.equal(releaseBadge({ version: "1.0.0", status: "published" }, "1.1.0"), "superseded");
  assert.equal(releaseBadge({ version: "1.2.0", status: "pending" }, "1.1.0"), "failed");
});

// 8. Diff view.
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

// 9. Deployment view.
test("deployment up-to-date percent handles zero machines without NaN", () => {
  assert.equal(upToDatePercent({ total: 0, up_to_date: 0, pending: 0, offline: 0, unknown: 0 }), 0);
  assert.equal(upToDatePercent({ total: 4, up_to_date: 3, pending: 1, offline: 0, unknown: 0 }), 75);
});

// 10. Rollback confirmation — only valid targets are rollback-able.
test("rollback is only offered for a published, non-current release", () => {
  assert.equal(canRollbackTo({ version: "1.0.0", status: "published" }, "1.1.0"), true);
  assert.equal(canRollbackTo({ version: "1.1.0", status: "published" }, "1.1.0"), false); // already stable
  assert.equal(canRollbackTo({ version: "1.2.0", status: "pending" }, "1.1.0"), false); // never activated
});

// 12. Permission restrictions.
test("only admin/owner roles can manage releases", () => {
  assert.equal(canManageReleases("owner"), true);
  assert.equal(canManageReleases("admin"), true);
  assert.equal(canManageReleases("basic_member"), false);
  assert.equal(canManageReleases(null), false);
});
