"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { createTabRegistry, resolveStepPage, stepNamesTab, stepInheritsPage, closeExtraTabs } = require("../tabs");

// Minimal fake Playwright Page/BrowserContext — enough surface for tabs.js, no real browser.
function fakePage(id, { url = "" } = {}) {
  let closed = false;
  let currentUrl = url;
  let waiters = [];
  const page = {
    id,
    waitForURLCalls: 0,
    isClosed: () => closed,
    close: () => {
      closed = true;
      waiters.forEach((w) => w.reject(new Error("closed")));
      waiters = [];
    },
    url: () => currentUrl,
    // Simulates a real navigation (e.g. a target=_blank popup landing on its destination a
    // beat after opening at about:blank) — resolves any waitForURL() call whose predicate the
    // new URL satisfies.
    navigate(newUrl) {
      currentUrl = newUrl;
      const satisfied = waiters.filter((w) => w.predicate(newUrl));
      waiters = waiters.filter((w) => !w.predicate(newUrl));
      satisfied.forEach((w) => w.resolve());
    },
    waitForURL(predicate, opts = {}) {
      page.waitForURLCalls++;
      return new Promise((resolve, reject) => {
        if (predicate(currentUrl)) return resolve();
        // Fake timeout capped well below any real value under test so a page that never
        // navigates doesn't slow the suite down, regardless of what timeout was requested.
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w.resolve !== resolve);
          reject(new Error("timeout"));
        }, Math.min(Number(opts.timeout) || 0, 50));
        waiters.push({ predicate, resolve: () => { clearTimeout(timer); resolve(); }, reject });
      });
    },
    waitForLoadState(_state, opts = {}) {
      page._lastLoadStateTimeout = opts.timeout;
      return Promise.resolve();
    },
    bringToFront: async () => {},
  };
  return page;
}

function fakeContext({ waitForEventPage = null } = {}) {
  const listeners = [];
  return {
    listeners,
    newPageCalls: 0,
    on(evt, cb) { if (evt === "page") listeners.push(cb); },
    async newPage() {
      this.newPageCalls++;
      const page = fakePage(`user-created-${this.newPageCalls}`);
      // Real Playwright fires the context's "page" event for context.newPage() too, not just
      // for site-opened popups — mirrored here since that's exactly the collision tabs.js's
      // `bound` set exists to prevent.
      for (const cb of listeners) cb(page);
      return page;
    },
    async waitForEvent(_evt, opts = {}) {
      const predicate = typeof opts === "function" ? opts : opts.predicate;
      if (waitForEventPage && (!predicate || predicate(waitForEventPage))) return waitForEventPage;
      throw new Error("timed out waiting for page event");
    },
    fireNewPage(page) { for (const cb of listeners) cb(page); },
  };
}

function registryWith(context) {
  const initial = fakePage("tab_0");
  initial.context = () => context;
  return createTabRegistry(initial);
}

test("stepNamesTab: false for absent/tab_0, true for a real tab", () => {
  assert.strictEqual(stepNamesTab({}), false);
  assert.strictEqual(stepNamesTab({ tab: { id: "tab_0" } }), false);
  assert.strictEqual(stepNamesTab({ tab: { id: "tab_1" } }), true);
});

test("stepInheritsPage: true only for a tab marker with no tab block at all", () => {
  assert.strictEqual(stepInheritsPage({ type: "popup" }), true);
  assert.strictEqual(stepInheritsPage({ type: "tab_switch" }), true);
  assert.strictEqual(stepInheritsPage({ type: "tab_open" }), true);
  assert.strictEqual(stepInheritsPage({ type: "popup", tab: {} }), true);
  assert.strictEqual(stepInheritsPage({ type: "popup", tab: { id: "tab_2" } }), false);
  assert.strictEqual(stepInheritsPage({ type: "click" }), false);
  assert.strictEqual(stepInheritsPage({ type: "click", tab: { id: "tab_2" } }), false);
});

