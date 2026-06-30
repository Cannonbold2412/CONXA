"use strict";

// Proof that execution honours cancellation *during* the Tier 1/2 recovery cascade — not only at
// the between-step boundary. This is the runtime side of the MCP cancellation contract: when the
// client sends notifications/cancelled (which it also does when its own request times out), the
// SDK aborts a signal that server.js maps onto activeExecution.cancelRequested → runPlan's
// cancelCheck. Without a yield inside recoverStep, a step already grinding through recovery would
// run the whole cascade before noticing, leaving the client waiting and a browser parked.
//
// Run: node test/integration_cancellation.js   (requires Playwright + installed Chromium)

const os = require("os");
const path = require("path");
const http = require("http");
const assert = require("node:assert");

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), ".conxa", "chromium");
}
process.env.CONXA_HUMAN_PACING = "0";
process.env.CONXA_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_SECONDARY_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_RECOVERY_LOCATOR_TIMEOUT_MS = "600";

const { chromium } = require("playwright");
const { runPlan } = require("../run");

const PAGE_HTML = `<!doctype html><html><head><title>start</title></head><body>
  <header><button data-testid="go" id="real-submit">Submit Order</button></header>
</body></html>`;

// A click step whose compiled identity points at an element that does not exist and carries no
// fallback, so the primary attempt fails and control enters the recovery cascade.
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
    // ── Case 1: cancel at the between-step boundary → throws { cancelled } before acting ──
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      let threw = null;
      try {
        await runPlan(page, [brokenStep()], {}, 0, "ctest", {
          tracker: quietTracker, observerMs: 0, cancelCheck: () => true,
        });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected cancellation to throw");
        assert.strictEqual(threw.cancelled, true, "error must be marked cancelled");
        console.log("ok 1 - cancellation at the step boundary throws { cancelled }");
      } catch (e) { failures++; console.log("not ok 1 -", e.message); }
      await page.close();
    }

    // ── Case 2: cancel becomes true only AFTER the step starts → recovery cascade bails out ──
    // First cancelCheck (top of the step loop) sees false so the step proceeds and fails into
    // recovery; subsequent checks (recoverStep's stage bails) see true. The step must surface a
    // { cancelled } error rather than a plain resolve-miss step failure.
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      let calls = 0;
      const cancelCheck = () => (++calls > 1); // false on the loop-top check, true thereafter
      let threw = null;
      try {
        await runPlan(page, [brokenStep()], {}, 0, "ctest", {
          tracker: quietTracker, observerMs: 0, cancelCheck,
        });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the step to throw");
        assert.strictEqual(threw.cancelled, true,
          `recovery must yield to cancellation (got: ${threw.message})`);
        console.log("ok 2 - recovery cascade yields to mid-step cancellation");
      } catch (e) { failures++; console.log("not ok 2 -", e.message); }
      await page.close();
    }

    // ── Case 3: wall-clock deadline → the execution watchdog supplies a time-based cancelCheck ──
    // server.js's _execCancelled returns true once Date.now() passes the per-execution deadline.
    // This is the fix that stops a doomed run *before* the MCP client's request timeout instead of
    // letting one step burn the whole budget. A deadline already in the past must abort the run with
    // a { cancelled } error, exactly like an explicit cancel.
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const deadlineAt = Date.now() - 1;           // budget already spent
      const cancelCheck = () => Date.now() >= deadlineAt;
      let threw = null;
      try {
        await runPlan(page, [brokenStep()], {}, 0, "ctest", {
          tracker: quietTracker, observerMs: 0, cancelCheck,
        });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the deadline to abort the run");
        assert.strictEqual(threw.cancelled, true,
          `deadline must abort via the cancellation path (got: ${threw.message})`);
        console.log("ok 3 - wall-clock deadline aborts the run via cancelCheck");
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
