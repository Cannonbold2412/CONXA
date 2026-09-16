"use strict";
/**
 * browser_panel.js — Execute's side of the in-app browser panel (Stage 1: skill runs
 * only; logins and hand-over land in Stage 2 — see the plan this shipped under).
 *
 * Owns one WebContentsView per open tab, grouped by run. The runtime never creates
 * these directly — Electron's CDP target doesn't support Target.createTarget
 * (confirmed by the Stage-0 spike in this change), so every new page is created HERE,
 * in the process that actually owns the window, and the runtime is told where to find
 * it via a marker URL (see host_browser.js on the runtime side).
 *
 * Each run gets its own partition (`conxa-run-<runId>`, no `persist:` prefix — an
 * in-memory, per-run Electron session) so nothing about one run's cookies/storage can
 * leak into another's, and cleanup on run_end is just "stop referencing these views."
 */
const { session, WebContentsView } = require("electron");
const crypto = require("crypto");

// runId -> { partition, tabs: [{ id, view, markerUrl }], activeTabId }
const _runs = new Map();

let _win = null; // the BaseWindow/BrowserWindow whose contentView hosts every run's views
let _onTabsChanged = null; // (runId, tabs) => void — wired by main.js to push to the renderer

function init(win, { onTabsChanged } = {}) {
  _win = win;
  _onTabsChanged = onTabsChanged || null;
}

function _partitionFor(runId) {
  return `conxa-run-${runId}`;
}

function _markerUrl(runId, tabId) {
  return `about:blank?conxa_run=${encodeURIComponent(runId)}&conxa_tab=${encodeURIComponent(tabId)}`;
}

function _emitTabsChanged(runId) {
  const run = _runs.get(runId);
  if (!run || !_onTabsChanged) return;
  _onTabsChanged(runId, run.tabs.map((t) => ({ id: t.id, active: t.id === run.activeTabId })));
}

// Create a view, wire its popup handler, and register it as a tab on `run`.
function _createTab(run, runId) {
  const tabId = crypto.randomBytes(4).toString("hex");
  const view = new WebContentsView({
    webPreferences: { partition: run.partition, sandbox: true },
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    const newTabId = _createTab(run, runId);
    const newView = run.tabs.find((t) => t.id === newTabId).view;
    // A real popup navigates to its actual destination itself (target=_blank); loading it
    // here too would race that navigation, so only seed it when the handler actually carries
    // a concrete URL (Electron passes "" for some window.open() calls with no url arg).
    if (url && url !== "about:blank") newView.webContents.loadURL(url).catch(() => {});
    return { action: "deny" }; // denied at the OS level; we already created our own view for it
  });
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); // hidden until the renderer reports a rect
  view.webContents.loadURL(_markerUrl(runId, tabId)).catch(() => {});
  run.tabs.push({ id: tabId, view, markerUrl: _markerUrl(runId, tabId) });
  if (_win) _win.contentView.addChildView(view);
  return tabId;
}

// Control-channel op: "new_view" — first tab of a run. Returns the marker URL the
// runtime waits for (host_browser.js::_findPageByMarker).
function newView(runId) {
  let run = _runs.get(runId);
  if (!run) {
    run = { partition: _partitionFor(runId), tabs: [], activeTabId: null };
    _runs.set(runId, run);
  }
  const tabId = _createTab(run, runId);
  run.activeTabId = tabId;
  _emitTabsChanged(runId);
  return run.tabs.find((t) => t.id === tabId).markerUrl;
}

// Control-channel op: "new_tab" — a tab_open step's second (or later) tab in a run
// that already has a panel open.
function newTab(runId) {
  const run = _runs.get(runId);
  if (!run) throw new Error(`browser_panel: no run ${runId} to add a tab to`);
  const tabId = _createTab(run, runId);
  _emitTabsChanged(runId);
  return run.tabs.find((t) => t.id === tabId).markerUrl;
}

// Control-channel op: "run_end" — destroy every view for this run and wipe its
// partition's storage. Best-effort by design (see host_browser.js::release) — a run
// whose end notification never arrives just sits until the caller retries or the app
// restarts; nothing else depends on this firing promptly.
async function runEnd(runId) {
  const run = _runs.get(runId);
  if (!run) return;
  _runs.delete(runId);
  for (const t of run.tabs) {
    try { if (_win) _win.contentView.removeChildView(t.view); } catch (_) {}
    try { t.view.webContents.close(); } catch (_) {}
  }
  try { await session.fromPartition(run.partition).clearStorageData(); } catch (_) {}
  if (_onTabsChanged) _onTabsChanged(runId, []);
}

// Renderer reports where the (non-tab-strip) panel rect is, in window-local pixels.
// Only the active tab's view gets shown there; every other tab in every run is
// parked off-screen (0x0) rather than destroyed, so switching tabs is instant.
function setActiveBounds(runId, tabId, rect) {
  const run = _runs.get(runId);
  if (!run) return;
  for (const t of run.tabs) {
    t.view.setBounds(t.id === tabId ? rect : { x: 0, y: 0, width: 0, height: 0 });
  }
  run.activeTabId = tabId;
}

function listRuns() {
  return [..._runs.entries()].map(([runId, run]) => ({
    runId,
    tabs: run.tabs.map((t) => ({ id: t.id, active: t.id === run.activeTabId })),
  }));
}

module.exports = { init, newView, newTab, runEnd, setActiveBounds, listRuns };
