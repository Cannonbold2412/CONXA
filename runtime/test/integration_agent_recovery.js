"use strict";

// End-to-end proof of the four-tier cascade's closing edge, against a real Chromium page.
//
//   1. A step whose identity_bundle points at a non-existent element fails through the entire
//      zero-token cascade (Tier 1 ladder + Tier 2 a11y/fallback/fuzzy) — deterministically.
//   2. The same step, healed by an agent selector override (the Tier 3/4 closing edge applied
//      via applyStepOverrides), resolves and the plan completes.
//
// Run: node test/integration_agent_recovery.js   (requires Playwright + installed Chromium)

const os = require("os");
const path = require("path");
const http = require("http");
const assert = require("node:assert");

// Use the installed Chromium unless the caller already set a browsers path.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), ".conxa", "chromium");
}
// Deterministic + fast: short action/recovery budgets.
process.env.CONXA_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_SECONDARY_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_RECOVERY_LOCATOR_TIMEOUT_MS = "600";

const { chromium } = require("playwright");
const { runPlan, applyStepOverrides } = require("../run");

const PAGE_HTML = `<!doctype html><html><head><title>start</title></head><body>
  <header><button data-testid="go" id="real-submit">Submit Order</button></header>
  <button id="decoy">Also Button</button>
  <script>
    document.querySelector('[data-testid=go]').addEventListener('click', () => {
      document.title = 'CLICKED';
    });
  </script>
</body></html>`;

// A click step whose compiled identity points at an element that no longer exists, and which
// carries no fallback text/selector/anchor — so nothing in T1/T2 can rescue it.
function brokenStep() {
  return {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "testid", selector: "[data-testid='vanished']", durability: 0.95 }],
      fingerprint: { role: "button", aria_label: "Totally Different Button", data_testid: "vanished" },
    },
  };
}

const quietTracker = { emit: () => {} };

async function main() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE_HTML);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  try {
    // ── Case 1: no override → deterministic failure through T1/T2 ──────────────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      let threw = null;
      try {
        await runPlan(page, [brokenStep()], {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the broken step to fail");
        assert.strictEqual(threw.failedAt, 0, "should fail at step 0");
        assert.notStrictEqual(await page.title(), "CLICKED", "button must NOT have been clicked");
        // Regression: stepFailure() used to build a fresh Error and silently drop
        // primaryErr.earlyDomSnapshot, so _buildFailureResponse's "prefer the failure-moment
        // snapshot" fallback never actually fired. Must be forwarded onto the thrown error.
        assert.ok(Array.isArray(threw.earlyDomSnapshot), "earlyDomSnapshot must be forwarded onto the thrown error");
        console.log("ok 1 - broken step fails deterministically through Tier 1/2");
      } catch (e) { failures++; console.log("not ok 1 -", e.message); }
      await page.close();
    }

    // ── Case 2: agent override heals the step (closing edge) ───────────────────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const healed = applyStepOverrides([brokenStep()], { "0": { selector: "[data-testid='go']" } });
      let threw = null;
      try {
        await runPlan(page, healed, {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(!threw, threw ? `unexpected failure: ${threw.message}` : "");
        assert.strictEqual(await page.title(), "CLICKED", "button should have been clicked via override");
        console.log("ok 2 - agent override heals the step and the plan completes");
      } catch (e) { failures++; console.log("not ok 2 -", e.message); }
      await page.close();
    }

    // ── Case 3: ambiguous override selector is rejected, not silently applied to candidate[0] ──
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      // "button" now matches both #real-submit and #decoy; brokenStep()'s fingerprint
      // (aria_label "Totally Different Button", data_testid "vanished") agrees with neither on
      // anything but role, so both candidates score identically — a genuine tie, margin 0.
      const overridden = applyStepOverrides([brokenStep()], { "0": { selector: "button" } });
      let threw = null;
      try {
        await runPlan(page, overridden, {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the ambiguous override to be rejected");
        assert.strictEqual(threw.overrideValidationFailed, true, "must be tagged as an override-validation rejection");
        assert.strictEqual(threw.overrideReason, "ambiguous");
        assert.ok(Array.isArray(threw.overrideCandidates) && threw.overrideCandidates.length >= 2);
        assert.notStrictEqual(await page.title(), "CLICKED", "must NOT have silently clicked either candidate");
        console.log("ok 3 - ambiguous override selector is rejected, not silently applied to candidate[0]");
      } catch (e) { failures++; console.log("not ok 3 -", e.message); }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`# tests 3\n# pass ${3 - failures}\n# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
