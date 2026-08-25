"use strict";

// EXEC-13: the ai_review step type — a planned pause (author-placed reasoning checkpoint), not
// a page action and not a Tier 1-4 recovery candidate. Two things are under test here:
//   • review_pause.js — the pure/mockable answer-validation + MCP request-building helpers,
//     following the same scope as test_failure_response.js's coverage of buildFailureResponse.
//   • run.js's runPlan interception — a fresh arrival throws a distinct `reviewPause` signal
//     instead of reaching executeStep/recoverStep; a resume that already bound an answer under
//     `__ai_review_answer_<i>` consumes it and continues, following the same runPlan-fixture
//     pattern as test_download_naming.js.

const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");

const {
  REVIEW_RETRY_MAX,
  checkReviewRetry,
  clearReviewRetry,
  validateReviewAnswer,
  buildReviewRequest,
} = require("../../app/review_pause");
const { runPlan } = require("../../app/run");

// ── validateReviewAnswer ─────────────────────────────────────────────────────

test("validateReviewAnswer: no schema always passes", () => {
  assert.deepStrictEqual(validateReviewAnswer({ anything: "goes" }, null), { valid: true, errors: [] });
  assert.deepStrictEqual(validateReviewAnswer("not even an object", undefined), { valid: true, errors: [] });
});

test("validateReviewAnswer: non-object answer fails when a schema is present", () => {
  const result = validateReviewAnswer("yes", { type: "object", properties: {} });
  assert.strictEqual(result.valid, false);
  assert.match(result.errors[0], /must be a JSON object/);
});

test("validateReviewAnswer: missing required field fails", () => {
  const schema = { type: "object", required: ["visible"], properties: { visible: { type: "boolean" } } };
  const result = validateReviewAnswer({ why: "no banner" }, schema);
  assert.strictEqual(result.valid, false);
  assert.match(result.errors[0], /missing required field "visible"/);
});

test("validateReviewAnswer: wrong type on a declared property fails", () => {
  const schema = { properties: { visible: { type: "boolean" } } };
  const result = validateReviewAnswer({ visible: "yes" }, schema);
  assert.strictEqual(result.valid, false);
  assert.match(result.errors[0], /must be of type boolean/);
});

test("validateReviewAnswer: enum mismatch fails", () => {
  const schema = { properties: { status: { type: "string", enum: ["ok", "error"] } } };
  const result = validateReviewAnswer({ status: "maybe" }, schema);
  assert.strictEqual(result.valid, false);
  assert.match(result.errors[0], /must be one of/);
});

test("validateReviewAnswer: matching answer against the canonical yes/no shape passes", () => {
  const schema = {
    type: "object",
    required: ["visible"],
    properties: { visible: { type: "boolean" }, why: { type: "string" } },
  };
  const result = validateReviewAnswer({ visible: true, why: "banner is showing" }, schema);
  assert.deepStrictEqual(result, { valid: true, errors: [] });
});

// ── checkReviewRetry / clearReviewRetry ──────────────────────────────────────

test("checkReviewRetry: allows up to REVIEW_RETRY_MAX attempts, then refuses", () => {
  const slug = "retry-test";
  for (let i = 0; i < REVIEW_RETRY_MAX; i++) {
    assert.strictEqual(checkReviewRetry(slug, 3), true);
  }
  assert.strictEqual(checkReviewRetry(slug, 3), false, "budget should be exhausted past REVIEW_RETRY_MAX");
});

test("checkReviewRetry: clearReviewRetry resets the counter for that step only", () => {
  const slug = "retry-clear-test";
  checkReviewRetry(slug, 0);
  checkReviewRetry(slug, 1);
  clearReviewRetry(slug, 0);
  assert.strictEqual(checkReviewRetry(slug, 0), true, "cleared step should look like a fresh start");
  // Step 1's count is untouched by clearing step 0.
  for (let i = 1; i < REVIEW_RETRY_MAX; i++) checkReviewRetry(slug, 1);
  assert.strictEqual(checkReviewRetry(slug, 1), false);
});

// ── buildReviewRequest ───────────────────────────────────────────────────────

