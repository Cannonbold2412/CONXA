"use strict";
/**
 * browser_panel.js — Execute's side of the in-app browser panel. Covers skill
 * runs, logins, and recovery hand-over (EXEC-41 stage 1 + stage 2).
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

// Create a view, wire its popup handler, and register it as a tab on `run`. The new tab
// becomes the active one and the renderer is told — this is the only place that happens, so a
// window.open() popup (an OAuth "Sign in with Google" leg) is shown exactly like a tab the
// runtime asked for, instead of sitting at 0x0 unannounced.
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
  run.activeTabId = tabId;
  _emitTabsChanged(runId);
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
  return run.tabs.find((t) => t.id === tabId).markerUrl;
}

// Control-channel op: "new_tab" — a tab_open step's second (or later) tab in a run
// that already has a panel open.
function newTab(runId) {
  const run = _runs.get(runId);
  if (!run) throw new Error(`browser_panel: no run ${runId} to add a tab to`);
  const tabId = _createTab(run, runId);
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
  try {
    await session.fromPartition(run.partition).clearStorageData();
  } catch (err) {
    // Not fatal to the run (already ended) but leaves this run's cookies/storage
    // sitting in the partition indefinitely — worth knowing about, not swallowing.
    console.error(`browser_panel: failed to clear storage for run ${runId}`, err);
  }
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

module.exports = { init, newView, newTab, runEnd, setActiveBounds };
