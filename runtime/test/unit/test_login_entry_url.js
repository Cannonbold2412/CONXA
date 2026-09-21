// AUTH-5: an app whose sign-in lives on a different host than the app itself (Google Drive:
// accounts.google.com -> drive.google.com) must open its login tab AT THE APP, so the provider's own
// return-to parameter sends the user back where _reachedProtectedUrl is watching. Same-host apps
// (GitHub) keep login_url — their success host serves a public logged-out page.
const test   = require("node:test");
const assert = require("node:assert");

const { _loginEntryUrl, _successPrefix, _reachedProtectedUrl, _probeInSession } = require("../../app/browser");

const GITHUB = { login_url: "https://github.com/login", success_url: "https://github.com/{}" };
const DRIVE  = { login_url: "https://accounts.google.com", success_url: "https://drive.google.com/{}" };

test("same-host app keeps login_url", () => {
  assert.strictEqual(_loginEntryUrl(GITHUB), "https://github.com/login");
});

test("cross-host app opens at the app, not the identity provider", () => {
  assert.strictEqual(_loginEntryUrl(DRIVE), "https://drive.google.com/");
});

test("no success_url falls back to login_url", () => {
  assert.strictEqual(_loginEntryUrl({ login_url: "https://a.test/login", success_url: "" }), "https://a.test/login");
});

test("_successPrefix strips the {} wildcard and tolerates a missing success_url", () => {
  assert.strictEqual(_successPrefix(DRIVE), "https://drive.google.com/");
  assert.strictEqual(_successPrefix({ success_url: "https://a.test/home" }), "https://a.test/home");
  assert.strictEqual(_successPrefix({}), "");
});

test("_reachedProtectedUrl: a bare-origin {} pattern is host-only, as before", () => {
  assert.strictEqual(_reachedProtectedUrl("https://drive.google.com/drive/my-drive", DRIVE.success_url), true);
  assert.strictEqual(_reachedProtectedUrl("https://accounts.google.com/v3/signin", DRIVE.success_url), false);
  assert.strictEqual(_reachedProtectedUrl("https://github.com/login", GITHUB.success_url), false);
});

test("_reachedProtectedUrl: {} after a path prefix requires that prefix", () => {
  const pattern = "https://vercel.com/dashboard/{}";
  assert.strictEqual(_reachedProtectedUrl("https://vercel.com/dashboard/team", pattern), true);
  assert.strictEqual(_reachedProtectedUrl("https://vercel.com/pricing", pattern), false);
  assert.strictEqual(_reachedProtectedUrl("https://vercel.com/login", pattern), false);
});

test("_reachedProtectedUrl: a pattern with no {} is hostname-only, as before", () => {
  assert.strictEqual(_reachedProtectedUrl("https://app.test/anything", "https://app.test/dashboard"), true);
  assert.strictEqual(_reachedProtectedUrl("https://app.test/login", "https://app.test/dashboard"), false);
});

test("_probeInSession navigates to the success prefix, never a literal {}", async () => {
  const visited = [];
  const page = {
    goto: async (u) => { visited.push(u); },
    url: () => visited[visited.length - 1] || "about:blank",
    isClosed: () => false,
    close: async () => {},
  };
  const session = { hostOwned: false, context: { newPage: async () => page } };
  const entry = { key: "ws__drive", navUrl: _successPrefix(DRIVE), protectedUrl: DRIVE.success_url, label: "Drive" };
  const outcomes = await _probeInSession(session, [entry]);
  assert.deepStrictEqual(visited, ["https://drive.google.com/"]);
  assert.strictEqual(outcomes.get("ws__drive"), true);
});
