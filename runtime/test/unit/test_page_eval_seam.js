"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const GUARD = path.join(__dirname, "..", "..", "app", "check_page_eval_seam.js");

test("check_page_eval_seam passes against the current runtime/app/ tree", () => {
  const out = execFileSync(process.execPath, [GUARD], { encoding: "utf8" });
  assert.match(out, /check_page_eval_seam: OK/);
});

test("countOn/evalOn are exported from page_eval.js and honor a deadline", async () => {
  const { countOn, evalOn, EVAL_TIMED_OUT } = require("../../app/page_eval");
  const hungLocator = { count: () => new Promise(() => {}) };
  const started = Date.now();
  const r = await countOn(hungLocator, 40);
  assert.strictEqual(r, EVAL_TIMED_OUT);
  assert.ok(Date.now() - started < 500, "countOn must not hang past its deadline");

  const hungTarget = { evaluate: () => new Promise(() => {}) };
  const r2 = await evalOn(hungTarget, () => 1, undefined, 40);
  assert.strictEqual(r2, EVAL_TIMED_OUT);
});
