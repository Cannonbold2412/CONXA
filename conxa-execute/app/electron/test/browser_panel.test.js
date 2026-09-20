"use strict";
// browser_panel.js bookkeeping: per-tab close (a finished login must not take its sibling
// login views down), last-tab-out ending the run, and the address-bar navigate mapping.
// `electron` is stubbed — these are pure bookkeeping assertions, no real window needed.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("module");

const cleared = [];
class FakeWebContents {
  constructor() {
    this.url = "";
    this.calls = [];
    this.handlers = {};
    this.navigationHistory = {
      canGoBack: () => true,
      canGoForward: () => false,
      goBack: () => this.calls.push("back"),
      goForward: () => this.calls.push("forward"),
    };
  }
  setWindowOpenHandler() {}
  on(ev, fn) { this.handlers[ev] = fn; }
  loadURL(u) { this.url = u; this.calls.push(`load:${u}`); return Promise.resolve(); }
  getURL() { return this.url; }
  getTitle() { return ""; }
  isDestroyed() { return false; }
  isLoading() { return false; }
  reload() { this.calls.push("reload"); }
  stop() { this.calls.push("stop"); }
  close() { this.closed = true; }
}
class FakeView {
  constructor() { this.webContents = new FakeWebContents(); this.bounds = null; }
  setBounds(b) { this.bounds = b; }
}

const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") {
    return {
      session: { fromPartition: (p) => ({ clearStorageData: async () => { cleared.push(p); } }) },
      WebContentsView: FakeView,
    };
  }
  return realLoad.call(this, request, ...rest);
};
const panel = require("../browser_panel");
Module._load = realLoad;

const removed = [];
const added = [];
const win = { contentView: { addChildView: (v) => added.push(v), removeChildView: (v) => removed.push(v) } };
let last = null; // last onTabsChanged emit: { runId, tabs }
panel.init(win, { onTabsChanged: (runId, tabs) => { last = { runId, tabs }; } });

test("newView returns the tabId and carries the label into the tab descriptor", () => {
  const { markerUrl, tabId } = panel.newView("run-a", { label: "GitHub" });
  assert.ok(markerUrl.includes(`conxa_tab=${tabId}`));
  assert.strictEqual(last.tabs.length, 1);
  assert.strictEqual(last.tabs[0].label, "GitHub");
  assert.strictEqual(last.tabs[0].url, "", "the internal marker URL must never reach the address bar");
});

test("closeTab on a two-tab run closes only that view and promotes the survivor", async () => {
  const github = panel.newTab("run-a", { label: "Google Drive" }); // second tab; becomes active
  assert.strictEqual(last.tabs.length, 2);
  const before = removed.length;
  await panel.closeTab("run-a", github.tabId);
  assert.strictEqual(removed.length, before + 1, "exactly one view removed");
  assert.strictEqual(last.tabs.length, 1);
  assert.strictEqual(last.tabs[0].label, "GitHub", "the sibling login survives");
  assert.strictEqual(last.tabs[0].active, true, "the survivor is promoted to active");
  assert.deepStrictEqual(cleared, [], "the run's partition must not be wiped while a tab remains");
});

test("closeTab on the last tab runs the full run-end cleanup", async () => {
  const only = last.tabs[0].id;
  await panel.closeTab("run-a", only);
  assert.deepStrictEqual(cleared, ["conxa-run-run-a"]);
  assert.deepStrictEqual(last.tabs, [], "an empty emit tells the renderer to drop the run");
});

test("navigate maps each action onto the right webContents call and normalises typed URLs", () => {
  const { tabId } = panel.newView("run-b");
  const wc = added[added.length - 1].webContents;
  wc.calls.length = 0;
  assert.strictEqual(panel.navigate("run-b", tabId, { action: "load", url: "example.com/x" }), true);
  assert.strictEqual(panel.navigate("run-b", tabId, { action: "load", url: "http://a.test" }), true);
  assert.strictEqual(panel.navigate("run-b", tabId, { action: "load", url: "   " }), false, "blank input is a no-op");
  for (const action of ["back", "forward", "reload", "stop"]) {
    assert.strictEqual(panel.navigate("run-b", tabId, { action }), true);
  }
  assert.deepStrictEqual(wc.calls, [
    "load:https://example.com/x", "load:http://a.test", "back", "forward", "reload", "stop",
  ]);
  assert.strictEqual(panel.navigate("run-b", tabId, { action: "bogus" }), false);
  assert.strictEqual(panel.navigate("run-b", "nope", { action: "reload" }), false, "unknown tab is a no-op");
});
