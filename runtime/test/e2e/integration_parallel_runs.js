"use strict";

// RT-3: proof that two workflow runs can execute concurrently against one runtime process
// without corrupting or blocking each other.
//
//   Part 1 — two runPlans, on two independently-created browser contexts, run concurrently
//   (Promise.all) and both complete correctly; cancelling one (via its own cancelCheck) never
//   touches the other. run.js/tabs.js already carry zero module-level mutable state, so this is
//   mostly a sanity check that nothing in this change broke that.
//
//   Part 2 — the actual RT-3 risk surface: browser.js's headless browser cache used to be a
//   single slot per workspace with no notion of "in use", so two concurrent getCachedBrowser()
//   calls for the same workspace would return the SAME live context — exactly what let one run's
//   tab-popup registry (tabs.js) and download listener (server.js) fire for the other run's
//   pages. This proves two concurrent calls now get two independent contexts, and that releasing
//   a lease correctly returns it to the cache for reuse (not left permanently busy, and not
//   closed out from under a still-running lease).
//
// Run: node test/e2e/integration_parallel_runs.js   (requires Playwright + installed Chromium)

const os = require("os");
const path = require("path");
const fs = require("fs");
const http = require("http");
const assert = require("node:assert");

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  // Prefer the runtime's own bundled Chromium (always present in this repo checkout) over the
  // installer's ~/.conxa/chromium, which may hold only a partial/older revision on a dev machine.
  const _repoChromium = path.join(__dirname, "..", "..", "chromium");
  process.env.PLAYWRIGHT_BROWSERS_PATH = fs.existsSync(_repoChromium)
    ? _repoChromium
    : path.join(os.homedir(), ".conxa", "chromium");
}

// browser.js reads CONXA_DIR/CONXA_DATA_DIR from process.env at module-load time — must be set
// before the first require of ../../app/browser (or ../../app/run, which requires it transitively).
const _tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-rt3-e2e-"));
const CONXA_DIR = path.join(_tmpRoot, "install");
const CONXA_DATA_DIR = path.join(_tmpRoot, "data");
process.env.CONXA_DIR = CONXA_DIR;
process.env.CONXA_DATA_DIR = CONXA_DATA_DIR;

const { chromium } = require("playwright");
const { runPlan } = require("../../app/run");
const { getCachedBrowser, releaseCachedBrowser } = require("../../app/browser");

const quietTracker = { emit: () => {} };
let failures = 0;

function check(cond, label) {
  if (cond) { console.log(`ok - ${label}`); }
  else { failures++; console.log(`not ok - ${label}`); }
}

// A click step whose compiled identity resolves cleanly (no recovery needed) — steps.js is
// exercised for real; the point here is concurrency, not recovery.
function clickStep(testid) {
  return {
    type: "click",
    identity_bundle: {
      signals: [{ engine: "testid", selector: `[data-testid='${testid}']`, durability: 0.95 }],
      fingerprint: { role: "button", data_testid: testid },
    },
  };
}

const PAGE_HTML = `<!doctype html><html><head><title>start</title></head><body>
  <button data-testid="go" onclick="document.title='clicked'">Go</button>
</body></html>`;

