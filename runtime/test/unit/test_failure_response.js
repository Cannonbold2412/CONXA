"use strict";
// Unit tests for failure_response.js — the Tier 3/4 recovery-payload assembly
// extracted from server.js. Mock page objects only; no browser, no network.
const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");

const {
  buildFailureResponse,
  stepRecoveryContext,
  executedStepsBreadcrumb,
} = require("../../app/failure_response");

const NO_DEPS = {
  agentRecoveryEnabled: false,
  maxRecoveryTier: 2,
  appendRecoveryEvent: () => {},
  stepAssertions: () => [],
};

test("stepRecoveryContext: anchors outrank stale fingerprint text", () => {
  const ctx = stepRecoveryContext({
    failedStep: {
      type: "click",
      _intent: "Submit the login form",
      anchors: [{ text: "  Sign in ", priority: 1 }, { text: "Login button", priority: 5 }],
      identity_bundle: { fingerprint: { role: "button", inner_text: "OLD TEXT", data_testid: "submit" } },
    },
  });
  assert.strictEqual(ctx.action, "click");
  assert.strictEqual(ctx.intent, "Submit the login form");
  assert.strictEqual(ctx.target.text, "Login button", "highest-priority anchor wins over inner_text");
  assert.deepStrictEqual(ctx.anchors, ["Login button", "Sign in"]);
});

test("stepRecoveryContext: strips empty target fields and reports frame depth", () => {
  const ctx = stepRecoveryContext({
    failedStep: {
      identity_bundle: { fingerprint: {}, frame_chain: [{}, {}] },
    },
  });
  assert.strictEqual(ctx.target, undefined, "no positive identity signals → no target block");
  assert.deepStrictEqual(ctx.frame, { depth: 2 });
});

test("executedStepsBreadcrumb: null for step 0 / non-array steps", () => {
  assert.strictEqual(executedStepsBreadcrumb(null, 2), null);
  assert.strictEqual(executedStepsBreadcrumb([{ type: "navigate" }], 0), null);
});

test("ceiling 2 (Build Studio): deterministic text-only failure, no screenshots", async () => {
  let screenshotCalls = 0;
  const page = { url: () => "https://x.example/", screenshot: async () => { screenshotCalls++; return Buffer.from("x"); } };
  const events = [];
  const resp = await buildFailureResponse(
    page,
    { message: "element not found", failedAt: 3 },
    { slug: "demo-skill" },
    null,
    null,
    { ...NO_DEPS, agentRecoveryEnabled: false, maxRecoveryTier: 2, appendRecoveryEvent: (e) => events.push(e) }
  );
  assert.strictEqual(screenshotCalls, 0, "T1/T2 ceiling must never capture a screenshot");
  assert.strictEqual(resp.content.length, 1);
  assert.match(resp.content[0].text, /Execution failed at step 4/);
  assert.match(resp.content[0].text, /Recovery ceiling Tier 2/);
  assert.ok(!/step_overrides/.test(resp.content[0].text), "no agent handoff protocol at ceiling 2");
  assert.ok(events.some(e => e.event === "recovery_ceiling_reached"));
});

test("agent path: includes resume protocol and ground-truth sections", async () => {
  const page = {
    url: () => "https://x.example/",
    viewportSize: () => ({ width: 1280, height: 800 }),
    evaluate: async () => ({ interactiveCount: 0, text: "" }),
    screenshot: async () => Buffer.from("shot"),
  };
  const resp = await buildFailureResponse(
    page,
    { message: "strict mode violation", failedAt: 1 },
    { slug: "demo-skill", skillDir: fs.mkdtempSync(path.join(os.tmpdir(), "fail-resp-")) },
    { emit() {} },
    null,
    {
      ...NO_DEPS,
      agentRecoveryEnabled: true,
      maxRecoveryTier: 4,
    }
  );
  const texts = resp.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  assert.match(texts, /resume_from: 1/);
  assert.match(texts, /step_overrides/);
  assert.match(texts, /── Tier 3 \(semantic\) ──/);
  assert.match(texts, /── Tier 4 \(vision\) ──/);
});
