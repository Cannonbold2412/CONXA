"use strict";
// Unit tests for failure_response.js — the Tier 3/4 recovery-payload assembly
// extracted from server.js. Mock page objects only; no browser, no network.
//
// Tier model (2026-08 redesign): Tier 3 (semantic, browser-use-style indexed
// digest) and Tier 4 (vision, CUA-style screenshots) fire as SEPARATE MCP
// round-trips — first agent round for a step is always Tier 3; later rounds
// escalate to Tier 4. Module-level escalation state (recovery_stage.js) is
// keyed by `${workspace}:${slug}` — every test uses its own slug to isolate.
const test   = require("node:test");
const assert = require("node:assert");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");

const {
  buildFailureResponse,
  stepRecoveryContext,
  digestTargetContext,
  executedStepsBreadcrumb,
} = require("../../app/failure_response");
const pageScripts = require("../../app/page_scripts");

let tmpDirs = [];
function tmpSkillDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fail-resp-"));
  tmpDirs.push(dir);
  return dir;
}

const BASE_DEPS = {
  agentRecoveryEnabled: false,
  maxRecoveryTier: 4,
  appendRecoveryEvent: () => {},
  stepAssertions: () => [],
  frameScopedInventory: async () => null,
};

// Mock page whose evaluate() dispatches on the injected page-script function —
// failure_response gathers three different things from the page realm:
// the interactive inventory, scrollY, and the park-style page fingerprint.
function mockPage({ inventory = [], interactiveCount = inventory.length } = {}) {
  return {
    url: () => "https://x.example/",
    viewportSize: () => ({ width: 1280, height: 800 }),
    evaluate: async (fn) => {
      if (fn === pageScripts.domInventory) return inventory;
      if (fn === pageScripts.getScrollY) return 42;
      return { interactiveCount, text: "body text" }; // pageScripts.pageFingerprint shape
    },
    screenshot: async () => Buffer.from("shot"),
  };
}

function entry(slug, extra = {}) {
  return { slug, workspace_id: `ws-${slug}`, skillDir: tmpSkillDir(), ...extra };
}

test.after?.(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

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

test("digestTargetContext: exposes tag/text/testid/anchors for ranking", () => {
  const ctx = digestTargetContext({
    failedStep: {
      anchors: [{ text: "Buy now", priority: 3 }],
      identity_bundle: { fingerprint: { tag: "button", role: "button", inner_text: "Buy Now", data_testid: "buy-btn" } },
    },
  });
  assert.strictEqual(ctx.tag, "button");
  assert.strictEqual(ctx.data_testid, "buy-btn");
  assert.deepStrictEqual(ctx.anchors, ["Buy now"]);
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
    entry("studio-ceiling"),
    null,
    null,
    { ...BASE_DEPS, agentRecoveryEnabled: false, maxRecoveryTier: 2, appendRecoveryEvent: (e) => events.push(e) }
  );
  assert.strictEqual(screenshotCalls, 0, "T1/T2 ceiling must never capture a screenshot");
  assert.strictEqual(resp.content.length, 1);
  assert.match(resp.content[0].text, /Execution failed at step 4/);
  assert.match(resp.content[0].text, /Recovery ceiling Tier 2/);
  assert.ok(!/step_overrides/.test(resp.content[0].text), "no agent handoff protocol at ceiling 2");
  assert.ok(events.some(e => e.event === "recovery_ceiling_reached"));
});

test("tier 3 first round: indexed digest, candidate_index protocol, zero screenshots", async () => {
  let screenshotCalls = 0;
  const page = mockPage({
    inventory: [
      { tag: "button", text: "Purchase order", "data-testid": "buy-btn" },
      { tag: "a", text: "Order history" },
    ],
  });
  page.screenshot = async () => { screenshotCalls++; return Buffer.from("shot"); };

  const events = [];
  const resp = await buildFailureResponse(
    page,
    { message: "strict mode violation", failedAt: 1 },
    entry("t3-first"),
    { emit() {} },
    null,
    { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 4, appendRecoveryEvent: (e) => events.push(e) }
  );

  assert.strictEqual(screenshotCalls, 0, "semantic round must never spend vision tokens");
  assert.ok(resp.content.every(c => c.type === "text"), "tier 3 payload is text-only");

  const texts = resp.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  assert.match(texts, /resume_from: 1/);
  assert.match(texts, /candidate_index/);
  assert.match(texts, /confidence/);
  assert.match(texts, /ranked against the recorded target/);
  assert.match(texts, /\[0\] button testid=buy-btn "Purchase order"/, "strongest match ranks first");
  assert.match(texts, /\[1\] a "Order history"/);
  assert.ok(!/── Tier 4/.test(texts), "no vision section in the semantic round");
  assert.ok(events.some(e => e.event === "agent_recovery_requested" && e.tier === 3 && e.round === 1));
});