async function testConcurrentRunPlans(url) {
  const browserA = await chromium.launch({ headless: true });
  const browserB = await chromium.launch({ headless: true });
  try {
    const pageA = await browserA.newPage();
    const pageB = await browserB.newPage();
    await pageA.goto(url, { waitUntil: "domcontentloaded" });
    await pageB.goto(url, { waitUntil: "domcontentloaded" });

    // Run A completes normally; Run B is cancelled via its own cancelCheck. Each run's
    // cancelCheck is a plain local closure (no shared registry involved at the runPlan layer),
    // mirroring how server.js wires exec.cancelRequested per run.
    let bCancelRequested = false;
    const [resultA, resultBErr] = await Promise.all([
      runPlan(pageA, [clickStep("go")], {}, 0, "run-a", { tracker: quietTracker, cancelCheck: () => false }),
      runPlan(pageB, [clickStep("go")], {}, 0, "run-b", { tracker: quietTracker, cancelCheck: () => bCancelRequested })
        .catch((e) => e),
    ]);
    // Flip B's cancel mid-flight isn't needed for this assertion set — run concurrently to prove
    // no interference, then separately prove cancelling one doesn't affect a sibling.
    void bCancelRequested;

    check(!!resultA, "run A (uncancelled) completes concurrently with run B");
    check(await pageA.title() === "clicked", "run A's own page reflects run A's own click");
    check(await pageB.title() === "clicked", "run B's own page reflects run B's own click (no cross-run interference)");
    void resultBErr;

    // Now prove cancellation isolation: cancel a fresh run B' while run A' (uncancelled) runs
    // alongside it — A' must complete even though B' aborts.
    const pageA2 = await browserA.newPage();
    const pageB2 = await browserB.newPage();
    await pageA2.goto(url, { waitUntil: "domcontentloaded" });
    await pageB2.goto(url, { waitUntil: "domcontentloaded" });
    const [resultA2, resultB2] = await Promise.allSettled([
      runPlan(pageA2, [clickStep("go")], {}, 0, "run-a2", { tracker: quietTracker, cancelCheck: () => false }),
      runPlan(pageB2, [clickStep("go")], {}, 0, "run-b2", { tracker: quietTracker, cancelCheck: () => true }),
    ]);
    check(resultA2.status === "fulfilled", "run A' finishes even though sibling run B' is cancelled");
    check(resultB2.status === "rejected" && resultB2.reason && resultB2.reason.cancelled === true,
      "run B' surfaces its own cancellation without touching run A'");
  } finally {
    await browserA.close().catch(() => {});
    await browserB.close().catch(() => {});
  }
}

async function testConcurrentBrowserLeases(url) {
  // Minimal on-disk fixture browser.js's getAuthContext needs: a pack.json whose protected_url
  // is this test's own server (so session validation succeeds immediately — no real login), and
  // a raw session file so getAuthContext takes the "existing session" path rather than opening an
  // interactive login window.
  const workspaceId = "ws-rt3-e2e";
  const packDir = path.join(CONXA_DIR, "skill-packs", workspaceId);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify({ target_url: url, protected_url: url }));
  const sessionsDir = path.join(CONXA_DATA_DIR, "cache", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, `${workspaceId}_raw_state.json`), JSON.stringify({ cookies: [], origins: [] }));

  // Two concurrent leases for the SAME workspace — before RT-3 these would have raced onto the
  // same cached context. Now: at most one is a genuine cache hit; both get real, independent
  // contexts either way.
  const [resultX, resultY] = await Promise.all([
    getCachedBrowser(workspaceId, null, { headless: true }),
    getCachedBrowser(workspaceId, null, { headless: true }),
  ]);

  check(!resultX.authPending && !resultY.authPending, "both concurrent leases authenticate against the fixture session");
  check(resultX.context !== resultY.context, "two concurrent runs never share one live browser context");
  const leaseKeys = [resultX.leaseKey, resultY.leaseKey];
  check(leaseKeys.filter(Boolean).length <= 1, "at most one concurrent caller holds the cache slot's lease");

  // Release whichever one is leased (returns to the idle cache); close the other directly, same
  // contract server.js follows (leaseKey null ⇒ caller owns and must close it).
  const leased = resultX.leaseKey ? resultX : (resultY.leaseKey ? resultY : null);
  const unleased = leased === resultX ? resultY : resultX;
  if (leased) releaseCachedBrowser(leased.leaseKey);
  await unleased.browser.close().catch(() => {});

  if (leased) {
    // A subsequent call for the same workspace should now hit the released lease.
    const resultZ = await getCachedBrowser(workspaceId, null, { headless: true });
    check(resultZ.cached === true && resultZ.context === leased.context,
      "releasing a lease returns it to the cache for the next caller to reuse");
    releaseCachedBrowser(resultZ.leaseKey);
    await leased.browser.close().catch(() => {});
  } else {
    // Race landed with neither call claiming the slot (both saw it filled by the other) —
    // extremely unlikely given the code path, but close both cleanly rather than leak.
    await resultX.browser.close().catch(() => {});
    await resultY.browser.close().catch(() => {});
  }
}

async function main() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE_HTML);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  try {
    await testConcurrentRunPlans(url);
    await testConcurrentBrowserLeases(url);
  } finally {
    server.close();
    fs.rmSync(_tmpRoot, { recursive: true, force: true });
  }

  console.log(`# fail ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
