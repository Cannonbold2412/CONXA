// One Chromium per execution session (P0 unified auth): pre-flight probes and sign-in tabs live
// INSIDE the session's own context, so the browser a login lands in is the browser the workflow runs
// in. Real headless Chromium against two local fake apps on different hostnames (localhost vs
// 127.0.0.1) — `chromium.launch` is counted, so "exactly one instance" is asserted, not assumed.
// The human is simulated by navigating a login tab to the app's /auth endpoint (sets the session
// cookie, redirects to /home).
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

let pass = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

// browser.js / browser_session.js read env at module load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-session-auth-"));
process.env.CONXA_DATA_DIR = tmp;
process.env.CONXA_DIR = tmp;
process.env.CONXA_MAX_CONCURRENT_RUNS = "2";
process.env.CONXA_LOGIN_POLL_MS = "100";
process.env.CONXA_LOGIN_SETTLE_MS = "50";
process.env.CONXA_LOGIN_CLOSE_GRACE_MS = "300";

const { chromium } = require("playwright");
const realLaunch = chromium.launch.bind(chromium);
let launched = [];
// The runtime asks for a HEADED session (a human signs in); CI has no display, so run it headless.
chromium.launch = async (opts) => { const b = await realLaunch({ ...opts, headless: true }); launched.push(b); return b; };

const browser = require("../../app/browser");
const registry = require("../../app/browser_session");
const { getCachedBrowser, releaseCachedBrowser, awaitAuthPending, describeAuthWait } = browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(50); }
  throw new Error(`timed out waiting for ${what}`);
}

function startApp() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const authed = /(?:^|;\s*)sid=1/.test(req.headers.cookie || "");
      if (req.url.startsWith("/auth")) { res.writeHead(302, { "Set-Cookie": "sid=1; Path=/", Location: "/home" }); return res.end(); }
      if (req.url.startsWith("/home")) {
        if (authed) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<body>home</body>"); }
        res.writeHead(302, { Location: "/login" }); return res.end();
      }
      // The judge (browser.js::_judgeLogin) re-asks the login page in the background and expects a
      // signed-in visitor to be bounced off it, exactly like a real login page — a plain-password
      // app's own success_url and login_url are often the same host, so this is what tells the judge
      // apart "still logging in" from "already done" when it re-requests login_url.
      if (req.url.startsWith("/login") && authed) { res.writeHead(302, { Location: "/home" }); return res.end(); }
      res.writeHead(200, { "content-type": "text/html" }); res.end("<body>login</body>");
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

let A, B, A_ORIGIN, B_ORIGIN;
const SESSIONS = () => path.join(tmp, "cache", "sessions");

