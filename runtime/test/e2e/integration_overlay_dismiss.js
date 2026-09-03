"use strict";

// EXEC-30 end-to-end proof, against a real Chromium page: the Tier B "unrecognized overlay"
// reasoning path — from failure (a modal blocks the recorded target and the static known-pattern
// list finds nothing) through the failure payload (overlay probe surfaces it, ranked digest tags
// it [overlay]) to the closing edge (a `dismiss` step_override clicks ONLY a safe close/cancel
// control, never a commit-style one, and the win is written to the learned store).
//
// Run: node test/e2e/integration_overlay_dismiss.js   (requires Playwright + installed Chromium)

const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("node:assert");

// Env vars before any app require — recovery.log and the learned-overlay store must land in a
// throwaway directory (same pattern as test_dismiss_patterns.js / integration_agent_recovery.js).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), ".conxa", "chromium");
}
process.env.CONXA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-overlay-itest-"));
process.env.CONXA_DIR = process.env.CONXA_DATA_DIR;
process.env.CONXA_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_SECONDARY_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_RECOVERY_LOCATOR_TIMEOUT_MS = "600";

const { chromium } = require("playwright");
const { runPlan, applyStepOverrides } = require("../../app/run");
const { buildFailureResponse } = require("../../app/failure_response");
const { frameScopedInventory } = require("../../app/resolution");
const { stepAssertions } = require("../../app/assertions");
const learnedDismissals = require("../../app/learned_dismissals");

// The real, recorded target: a compiled identity that matches nothing but its own testid/label —
// so when it's uncovered, only itself can satisfy the click, and when it's covered, the failure
// is purely the overlay's doing (no fallback signal papers over it).
function clickStep() {
  return {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "testid", selector: "[data-testid='go']", durability: 0.95 }],
      fingerprint: { role: "button", aria_label: "Submit Order", data_testid: "go" },
    },
  };
}

function pageHtml(variant) {
  // `promo`: a full-viewport modal with NO role/aria-modal and NOT consent-toolkit shaped, so
  // KNOWN_DISMISS_SELECTORS matches nothing — the exact "unrecognized overlay" case EXEC-30
  // exists for. Carries a safe close control AND a tempting commit control in the same banner,
  // so the test can prove only the close control is ever clicked.
  // `confirm`: a genuine commit-style dialog (role="dialog") — Delete must never be clicked.
  const overlay = variant === "promo"
    ? `<div id="ov" style="position:fixed;inset:0;background:rgba(0,0,0,.85);color:#fff;
         display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center">
         <span>Get 20% off your first order!</span>
         <button aria-label="Close" onclick="document.getElementById('ov').remove()">×</button>
         <button onclick="document.title='BOUGHT'">Buy now</button>
       </div>`
    : `<div id="ov" role="dialog" aria-modal="true" style="position:fixed;inset:0;background:rgba(0,0,0,.85);
         color:#fff;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center">
         <span>Delete this account? This cannot be undone.</span>
         <button onclick="document.title='DELETED'">Delete</button>
         <button onclick="document.getElementById('ov').remove()">Cancel</button>
       </div>`;
  return `<!doctype html><html><head><title>start</title></head><body>
    <button data-testid="go" id="real-submit" aria-label="Submit Order">Submit Order</button>
    ${overlay}
    <script>
      document.querySelector('[data-testid=go]').addEventListener('click', () => { document.title = 'CLICKED'; });
    </script>
  </body></html>`;
}

const quietTracker = { emit: () => {} };

async function main() {
  const server = http.createServer((req, res) => {
    const variant = req.url.replace(/^\//, "") || "promo";
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(pageHtml(variant));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "overlay-itest-skill-"));
  const entry = { slug: "overlay-itest", workspace_id: "ws-overlay-itest", skillDir };
  const failureDeps = {
    agentRecoveryEnabled: true, maxRecoveryTier: 4,
    appendRecoveryEvent: () => {}, stepAssertions, frameScopedInventory,
  };

  try {
    // ── Case 1: unrecognized promo modal blocks the target → deterministic failure, and the
    //    failure payload names the overlay and offers a dismiss override ──────────────────────
    {
      const page = await browser.newPage();
      await page.goto(`${base}/promo`, { waitUntil: "domcontentloaded" });
      let threw = null;
      try {
        await runPlan(page, [clickStep()], {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the covered target to fail");
        assert.notStrictEqual(await page.title(), "CLICKED", "must not have clicked through the overlay");

        const resp = await buildFailureResponse(page, threw, entry, quietTracker, [clickStep()], failureDeps);
        const texts = resp.content.filter(c => c.type === "text").map(c => c.text).join("\n");
        assert.match(texts, /covering the page/i, "failure payload must name the overlay");
        assert.match(texts, /\[overlay\]/, "ranked digest must tag the overlay's own controls");
        assert.match(texts, /"dismiss"/, "must offer the dismiss override shape");
        console.log("ok 1 - unrecognized overlay is named in the failure payload with a dismiss offer");
      } catch (e) { failures++; console.log("not ok 1 -", e.message); }
      await page.close();
    }

    // ── Case 2: agent nominates the close control → dismissed, step lands, learned for next time ─
    {
      const page = await browser.newPage();
      await page.goto(`${base}/promo`, { waitUntil: "domcontentloaded" });
      const healed = applyStepOverrides([clickStep()], { "0": { dismiss: { selector: 'button[aria-label="Close"]' } } });
      let threw = null;
      try {
        await runPlan(page, healed, {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(!threw, threw ? `unexpected failure: ${threw.message}` : "");
        assert.strictEqual(await page.title(), "CLICKED", "target step must have landed after dismissal");

        const log = fs.readFileSync(path.join(process.env.CONXA_DIR, "logs", "recovery.log"), "utf8").trim().split("\n");
        const event = log.map(l => JSON.parse(l)).find(e => e.event === "tierb_overlay_dismissed");
        assert.ok(event, "tierb_overlay_dismissed must be logged");
        assert.strictEqual(event.selector, 'button[aria-label="Close"]');

        const learned = learnedDismissals.selectorsFor(`${base}/promo`);
        assert.ok(learned.includes('button[aria-label="Close"]'), "successful agent dismissal must be written to the learned store");
        console.log("ok 2 - agent-nominated dismissal clears the overlay, step lands, win is learned");
      } catch (e) { failures++; console.log("not ok 2 -", e.message); }
      await page.close();
    }

    // ── Case 3: nominating a commit-style control (Delete) is refused — nothing clicked ─────────
    {
      const page = await browser.newPage();
      await page.goto(`${base}/confirm`, { waitUntil: "domcontentloaded" });
      const overridden = applyStepOverrides([clickStep()], { "0": { dismiss: { selector: "text=Delete" } } });
      let threw = null;
      try {
        await runPlan(page, overridden, {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "the step must still fail — nothing safe was dismissed");
        const title = await page.title();
        assert.notStrictEqual(title, "DELETED", "the destructive control must never be clicked");
        assert.notStrictEqual(title, "CLICKED", "the covered target must still be unreachable");
        assert.strictEqual(threw.failedStep._dismiss_rejected, "unsafe-label",
          "the rejection reason must ride on the step for the next failure payload to explain");

        const resp = await buildFailureResponse(page, threw, entry, quietTracker, [overridden[0]], failureDeps);
        const texts = resp.content.filter(c => c.type === "text").map(c => c.text).join("\n");
        assert.match(texts, /previous dismiss nomination was refused/i, "the next round's payload must explain WHY it was refused");
        console.log("ok 3 - a commit-style dismiss nomination is refused, nothing clicked, and the next round is told why");
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
