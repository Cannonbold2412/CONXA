// EXEC-45: a login's completion is detected by polling the pages of the session's context. In a
// launched session that context is private to the run, so ANY page reaching the app means "signed
// in" (this is what makes a login finished in another tab work). In Conxa Execute the context is
// Electron's single shared one — every run's views live in it — so polling all of it would take
// ANOTHER run's already-signed-in page for this login succeeding and capture the wrong session.
// A host-owned login therefore only ever considers pages it created (the login tab and pages that
// tab opened).
const test   = require("node:test");
const assert = require("node:assert");

process.env.CONXA_LOGIN_POLL_MS = "20";
process.env.CONXA_LOGIN_SETTLE_MS = "5";
process.env.CONXA_LOGIN_CLOSE_GRACE_MS = "50";
process.env.CONXA_LOGIN_BACKUP_AGREE_MS = "5";
const { _waitForInteractiveAuth } = require("../../app/browser");
// The judge (see login_signals.js's ladder) opens a throwaway probe tab — via
// context.newPage() for a launched session, or hostBrowser.openTab() for a host-owned one — and
// re-requests the login entry URL to see whether it still shows a login form. Faked here the same
// way the site itself would behave: signed in, so the probe lands straight on the app.
const hostBrowser = require("../../app/host_browser");

const page = (url) => ({ url: () => url, isClosed: () => false, close: async () => {}, opener: async () => null,
  goto: async (u) => { page.lastGoto = u; }, evaluate: async () => false });
const probePage = () => page("https://app.test/home");
hostBrowser.openTab = async () => ({ page: probePage(), tabId: "probe" });
hostBrowser.release = async () => {};

const STATE = { cookies: [{ name: "sid", value: "1", domain: "app.test", path: "/" }], origins: [] };
function session({ hostOwned, pages }) {
  return {
    hostOwned, hostRunId: hostOwned ? "r_1" : undefined,
    browser: { on() {}, off() {} },
    context: {
      pages: () => pages, on() {}, off() {}, storageState: async () => STATE,
      cookies: async () => STATE.cookies, newPage: async () => probePage(),
    },
  };
}
const opts = { protectedUrl: "https://app.test/home", waitMs: 400, hosts: ["app.test"] };

test("host-owned: another run's page on the same app does not complete THIS login", async () => {
  const loginPage = page("https://app.test/login");
  const foreign = page("https://app.test/home"); // a sibling Execute run, already signed in
  const s = session({ hostOwned: true, pages: [loginPage, foreign] });
  await assert.rejects(
    _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" }, opts),
    (e) => e.loginTimedOut === true,
  );
});

test("host-owned: the login tab itself reaching the app does complete it", async () => {
  const loginPage = page("https://app.test/home");
  const s = session({ hostOwned: true, pages: [loginPage, page("https://other.test/")] });
  const r = await _waitForInteractiveAuth("ws__app", { session: s, loginPage, hostTabId: "t1" }, opts);
  assert.ok(r.state.cookies.some((c) => c.name === "sid"));
});

test("launched session: a DIFFERENT tab of the private context reaching the app completes it", async () => {
  const loginPage = page("https://app.test/login");
  const elsewhere = page("https://app.test/home");
  const s = session({ hostOwned: false, pages: [loginPage, elsewhere] });
  const r = await _waitForInteractiveAuth("ws__app", { session: s, loginPage }, opts);
  assert.ok(r.state.cookies.some((c) => c.name === "sid"));
});
