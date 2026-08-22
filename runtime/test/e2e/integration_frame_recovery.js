"use strict";

// End-to-end proof that iframe-nested steps execute, verify, and diagnose correctly against a
// real Chromium page + a real nested iframe — the runtime-side follow-up to the recorder fix
// that made iframe steps actually compile in the first place (see FIX.md 2026-07-16).
//
//   1. A step whose identity_bundle.frame_chain correctly resolves into a real iframe acts on
//      the right element inside it (not the top-level page).
//   2. rootCandidates/resolveStep distinguish "frame not found" (frame_chain non-empty but the
//      iframe's own selector matches nothing) from an ordinary resolve-miss, instead of silently
//      falling back to searching the top-level page.
//   3. frameScopedInventory gathers real per-element descriptors from inside the iframe — the
//      Tier 3+ DOM inventory fix.
//   4. verifyStep/evaluateAssertion correctly resolves a selector_present assertion whose target
//      only exists inside the iframe (frame-aware VERIFY fix).
//
// Run: node test/integration_frame_recovery.js   (requires Playwright + installed Chromium)

const os = require("os");
const path = require("path");
const http = require("http");
const assert = require("node:assert");

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), ".conxa", "chromium");
}
process.env.CONXA_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_SECONDARY_ACTION_TIMEOUT_MS = "600";
process.env.CONXA_RECOVERY_LOCATOR_TIMEOUT_MS = "600";

const { chromium } = require("playwright");
const { runPlan, verifyStep, frameScopedInventory } = require("../../app/run");

const FRAME_SELECTOR = 'iframe[data-testid="panel-frame"]';

// Note: an iframe's own document.title is entirely separate from the top-level page's — setting
// it inside the iframe never changes what page.title() returns. Each side gets its OWN listener
// and its OWN title marker so a test can tell "the inner button was clicked" apart from "the
// top-level decoy was wrongly clicked instead" (page.title() for the latter, the inner frame's
// own document.title, read via frame.evaluate(), for the former).
const PAGE_HTML = `<!doctype html><html><head><title>start</title></head><body>
  <button id="top-level-decoy" data-testid="submit">Top-level decoy — must NOT be clicked</button>
  <script>
    document.querySelector('#top-level-decoy').addEventListener('click', () => { document.title = 'DECOY_CLICKED'; });
  </script>
  <iframe data-testid="panel-frame" srcdoc="&lt;button data-testid=&quot;submit&quot; id=&quot;inner-submit&quot;&gt;Create Contact&lt;/button&gt;&lt;script&gt;
    document.querySelector('[data-testid=submit]').addEventListener('click', () =&gt; { document.title = 'INNER_CLICKED'; });
  &lt;/script&gt;"></iframe>
</body></html>`;

function innerFrameOf(page) {
  return page.frames().find(f => f.url() === "about:srcdoc");
}

// A click step whose target selector ([data-testid="submit"]) exists BOTH at top level (decoy)
// and inside the iframe (the real target) — frame_chain must be what disambiguates them.
function iframeStep() {
  return {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "testid", selector: '[data-testid="submit"]', durability: 0.95 }],
      fingerprint: { role: "button", data_testid: "submit" },
      frame_chain: [{ signals: [{ selector: FRAME_SELECTOR, durability: 0.99 }] }],
    },
    validation: {
      assertions: [{ type: "selector_present", target: '[data-testid="submit"]:disabled', required: false }],
    },
  };
}

// Same shape, but the frame_chain selector matches no iframe on the page at all.
function frameNotFoundStep() {
  const step = iframeStep();
  step.identity_bundle.frame_chain = [{ signals: [{ selector: 'iframe[data-testid="does-not-exist"]', durability: 0.99 }] }];
  return step;
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
    // ── Case 1: the step acts on the element INSIDE the iframe, not the top-level decoy ────────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(100); // let the srcdoc iframe's own script attach its listener
      let threw = null;
      try {
        await runPlan(page, [iframeStep()], {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(!threw, threw ? `unexpected failure: ${threw.message}` : "");
        const innerTitle = await innerFrameOf(page).evaluate(() => document.title);
        assert.strictEqual(innerTitle, "INNER_CLICKED", "must have clicked the element inside the iframe");
        assert.notStrictEqual(await page.title(), "DECOY_CLICKED", "must NOT have clicked the top-level decoy");
        console.log("ok 1 - step with frame_chain acts inside the iframe, not the top-level decoy");
      } catch (e) { failures++; console.log("not ok 1 -", e.message); }
      await page.close();
    }

    // ── Case 2: frame_chain resolves to zero roots -> distinct frameNotFound, not a silent
    //    fallback to searching the top-level page (which would find the decoy and misfire) ──────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      let threw = null;
      try {
        await runPlan(page, [frameNotFoundStep()], {}, 0, "itest", { tracker: quietTracker });
      } catch (e) { threw = e; }
      try {
        assert.ok(threw, "expected the step to fail — its containing frame does not exist");
        assert.strictEqual(threw.frameNotFound, true, "must be tagged frameNotFound, not a generic resolve-miss");
        const innerTitle = await innerFrameOf(page).evaluate(() => document.title);
        assert.notStrictEqual(innerTitle, "INNER_CLICKED", "must NOT have clicked the real inner button");
        assert.notStrictEqual(await page.title(), "DECOY_CLICKED", "must NOT have silently clicked the top-level decoy either");
        console.log("ok 2 - broken frame_chain is diagnosed distinctly, never silently searches the top-level page");
      } catch (e) { failures++; console.log("not ok 2 -", e.message); }
      await page.close();
    }

    // ── Case 3: frameScopedInventory gathers real descriptors from inside the iframe ───────────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(100);
      try {
        const entries = await frameScopedInventory(page, iframeStep(), {});
        assert.ok(Array.isArray(entries), "must return an array for a resolvable frame_chain");
        assert.ok(entries.some(e => e["data-testid"] === "submit"), "must find the inner button by its data-testid");
        console.log("ok 3 - frameScopedInventory gathers real elements from inside the iframe");
      } catch (e) { failures++; console.log("not ok 3 -", e.message); }
      await page.close();
    }

    // ── Case 4: verifyStep resolves a selector_present assertion inside the correct frame ───────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(100);
      try {
        const step = {
          identity_bundle: { frame_chain: [{ signals: [{ selector: FRAME_SELECTOR, durability: 0.99 }] }] },
          validation: { assertions: [{ type: "selector_present", target: "#inner-submit", required: true, timeout_ms: 1000 }] },
        };
        const verdict = await verifyStep(page, step, {});
        assert.strictEqual(verdict.pass, true, "assertion for an element that only exists inside the iframe must pass");
        console.log("ok 4 - verifyStep resolves selector_present against the step's own frame chain");
      } catch (e) { failures++; console.log("not ok 4 -", e.message); }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`# tests 4\n# pass ${4 - failures}\n# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