test("no tab / tab_0 always resolves to the initial page", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const a = await resolveStepPage(registry, {});
  const b = await resolveStepPage(registry, { tab: { id: "tab_0" } });
  assert.strictEqual(a.id, "tab_0");
  assert.strictEqual(b.id, "tab_0");
});

test("site-opened tab: drains an already-queued popup instead of waiting", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1");
  ctx.fireNewPage(popup); // fires before any step asks — this is the race tabs.js closes
  const page = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(page.id, "popup-1");
});

test("site-opened tab: waits for the page event if none is queued yet", async () => {
  const late = fakePage("late-popup");
  const ctx = fakeContext({ waitForEventPage: late });
  const registry = registryWith(ctx);
  const page = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(page.id, "late-popup");
});

test("returning to an already-bound tab reuses the same page object", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1");
  ctx.fireNewPage(popup);
  const first = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  const second = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(first, second);
});

test("user-opened tab (Ctrl+T): the runtime creates it itself", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const page = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "user" } });
  assert.strictEqual(ctx.newPageCalls, 1);
  assert.strictEqual(page.id, "user-created-1");
});

test("a page created for a user-opened tab is never later handed out as a different site-opened tab", async () => {
  // The exact Create-a-Lead failure: step 11 opens tab_1 via Ctrl+T (opened_by: "user"), then a
  // click on tab_1 opens the real login popup (tab_2, opened_by: "site"). Before the `bound` set
  // existed, tab_1's own blank page — which also lands in pendingPages, since newPage() fires
  // the same context "page" event a real popup does — was handed back out as tab_2, so the
  // login form ran against the wrong page.
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const userPage = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "user" } });
  const realPopup = fakePage("popup-2");
  ctx.fireNewPage(realPopup);
  const sitePage = await resolveStepPage(registry, { tab: { id: "tab_2", opened_by: "site" } });
  assert.strictEqual(sitePage.id, "popup-2");
  assert.notStrictEqual(sitePage, userPage);
});

test("draining pendingPages skips pages already bound to another tab or already closed", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const alreadyBound = fakePage("already-bound");
  registry.bound.add(alreadyBound);
  ctx.fireNewPage(alreadyBound);
  const closedOne = fakePage("closed-one");
  closedOne.close();
  ctx.fireNewPage(closedOne);
  const real = fakePage("real-popup");
  ctx.fireNewPage(real);
  const page = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(page.id, "real-popup");
});

test("unresolvable site tab throws tabNotFound and never falls back to the current page", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  await assert.rejects(
    () => resolveStepPage(registry, { tab: { id: "tab_9", opened_by: "site" } }),
    (err) => err.tabNotFound === true
  );
});

test("a bound tab that has since closed is re-resolved rather than returned stale", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1");
  ctx.fireNewPage(popup);
  const first = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  first.close();
  const replacement = fakePage("popup-2");
  ctx.fireNewPage(replacement);
  const second = await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(second.id, "popup-2");
});

test("an about:blank popup is settled only after it navigates to a real url", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1", { url: "about:blank" });
  ctx.fireNewPage(popup);
  const settlePromise = resolveStepPage(
    registry,
    { tab: { id: "tab_1", opened_by: "site" } },
    { loadTimeoutMs: 5000 }
  );
  // Let resolveStepPage's drain + _settle's waitForURL registration run before navigating —
  // otherwise this call could race ahead of the waiter being set up.
  await new Promise((r) => setImmediate(r));
  popup.navigate("https://search-engine-5nfe.vercel.app/login");
  const page = await settlePromise;
  assert.strictEqual(page.url(), "https://search-engine-5nfe.vercel.app/login");
});

test("_settle passes the caller's loadTimeoutMs through to the page's load waits", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1", { url: "https://example.com/already-loaded" });
  ctx.fireNewPage(popup);
  await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } }, { loadTimeoutMs: 12345 });
  assert.strictEqual(popup._lastLoadStateTimeout, 12345);
});

