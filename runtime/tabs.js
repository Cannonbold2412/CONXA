"use strict";

// Multi-tab step resolution. A compiled skill's steps each carry an optional `tab` block
// (SkillStep.tab, from the compiler — see conxa_compile/compiler/build.py::_build_tab_context)
// describing which browser tab that step was recorded on. This module resolves that back to a
// live Playwright Page at replay time, mirroring the frame_chain precedent in resolver.js:
// declarative per-step context, resolved fresh on every step, never carried as mutable run state
// outside this registry.
//
// A step with no `tab` (or `tab.id` === "tab_0"/absent) always means the initial page — the
// only page every skill compiled before multi-tab support ever had, so those skills replay
// through the exact same code path as before this module existed.

const DEFAULT_TAB_OPEN_TIMEOUT_MS = 30000;
const DEFAULT_SETTLE_TIMEOUT_MS = 60000;

function tabOpenTimeoutMs() {
  const value = Number(process.env.CONXA_TAB_OPEN_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_TAB_OPEN_TIMEOUT_MS;
}

/**
 * Create a tab registry bound to `initialPage`'s browser context. Must be called once at the
 * start of a run, before any step executes — it registers the context's "page" listener
 * immediately so a popup that fires before any step asks for it is still queued, not missed
 * (the race this replaces: waiting for a "page" event only once the step that needs it runs).
 */
function createTabRegistry(initialPage) {
  const context = initialPage.context();
  const pages = new Map([["tab_0", initialPage]]);
  // Every page the registry has ever bound to a tab id — a drained popup, a waitForEvent
  // result, or a page the registry created itself via context.newPage(). Pages land in
  // pendingPages the instant Playwright reports them (a newPage() call fires the same "page"
  // event as a real popup), so without this set a page already bound to one tab id could be
  // handed out again as a different tab — see the pendingPages drain below.
  const bound = new Set([initialPage]);
  const pendingPages = [];
  context.on("page", (page) => { pendingPages.push(page); });
  return { context, pages, pendingPages, bound };
}

/**
 * True only when a step names a real (non-tab_0) tab. Steps compiled before multi-tab support,
 * and every step recorded on the initial tab, carry no `tab` at all.
 */
function stepNamesTab(step) {
  const tab = step && step.tab;
  return !!(tab && typeof tab === "object" && tab.id && tab.id !== "tab_0");
}

// tab_open/tab_switch/popup are the only step types whose handler in run.js is a genuine no-op
// (see NOOP marker handlers there) — every other step type resolves its own target unconditionally.
const TAB_MARKER_TYPES = new Set(["tab_open", "tab_switch", "popup"]);

/**
 * True when a step is a tab-boundary marker that carries no `tab` block at all — a recorder
 * mis-stamp (e.g. a popup event attributed to whichever page happened to be active when the
 * event drained, not the page that actually fired it) rather than a real instruction to go to
 * tab_0. The caller should keep executing on whatever page it was already on rather than
 * resolving this step through the normal (tab_0) path.
 */
function stepInheritsPage(step) {
  const tab = step && step.tab;
  const namesAnyTab = !!(tab && typeof tab === "object" && tab.id);
  return !!(step && TAB_MARKER_TYPES.has(step.type) && !namesAnyTab);
}

/**
 * Resolve the live Page a step should run on. Never falls back to the currently-active page on
 * a miss — same rule as rootCandidates()/isFrameNotFound() in run.js for frame_chain: a
 * same-looking element on the wrong tab is worse than a clean, diagnosable failure. Throws an
 * Error with `.tabNotFound = true` when the step's tab cannot be resolved.
 */
async function resolveStepPage(registry, step, opts = {}) {
  if (!stepNamesTab(step)) return registry.pages.get("tab_0");

  const tabId = step.tab.id;
  // A user-opened tab (Ctrl+T) is created blank by this registry (below) and stays blank until
  // the compiler's own synthesized `navigate` step runs against it — nothing external is ever
  // going to navigate it on its own, so _settle must not wait for that to happen. A site-opened
  // tab (a real popup/target=_blank) is the opposite: the site's own click handler is expected
  // to navigate it a beat after creation, which is exactly the wait _settle performs.
  const awaitNavigation = step.tab.opened_by !== "user";

  const existing = registry.pages.get(tabId);
  if (existing) {
    try {
      if (!existing.isClosed()) return await _settle(existing, { ...opts, awaitNavigation });
    } catch (_) { /* fall through to re-resolve */ }
  }

  let page = null;
  if (step.tab.opened_by === "user") {
    // Ctrl+T (or similar) — nothing on the recorded page ever opens this tab, so the runtime
    // must create it itself. The recorded first action on this tab is a navigate, which then
    // runs normally against the fresh page. This itself fires the context's "page" event, so it
    // lands in pendingPages too — bind it before that queue is ever drained, or a later
    // opened_by="site" step could hand this same blank page back out as a different tab.
    page = await registry.context.newPage();
    registry.bound.add(page);
  } else {
    // opened_by === "site" (a link/window.open) or unset (older compiles) — something on the
    // page is expected to open it. Drain the queue first (it may have fired before this step
    // ran), skipping any page already bound to a tab id or already closed — a bare shift() would
    // otherwise hand back a page this registry has already committed elsewhere (e.g. the blank
    // page created above for a user-opened tab).
    while (registry.pendingPages.length) {
      const candidate = registry.pendingPages.shift();
      if (registry.bound.has(candidate)) continue;
      let closed = false;
      try { closed = candidate.isClosed(); } catch (_) { closed = true; }
      if (closed) continue;
      page = candidate;
      break;
    }
    if (!page) {
      try {
        page = await registry.context.waitForEvent("page", {
          timeout: tabOpenTimeoutMs(),
          predicate: (p) => !registry.bound.has(p),
        });
      } catch (_) {
        page = null;
      }
    }
    if (page) registry.bound.add(page);
  }

  if (!page) {
    const err = new Error(`Tab not found: step recorded on ${tabId} (opened_by=${step.tab.opened_by || "unknown"})`);
    err.tabNotFound = true;
    throw err;
  }

  registry.pages.set(tabId, page);
  return await _settle(page, { ...opts, awaitNavigation });
}

async function _settle(page, opts) {
  const timeout = Number(opts.loadTimeoutMs) || DEFAULT_SETTLE_TIMEOUT_MS;
  // A target=_blank popup is created at about:blank and navigates to its real destination a
  // beat later — waitForLoadState("domcontentloaded") resolves instantly against that blank
  // page today, so the caller's first step on it can fire before anything has actually loaded.
  // Best-effort: a tab that genuinely stays blank still proceeds rather than hard-failing here.
  // Gated on opts.awaitNavigation (default true): a user-opened (Ctrl+T) tab is deliberately
  // blank until the compiler's own synthesized `navigate` step runs against it — nothing else
  // is ever going to navigate it — so waiting here would just burn the full timeout for no
  // reason, once for the tab_open step and again for the navigate step that follows it.
  if (opts.awaitNavigation !== false) {
    try {
      if (!page.url() || page.url() === "about:blank") {
        await page.waitForURL((u) => !!u && String(u) !== "about:blank", { timeout }).catch(() => {});
      }
    } catch (_) { /* page.url() itself can throw on a torn-down page — proceed to the load wait */ }
  }
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
  if (opts.watch) {
    await page.bringToFront().catch(() => {});
  }
  return page;
}

/**
 * Close every page in `openedTabs` other than anything in `keep` (a single Page or a Set).
 * EXEC-14: a multi-tab run can open pages beyond the one server.js already tracks as `page` —
 * in the headless/cached-context path (watch: false, the default), nothing else ever closes
 * them, so left untracked they leak for the life of the cached browser (browser.js's
 * per-company idle cache). Errors closing any one page (already closed, context torn down)
 * are swallowed — this is best-effort cleanup, not something that should fail an already
 * completed run.
 */
async function closeExtraTabs(openedTabs, keep) {
  const skip = keep instanceof Set ? keep : new Set(keep ? [keep] : []);
  for (const pg of openedTabs) {
    if (skip.has(pg)) continue;
    try {
      if (!pg.isClosed()) await pg.close();
    } catch (_) { /* best-effort */ }
  }
}

module.exports = { createTabRegistry, resolveStepPage, stepNamesTab, stepInheritsPage, tabOpenTimeoutMs, closeExtraTabs };