let tmpDirs = [];
function tmpSkillDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-review-"));
  tmpDirs.push(dir);
  return dir;
}
test.after?.(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function mockPage() {
  return {
    url: () => "https://x.example/checkout",
    screenshot: async () => Buffer.from("shot"),
  };
}

test("buildReviewRequest: includes the prompt and resume instructions, no schema/reference", async () => {
  const step = { type: "ai_review", prompt: "Is the confirmation banner visible?" };
  const resp = await buildReviewRequest(mockPage(), step, 4, { slug: "s1", skillDir: tmpSkillDir() });
  const header = resp.content[0].text;
  assert.match(header, /paused at step 5/);
  assert.match(header, /Is the confirmation banner visible\?/);
  assert.match(header, /resume_from: 4/);
  assert.match(header, /review_results: \{ "4":/);
  // Current screenshot always included; no reference image without a reference_screenshot_ref.
  assert.strictEqual(resp.content.filter(c => c.type === "image").length, 1);
});

test("buildReviewRequest: includes the output schema and a matching reference image", async () => {
  const skillDir = tmpSkillDir();
  fs.mkdirSync(path.join(skillDir, "visuals"));
  fs.writeFileSync(path.join(skillDir, "visuals", "Image_5.jpg"), Buffer.from("ref"));
  const step = {
    type: "ai_review",
    prompt: "Is the banner visible?",
    output_schema: { type: "object", required: ["visible"] },
    reference_screenshot_ref: "visuals/Image_5.jpg",
  };
  const resp = await buildReviewRequest(mockPage(), step, 4, { slug: "s1", skillDir });
  assert.match(resp.content[0].text, /must be a JSON object matching this schema/);
  const images = resp.content.filter(c => c.type === "image");
  assert.strictEqual(images.length, 2, "reference image + current screenshot");
});

test("buildReviewRequest: appends validation-error and drift notes on a re-ask", async () => {
  const step = { type: "ai_review", prompt: "Is the banner visible?" };
  const resp = await buildReviewRequest(mockPage(), step, 0, { slug: "s1", skillDir: tmpSkillDir() }, {
    validationErrors: ['missing required field "visible"'],
    pageDrifted: true,
  });
  const header = resp.content[0].text;
  assert.match(header, /did not match the required output/);
  assert.match(header, /missing required field "visible"/);
  assert.match(header, /the page changed while this was pending/);
});

// ── run.js's runPlan interception ────────────────────────────────────────────
// Minimal page/tab fixture, same shape test_download_naming.js uses: an ai_review step has no
// `tab` block, so resolveStepPage takes the tab_0 shortcut and never touches Playwright.
const idleContext = { on: () => {} };
const idlePage = { waitForLoadState: async () => {}, context: () => idleContext };

test("runPlan: a fresh ai_review step throws a reviewPause signal, not a normal failure", async () => {
  const steps = [{ type: "ai_review", prompt: "Is X visible?", output_name: "x_visible" }];
  await assert.rejects(
    () => runPlan(idlePage, steps, {}, 0, "review-fresh"),
    (err) => {
      assert.strictEqual(err.reviewPause, true);
      assert.strictEqual(err.stepIndex, 0);
      assert.strictEqual(err.step, steps[0]);
      assert.strictEqual(err.page, idlePage);
      return true;
    }
  );
});

test("runPlan: a resume with a bound answer consumes it and continues past the step", async () => {
  const steps = [
    { type: "ai_review", prompt: "Is X visible?", output_name: "x_visible" },
    { type: "ai_review", prompt: "Never reached", output_name: "unreached" },
  ];
  const inputs = { __ai_review_answer_0: { visible: true, why: "it's there" } };
  // Step 1 has no bound answer, so it re-throws its own pause — proves step 0 was actually
  // consumed and execution moved on, rather than looping on step 0 forever.
  await assert.rejects(
    () => runPlan(idlePage, steps, inputs, 0, "review-resume"),
    (err) => err.reviewPause === true && err.stepIndex === 1
  );
  assert.deepStrictEqual(inputs.x_visible, { visible: true, why: "it's there" });
  assert.strictEqual(inputs.__ai_review_answer_0, undefined, "consumed answer key is removed");
});

test("runPlan: default output_name is used when the step carries none", async () => {
  const steps = [{ type: "ai_review", prompt: "Is X visible?" }];
  const inputs = { __ai_review_answer_0: "yes" };
  // Only step, answer already bound — the loop consumes it and finishes normally (no throw).
  await runPlan(idlePage, steps, inputs, 0, "review-default-name");
  assert.strictEqual(inputs.ai_review_output_0, "yes");
  assert.strictEqual(inputs.__ai_review_answer_0, undefined);
});
