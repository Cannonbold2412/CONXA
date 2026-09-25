// EXEC-45: a login's completion is decided by the judge re-probing the login entry URL in its own
// throwaway tab (context.newPage() for a launched session, hostBrowser.openTab() for a host-owned
// one) — never by scanning the context's EXISTING pages for one that "arrived" somewhere. That is
// what makes a login finished in another tab work (the judge's probe doesn't care which tab the
// user actually used) while still keeping a host-owned session (Conxa Execute's single shared
// context, every run's views in it) safe from crediting ANOTHER run's already-signed-in page —
// nothing here ever reads a foreign page's URL at all, so there is nothing for one to corrupt.
const test   = require("node:test");
const assert = require("node:assert");

process.env.CONXA_LOGIN_POLL_MS = "20";
process.env.CONXA_LOGIN_SETTLE_MS = "5";
process.env.CONXA_LOGIN_CLOSE_GRACE_MS = "50";
process.env.CONXA_LOGIN_BACKUP_AGREE_MS = "5";
const { _waitForInteractiveAuth } = require("../../app/browser");
const pageScripts = require("../../app/page_scripts");
const hostBrowser = require("../../app/host_browser");

// A page whose password-box answer can change across calls (simulating the box disappearing once
// sign-in actually happens) and whose pause-sign answer is always "no". `evaluate` branches on
// script identity the same way evalOn's real callers pass one script per probe.
function page(url, { pwSequence = [false], landUrl } = {}) {
  let pwCalls = 0;
  return {
    url: () => (landUrl && pwCalls >= pwSequence.length ? landUrl : url), isClosed: () => false, close: async () => {}, opener: async () => null,
    goto: async () => {},
    evaluate: async (script) => {
      if (script === pageScripts.passwordBoxProbe) {
        const v = pwSequence[Math.min(pwCalls, pwSequence.length - 1)];
        pwCalls++;
        return v;
      }
      if (script === pageScripts.pauseSignProbe) return { otpLikeInputCount: 0, hasOneTimeCodeAutocomplete: false };
      if (script === pageScripts.storageKeyCounts) return {};
      return false;
    },
  };
}

const STATE = { cookies: [{ name: "sid", value: "1", domain: "app.test", path: "/" }], origins: [] };
function session({ hostOwned, pages }) {
  return {
    hostOwned, hostRunId: hostOwned ? "r_1" : undefined,
    browser: { on() {}, off() {} },
    context: {
      pages: () => pages, on() {}, off() {}, storageState: async () => STATE,
      cookies: async () => STATE.cookies, newPage: async () => page("https://app.test/probe-unused"),
    },
  };
}
const beforeSnapshot = { url: "https://app.test/login", hasPasswordBox: true };
const opts = { waitMs: 400, hosts: ["app.test"], entryUrl: "https://app.test/login", beforeSnapshot };

test("host-owned: another run's already-signed-in page does not complete THIS login", async () => {
  // The judge's own probe keeps reporting login-shaped (OUR sign-in never actually progresses),
  // even though a foreign, already-signed-in page sits right there in the shared context.
  hostBrowser.openTab = async () => ({ page: page("https://app.test/login", { pwSequence: [true] }), tabId: "probe" });
  hostBrowser.release = async () => {};
  const loginPage = page("https://app.test/login", { pwSequence: [true] }); // password box never goes away
  const foreign = page("https://app.test/home"); // a sibling Execute run, already signed in
  const s = session({ hostOwned: true, pages: [loginPage, foreign] });
  await assert.rejects(
    _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" }, opts),
    (e) => e.loginTimedOut === true,
  );
});

test("host-owned: the login tab's own password box going away completes it", async () => {
  // The judge's probe reflects OUR sign-in actually landing on the app: no password box, a
  // different address than the login entry.
  hostBrowser.openTab = async () => ({ page: page("https://app.test/home", { pwSequence: [false] }), tabId: "probe" });
  hostBrowser.release = async () => {};
  const loginPage = page("https://app.test/login", { pwSequence: [true, false], landUrl: "https://app.test/home" }); // box present, then gone
  const s = session({ hostOwned: true, pages: [loginPage] });
  const r = await _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" }, opts);
  assert.ok(r.state.cookies.some((c) => c.name === "sid"));
});

// AUTH-19, the real Google report: email -> password -> "check your phone". On the phone screen the
// password box is gone and the email step already wrote new cookies — two lookouts agree — but the
// person is still signing in. Must keep waiting (here: until the timeout), never save half-done.
test("waiting on a second-factor screen is never read as signed in", async () => {
  hostBrowser.openTab = async () => ({ page: page("https://app.test/login", { pwSequence: [true] }), tabId: "probe" });
  hostBrowser.release = async () => {};
  const steps = [
    ["https://accounts.test/v3/signin/identifier", false],
    ["https://accounts.test/v3/signin/challenge/pwd", true],
    ["https://accounts.test/v3/signin/challenge/dp", false], // held: waiting for the phone
  ];
  let calls = 0;
  const at = () => steps[Math.min(Math.floor(calls / 2), steps.length - 1)];
  const loginPage = {
    url: () => at()[0], isClosed: () => false, close: async () => {}, opener: async () => null, goto: async () => {},
    evaluate: async (script) => {
      if (script === pageScripts.passwordBoxProbe) { const v = at()[1]; calls++; return v; }
      if (script === pageScripts.pauseSignProbe) return { otpLikeInputCount: 0, hasOneTimeCodeAutocomplete: false };
      return {};
    },
  };
  const s = session({ hostOwned: true, pages: [loginPage] });
  s.context.cookies = async () => (calls > 1 ? [{ name: "sid" }, { name: "flow" }] : [{ name: "sid" }]);
  await assert.rejects(
    _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" },
      { ...opts, entryUrl: "https://accounts.test/v3/signin/identifier" }),
    (e) => e.loginTimedOut === true,
  );
});

// AUTH-20: in Conxa Execute, context.storageState() throws once any visited origin's page has closed
// (it needs a hidden new page; Electron's CDP can't make one). The sign-in must still be saved.
test("host-owned: the sign-in is captured even though Execute's browser can't run storageState()", async () => {
  hostBrowser.openTab = async () => ({ page: page("https://app.test/home", { pwSequence: [false] }), tabId: "probe" });
  hostBrowser.release = async () => {};
  const loginPage = page("https://app.test/login", { pwSequence: [true, false], landUrl: "https://app.test/home" });
  const s = session({ hostOwned: true, pages: [loginPage] });
  s.context.storageState = async () => { throw new Error("Protocol error (Target.createTarget): Not supported"); };
  const r = await _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" }, opts);
  assert.ok(r.state.cookies.some((c) => c.name === "sid"));
});

test("launched session: the login tab's own password box going away completes it", async () => {
  hostBrowser.openTab = async () => ({ page: page("https://app.test/home", { pwSequence: [false] }), tabId: "probe" });
  hostBrowser.release = async () => {};
  const loginPage = page("https://app.test/login", { pwSequence: [true, false], landUrl: "https://app.test/home" });
  const s = session({ hostOwned: false, pages: [loginPage] });
  s.context.newPage = async () => page("https://app.test/home", { pwSequence: [false] });
  const r = await _waitForInteractiveAuth("ws__app", { session: s, loginPage }, opts);
  assert.ok(r.state.cookies.some((c) => c.name === "sid"));
});