// A fresh workspace per case: own pack.json (group with apps a + b), own session files.
function workspace(id) {
  const ws = `ws_${id}`;
  const pack = {
    groups: [{
      id: "g1", name: "Sales",
      apps: [
        { id: "a", name: "AppA", login_url: `${A_ORIGIN}/login`, success_url: `${A_ORIGIN}/home` },
        { id: "b", name: "AppB", login_url: `${B_ORIGIN}/login`, success_url: `${B_ORIGIN}/home` },
      ],
    }],
  };
  fs.mkdirSync(path.join(tmp, "skill-packs", ws), { recursive: true });
  fs.writeFileSync(path.join(tmp, "skill-packs", ws, "pack.json"), JSON.stringify(pack));
  return ws;
}
// A previously-captured, still-valid session for one app, with a fresh validation stamp (so
// pre-flight trusts it without probing — the "existing valid session" case).
function storeValidSession(ws, appId, domain) {
  fs.mkdirSync(SESSIONS(), { recursive: true });
  const file = path.join(SESSIONS(), `${ws}__${appId}_raw_state.json`);
  fs.writeFileSync(file, JSON.stringify({
    cookies: [{ name: "sid", value: "1", domain, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
    origins: [],
  }));
  browser._writeValidationCache(`${ws}__${appId}`, file);
}
const opts = (ws, extra = {}) => ({ headless: false, groupId: "g1", requiredAppIds: ["a", "b"], runId: `run_${ws}`, ...extra });
const loginTabs = (ctx, origin) => ctx.pages().filter((p) => !p.isClosed() && p.url().startsWith(`${origin}/login`));
const readFile = (ws, appId) => JSON.parse(fs.readFileSync(path.join(SESSIONS(), `${ws}__${appId}_raw_state.json`), "utf8"));

async function reset() {
  await registry.closeAll();
  for (const b of launched) await b.close().catch(() => {});
  launched = [];
}

async function run() {
  A = await startApp(); B = await startApp();
  A_ORIGIN = `http://localhost:${A.port}`;
  B_ORIGIN = `http://127.0.0.1:${B.port}`;

  console.log("session auth pre-flight:");

  await check("every required app already signed in -> ONE Chromium, no login tab, run context is signed in to both", async () => {
    await reset();
    const ws = workspace("all_valid");
    storeValidSession(ws, "a", "localhost");
    storeValidSession(ws, "b", "127.0.0.1");
    const r = await getCachedBrowser(ws, null, opts(ws));
    assert.ok(!r.authPending, "nothing to sign in to");
    assert.strictEqual(launched.length, 1);
    const page = r.page || await r.context.newPage();
    await page.goto(`${A_ORIGIN}/home`); assert.strictEqual(await page.textContent("body"), "home");
    await page.goto(`${B_ORIGIN}/home`); assert.strictEqual(await page.textContent("body"), "home");
    releaseCachedBrowser(r.leaseKey);
  });

  await check("one app valid, one expired -> the valid one is untouched, exactly one login tab opens, all in ONE Chromium", async () => {
    await reset();
    const ws = workspace("partial");
    storeValidSession(ws, "a", "localhost");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    assert.strictEqual(r1.authPending, true);
    assert.deepStrictEqual(r1.apps.map((x) => x.id), ["b"], "only the missing app is asked for");
    assert.match(r1.message, /AppB/);
    assert.doesNotMatch(r1.message, /AppA/);
    assert.strictEqual(launched.length, 1, "probe + login must share one instance");
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 1, "AppB's login tab");
    assert.strictEqual(loginTabs(ctx, A_ORIGIN).length, 0, "AppA is valid — no tab for it");

    await loginTabs(ctx, B_ORIGIN)[0].goto(`${B_ORIGIN}/auth`); // the human signs in
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    await waitFor(() => ctx.pages().every((p) => !p.url().startsWith(`${B_ORIGIN}/`)) || ctx.pages().length === 0, "login tab auto-closed");

    // Same call again: the SAME warm, already-authenticated browser — no relaunch, no re-login.
    const r2 = await getCachedBrowser(ws, null, opts(ws));
    assert.ok(!r2.authPending);
    assert.strictEqual(launched.length, 1, "the run must reuse the instance the login happened in");
    assert.strictEqual(r2.browser, launched[0]);
    const page = r2.page || await r2.context.newPage();
    await page.goto(`${B_ORIGIN}/home`); assert.strictEqual(await page.textContent("body"), "home");
    await page.goto(`${A_ORIGIN}/home`); assert.strictEqual(await page.textContent("body"), "home", "the untouched app is still signed in");

    // What was saved for next time: AppB's own slice only — never AppA's cookies.
    const savedB = readFile(ws, "b");
    assert.ok(savedB.cookies.some((c) => c.name === "sid" && c.domain === "127.0.0.1"));
    assert.ok(!savedB.cookies.some((c) => c.domain === "localhost"), "a sibling app's cookies must not bleed into AppB's file");
    releaseCachedBrowser(r2.leaseKey);
  });

  await check("cold start (nothing stored) -> one login tab per app in the same Chromium; each closes on its own success", async () => {
    await reset();
    const ws = workspace("cold");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    assert.strictEqual(r1.authPending, true);
    assert.deepStrictEqual(r1.apps.map((x) => x.id).sort(), ["a", "b"]);
    assert.match(r1.message, /AppA/); assert.match(r1.message, /AppB/);
    assert.strictEqual(launched.length, 1);
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx, A_ORIGIN).length === 1 && loginTabs(ctx, B_ORIGIN).length === 1, "both login tabs");

    await loginTabs(ctx, A_ORIGIN)[0].goto(`${A_ORIGIN}/auth`);
    await waitFor(() => loginTabs(ctx, A_ORIGIN).length === 0 && !ctx.pages().some((p) => p.url().startsWith(`${A_ORIGIN}/home`)), "AppA's tab to close");
    assert.strictEqual(loginTabs(ctx, B_ORIGIN).length, 1, "AppB is still waiting — its tab must stay");

    await loginTabs(ctx, B_ORIGIN)[0].goto(`${B_ORIGIN}/auth`);
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured", "captured"]);

    // AUTH-7: an ordinary, ladder-decided capture (not the human override) must record WHICH
    // rung decided it — never "human_override", which only fires from the file-drop signal.
    const decisionLines = fs.readFileSync(path.join(tmp, "logs", "login_signals.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const decisionsForThisWorkspace = decisionLines.filter((d) => d.key.startsWith(`${ws}__`));
    assert.strictEqual(decisionsForThisWorkspace.length, 2, "one decision line per app");
    for (const d of decisionsForThisWorkspace) {
      assert.ok(["judge_yes", "lookouts_agreed"].includes(d.decision), `expected a real ladder reason, got ${d.decision}`);
    }

    const r2 = await getCachedBrowser(ws, null, opts(ws));
    assert.ok(!r2.authPending);
    assert.strictEqual(launched.length, 1);
    releaseCachedBrowser(r2.leaseKey);
  });

  await check("sign-in finished in a DIFFERENT tab than the login tab is still detected", async () => {
    await reset();
    const ws = workspace("othertab");
    storeValidSession(ws, "a", "localhost");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 1, "AppB's login tab");
    const elsewhere = await ctx.newPage(); // e.g. the user opened the app in a new tab themselves
    await elsewhere.goto(`${B_ORIGIN}/auth`);
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 0, "the login tab to close");
  });

  await check("user closes the login tab (twice) -> stops waiting, names the app, session is dropped, retry starts clean", async () => {
    await reset();
    const ws = workspace("closedtab");
    storeValidSession(ws, "a", "localhost");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 1, "first login tab");
    await loginTabs(ctx, B_ORIGIN)[0].close();
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 1, "the one-shot reopened login tab"); // beginInteractiveAuth's single retry
    await loginTabs(ctx, B_ORIGIN)[0].close();
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.strictEqual(waited[0].outcome, "abandoned");
    assert.match(describeAuthWait(waited), /AppB/);
    assert.match(describeAuthWait(waited), /closed before sign-in finished/);
    await waitFor(() => registry.size() === 0, "the half-signed-in session to be dropped");

    const retry = await getCachedBrowser(ws, null, opts(ws)); // "allow the user to retry"
    assert.strictEqual(retry.authPending, true);
    assert.deepStrictEqual(retry.apps.map((x) => x.id), ["b"]);
    assert.ok(["opened", "reopened"].includes(retry.apps[0].reason), "a fresh login, not 'already open'");
  });

  await check("user closes Chromium itself -> the wait ends promptly instead of hanging", async () => {
    await reset();
    const ws = workspace("closedbrowser");
    storeValidSession(ws, "a", "localhost");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx, B_ORIGIN).length === 1, "login tab");
    await launched[0].close();
    const t0 = Date.now();
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.strictEqual(waited[0].outcome, "abandoned");
    assert.ok(Date.now() - t0 < 10000, "must not run out the 10-minute deadline");
    assert.strictEqual(registry.size(), 0);
  });

  await check("a stored session that has expired (server no longer accepts it) is re-asked, not trusted", async () => {
    await reset();
    const ws = workspace("expired");
    // A cookie the server rejects: file exists, no fresh TTL stamp -> must be probed, fail, and re-login.
    fs.mkdirSync(SESSIONS(), { recursive: true });
    fs.writeFileSync(path.join(SESSIONS(), `${ws}__a_raw_state.json`), JSON.stringify({
      cookies: [{ name: "sid", value: "0", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [],
    }));
    storeValidSession(ws, "b", "127.0.0.1");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    assert.strictEqual(r1.authPending, true);
    assert.deepStrictEqual(r1.apps.map((x) => x.id), ["a"]);
    assert.strictEqual(launched.length, 1);
  });

  console.log("\nsession cap:");

  await check("unattended run (noPrompt) with an app not signed in -> names it, opens NO login tab, keeps no session", async () => {
    await reset();
    const ws = workspace("noprompt");
    storeValidSession(ws, "a", "localhost"); // AppB has no session at all
    const r = await getCachedBrowser(ws, null, opts(ws, { headless: true, noPrompt: true }));
    assert.strictEqual(r.authPending, false, "nothing is left waiting for a person");
    assert.deepStrictEqual(r.expiredApps, ["AppB"]);
    assert.match(r.message, /AppB/);
    assert.doesNotMatch(r.message, /AppA/);
    assert.ok(!r.leaseKey, "no browser is handed out");
    assert.strictEqual(registry.size(), 0, "the session is closed, not parked");
    assert.ok(!browser._pendingAuth.has(`${ws}__b`), "no sign-in window was ever opened for AppB");
    // The same run WITH a person there still opens the sign-in tab (interactive behaviour unchanged).
    const r2 = await getCachedBrowser(ws, null, opts(ws));
    assert.strictEqual(r2.authPending, true);
    assert.strictEqual(r2.expiredApps, undefined);
  });

  await check("two apps hold the same SSO cookie -> the NEWER session file wins the merge, whatever the group order", async () => {
    await reset();
    const ws = workspace("sso_newest");
    const sso = (value) => ({ cookies: [{ name: "sso", value, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] });
    const write = (appId, value, ageSec) => {
      fs.mkdirSync(SESSIONS(), { recursive: true });
      const file = path.join(SESSIONS(), `${ws}__${appId}_raw_state.json`);
      fs.writeFileSync(file, JSON.stringify(sso(value)));
      const t = new Date(Date.now() - ageSec * 1000); fs.utimesSync(file, t, t);
      browser._writeValidationCache(`${ws}__${appId}`, file);
    };
    write("a", "stale", 3600); // first in group order, but written an hour ago
    write("b", "fresh", 0);
    const r = await getCachedBrowser(ws, null, opts(ws));
    const cookie = (await r.context.cookies(A_ORIGIN)).find((c) => c.name === "sso");
    assert.strictEqual(cookie && cookie.value, "fresh");
    releaseCachedBrowser(r.leaseKey);
  });

  await check("all browser sessions in use -> a clear refusal, and no extra Chromium is launched", async () => {
    await reset();
    const ws1 = workspace("cap1"), ws2 = workspace("cap2"), ws3 = workspace("cap3");
    for (const ws of [ws1, ws2, ws3]) { storeValidSession(ws, "a", "localhost"); storeValidSession(ws, "b", "127.0.0.1"); }
    const r1 = await getCachedBrowser(ws1, null, opts(ws1));
    const r2 = await getCachedBrowser(ws2, null, opts(ws2));
    const before = launched.length;
    const r3 = await getCachedBrowser(ws3, null, opts(ws3));
    assert.strictEqual(r3.refused, true);
    assert.match(r3.message, /all 2 browser sessions are currently in use/i);
    assert.strictEqual(launched.length, before);
    releaseCachedBrowser(r1.leaseKey); releaseCachedBrowser(r2.leaseKey);
  });

  await reset();
  A.srv.close(); B.srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  process.exit(process.exitCode || 0);
}

run();
