"use strict";
// browser_panel.js bookkeeping: per-tab close (a finished login must not take its sibling
// login views down), last-tab-out ending the run, and the address-bar navigate mapping.
// `electron` is stubbed — these are pure bookkeeping assertions, no real window needed.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");

// AUTH-6: loginDone writes a real file — point CONXA_DIR at a throwaway temp dir so this
// test never touches a developer's actual ~/.conxa.
const _tmpConxaDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-execute-browser-panel-test-"));
process.env.CONXA_DIR = _tmpConxaDir;

const cleared = [];
const downloadHandlers = {}; // partition -> will-download listener
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
      session: {
        fromPartition: (p) => ({
          clearStorageData: async () => { cleared.push(p); },
          on: (ev, fn) => { if (ev === "will-download") downloadHandlers[p] = fn; },
        }),
      },
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
let last = null; // last onTabsChanged emit: { runId, tabs, meta }
panel.init(win, { onTabsChanged: (runId, tabs, meta) => { last = { runId, tabs, meta }; } });

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

test("a login view asks the renderer to take focus; an ordinary run view does not", () => {
  panel.newView("run-plain", { label: "Run" });
  assert.strictEqual(last.meta, undefined, "a run must not steal the panel from whatever is on screen");
  panel.newView("run-login", { label: "GitHub", focus: true });
  assert.deepStrictEqual(last.meta, { focus: true }, "a login is blocking a run on the user — it comes forward");
});

test("a tab added to a run for a login (new_tab) can ask the renderer to take focus, like new_view", () => {
  panel.newView("run-tabfocus", { label: "first" });
  panel.newTab("run-tabfocus", { label: "Salesforce", focus: true });
  assert.deepStrictEqual(last.meta, { focus: true });
  panel.newTab("run-tabfocus", { label: "quiet" });
  assert.strictEqual(last.meta, undefined, "an ordinary tab (or a probe) must not steal focus");
});

test("a background probe tab (focus:false) never steals the shown tab; a plain new tab still does", () => {
  const { tabId: loginTab } = panel.newView("run-bg", { label: "Google", focus: true });
  const probe = panel.newTab("run-bg", { label: "verify", focus: false });
  assert.strictEqual(last.tabs.find((t) => t.id === loginTab).active, true, "the sign-in stays shown");
  assert.strictEqual(last.tabs.find((t) => t.id === probe.tabId).active, false);
  const plain = panel.newTab("run-bg", { label: "user tab" });
  assert.strictEqual(last.tabs.find((t) => t.id === plain.tabId).active, true);
});

test("AUTH-6: a tab created with loginKey is described as isLogin; one without is not", () => {
  const { tabId: loginTabId } = panel.newView("run-authkey", { label: "AppA", loginKey: "ws__app_a" });
  assert.strictEqual(last.tabs.find((t) => t.id === loginTabId).isLogin, true);
  const { tabId: probeTabId } = panel.newTab("run-authkey", { label: "verify", focus: false });
  assert.strictEqual(last.tabs.find((t) => t.id === probeTabId).isLogin, false, "a probe tab (no loginKey) is never shown a Done action");
});

test("EXEC-46: a run's download is saved silently (no Save As dialog) and handed to the runtime by URL", async () => {
  panel.newView("run-dl");
  const handler = downloadHandlers["conxa-run-run-dl"];
  assert.ok(handler, "every run partition gets a will-download handler");
  let savePath = null;
  let finish;
  const item = {
    getURL: () => "blob:https://github.com/abc",
    setSavePath: (p) => { savePath = p; },
    cancel: () => assert.fail("a live run's download must not be cancelled"),
    once: (ev, fn) => { if (ev === "done") finish = fn; },
  };
  handler({}, item);
  assert.ok(savePath, "a save path is set up front — that is what stops Electron opening its dialog");
  const dest = path.join(_tmpConxaDir, "runs", "r1", "Dotnet.gitignore");
  const saving = panel.saveDownload("run-dl", "blob:https://github.com/abc", dest, 2000);
  fs.writeFileSync(savePath, "## .NET");
  finish({}, "completed");
  assert.deepStrictEqual(await saving, { ok: true });
  assert.strictEqual(fs.readFileSync(dest, "utf8"), "## .NET");
  await assert.rejects(panel.saveDownload("run-dl", "blob:https://github.com/abc", dest, 200), /no download/,
    "a download is handed over once, never twice");
  await panel.runEnd("run-dl");
  assert.ok(!fs.existsSync(path.dirname(savePath)), "run end removes Execute's copy of the run's downloads");
});

test("AUTH-6: loginDone writes the file-drop signal for a real login tab, and no-ops otherwise", () => {
  const { tabId: loginTabId } = panel.newView("run-authdone", { label: "AppB", loginKey: "ws__app_b" });
  const result = panel.loginDone("run-authdone", loginTabId);
  assert.deepStrictEqual(result, { ok: true });
  const file = path.join(_tmpConxaDir, "login-done", "ws__app_b.cmd");
  assert.ok(fs.existsSync(file), "the signal file browser.js's _checkHumanOverride watches for must exist");

  const { tabId: probeTabId } = panel.newTab("run-authdone", { label: "verify" });
  assert.deepStrictEqual(panel.loginDone("run-authdone", probeTabId), { ok: false }, "never fires for a non-login tab");
  assert.deepStrictEqual(panel.loginDone("run-authdone", "nope"), { ok: false }, "an unknown tab id is a no-op, not a throw");
});