test("_settle defaults to the 60s settle timeout when no loadTimeoutMs is given", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1", { url: "https://example.com/already-loaded" });
  ctx.fireNewPage(popup);
  await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } });
  assert.strictEqual(popup._lastLoadStateTimeout, 60000);
});

// Regression: a user-opened (Ctrl+T) tab's page is deliberately blank until the compiler's own
// synthesized `navigate` step runs against it — nothing else ever navigates it on its own. The
// about:blank wait in _settle must not apply to it, or resolving the tab_open marker step AND
// the navigate step that immediately follows it (both carry the same tab.id) each burn the full
// settle timeout waiting for a navigation that was never going to happen by itself — the exact
// stall reported against the Create-a-Lead workflow's Vercel tab.
test("a user-opened tab never waits for its own navigation — that would double the stall for no reason", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const tabOpenStep = { type: "tab_open", tab: { id: "tab_1", opened_by: "user" } };
  const navigateStep = { type: "navigate", tab: { id: "tab_1", opened_by: "user" } };

  const page1 = await resolveStepPage(registry, tabOpenStep, { loadTimeoutMs: 5000 });
  const page2 = await resolveStepPage(registry, navigateStep, { loadTimeoutMs: 5000 });

  assert.strictEqual(page1, page2);
  assert.strictEqual(page1.url(), "");
  assert.strictEqual(page1.waitForURLCalls, 0, "waitForURL must never be called for a user-opened tab");
});

test("a site-opened tab still waits for its popup to leave about:blank", async () => {
  const ctx = fakeContext();
  const registry = registryWith(ctx);
  const popup = fakePage("popup-1", { url: "about:blank" });
  ctx.fireNewPage(popup);
  await resolveStepPage(registry, { tab: { id: "tab_1", opened_by: "site" } }, { loadTimeoutMs: 5000 });
  assert.strictEqual(popup.waitForURLCalls, 1);
});

// EXEC-14: a second tab a multi-tab run opens must not outlive the run in the headless/cached-
// context path (watch: false) — nothing else closes it there. See server.js's _openedTabs +
// closeExtraTabs(_openedTabs, ...) call on every exit path.
test("closeExtraTabs: closes every tracked page not in the keep set", async () => {
  const a = fakePage("a");
  const b = fakePage("b");
  const c = fakePage("c");
  await closeExtraTabs(new Set([a, b, c]), b);
  assert.strictEqual(a.isClosed(), true);
  assert.strictEqual(b.isClosed(), false, "kept page must survive");
  assert.strictEqual(c.isClosed(), true);
});

test("closeExtraTabs: accepts a Set for keep, not just a single page", async () => {
  const a = fakePage("a");
  const b = fakePage("b");
  await closeExtraTabs(new Set([a, b]), new Set([a, b]));
  assert.strictEqual(a.isClosed(), false);
  assert.strictEqual(b.isClosed(), false);
});

test("closeExtraTabs: no keep argument closes everything tracked", async () => {
  const a = fakePage("a");
  const b = fakePage("b");
  await closeExtraTabs(new Set([a, b]));
  assert.strictEqual(a.isClosed(), true);
  assert.strictEqual(b.isClosed(), true);
});

test("closeExtraTabs: already-closed pages are skipped without error", async () => {
  const a = fakePage("a");
  a.close();
  await assert.doesNotReject(() => closeExtraTabs(new Set([a])));
});

test("closeExtraTabs: a page whose close() throws does not stop the rest from closing", async () => {
  const broken = fakePage("broken");
  broken.close = () => { throw new Error("already gone"); };
  const survivor = fakePage("survivor");
  await assert.doesNotReject(() => closeExtraTabs(new Set([broken, survivor])));
  assert.strictEqual(survivor.isClosed(), true);
});

test("closeExtraTabs: empty tracked set is a no-op", async () => {
  await assert.doesNotReject(() => closeExtraTabs(new Set()));
});