test("escalation: second round for the same step is tier 4 (vision), separate payload", async () => {
  let screenshotCalls = 0;
  const page = mockPage({ inventory: [{ tag: "button", text: "Submit" }] });
  page.screenshot = async () => { screenshotCalls++; return Buffer.from("shot"); };

  const ent = entry("t4-second");
  const commonDeps = { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 4 };

  await buildFailureResponse(page, { message: "not found", failedAt: 2 }, ent, { emit() {} }, null, commonDeps);

  const events = [];
  const resp = await buildFailureResponse(
    page,
    { message: "still not found", failedAt: 2 },
    ent,
    { emit() {} },
    null,
    { ...commonDeps, appendRecoveryEvent: (e) => events.push(e) }
  );

  assert.ok(screenshotCalls >= 1, "vision round captures the failing page");
  const texts = resp.content.map(c => c.text || "").join("\n");
  assert.match(texts, /Tier 4 \(visual identification\)/);
  assert.ok(resp.content.some(c => c.type === "image"), "screenshots ride along the vision round");
  assert.match(texts, /candidate_index/, "closing edge unchanged — index nomination or selector");
  assert.ok(events.some(e => e.event === "agent_recovery_requested" && e.tier === 4 && e.round === 2));
});

test("escalation: an agent-override step that fails again goes straight to tier 4", async () => {
  const page = mockPage();
  const resp = await buildFailureResponse(
    page,
    {
      message: "ambiguous",
      failedAt: 5,
      overrideValidationFailed: true,
      overrideReason: "ambiguous",
      failedStep: { type: "click", _agent_override: true, identity_bundle: { fingerprint: {} } },
    },
    entry("override-t4"),
    { emit() {} },
    null,
    { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 4 }
  );
  const texts = resp.content.map(c => c.text || "").join("\n");
  assert.match(texts, /Tier 4 \(visual identification\)/);
  assert.match(texts, /previous recovery pick/, "reports WHY the last pick was rejected");
});

test("ceiling 3: second round stays semantic — vision never fires", async () => {
  let screenshotCalls = 0;
  const page = mockPage({ inventory: [] });
  page.screenshot = async () => { screenshotCalls++; return Buffer.from("shot"); };

  const ent = entry("ceiling3");
  const commonDeps = { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 3 };
  await buildFailureResponse(page, { message: "not found", failedAt: 0 }, ent, { emit() {} }, null, commonDeps);
  const resp = await buildFailureResponse(page, { message: "not found", failedAt: 0 }, ent, { emit() {} }, null, commonDeps);

  assert.strictEqual(screenshotCalls, 0);
  const texts = resp.content.map(c => c.text || "").join("\n");
  assert.match(texts, /Tier 3 \(semantic grounding\)/);
  assert.ok(!resp.content.some(c => c.type === "image"));
});

test("stagnation hard cap: identical page across repeat rounds of one tier stops escalation", async () => {
  const page = mockPage(); // fingerprint identical on every call
  const ent = entry("stagnant");
  const commonDeps = { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 4 };
  const events = [];

  // Round 1 → T3 sent. Round 2 → T4 sent (tier change adds information even on an identical page).
  await buildFailureResponse(page, { message: "fail", failedAt: 7 }, ent, { emit() {} }, null, commonDeps);
  await buildFailureResponse(page, { message: "fail", failedAt: 7 }, ent, { emit() {} }, null, commonDeps);
  const resp = await buildFailureResponse(
    page, { message: "fail", failedAt: 7 }, ent, { emit() {} }, null,
    { ...commonDeps, appendRecoveryEvent: (e) => events.push(e) }
  );
  const texts = resp.content.map(c => c.text || "").join("\n");
  assert.match(texts, /Recovery stopped/);
  assert.match(texts, /page has not changed/);
  assert.ok(!/candidate_index/.test(texts), "no further paid recovery protocol after the cap");
  assert.ok(events.some(e => e.event === "recovery_stagnant_stop"));
});

test("different steps escalate independently (a healed step resets nothing for others)", async () => {
  const page = mockPage({ inventory: [{ tag: "button", text: "Go" }] });
  const ent = entry("per-step");
  const commonDeps = { ...BASE_DEPS, agentRecoveryEnabled: true, maxRecoveryTier: 4 };

  await buildFailureResponse(page, { message: "fail", failedAt: 0 }, ent, { emit() {} }, null, commonDeps);
  const respOtherStep = await buildFailureResponse(
    page, { message: "fail", failedAt: 3 }, ent, { emit() {} }, null, commonDeps
  );
  const texts = respOtherStep.content.map(c => c.text || "").join("\n");
  assert.match(texts, /Tier 3 \(semantic grounding\)/, "a different failed step starts fresh at tier 3");
});
