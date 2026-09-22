// Multi-signal login-completion detection (see login_signals.js + docs/artifacts/login-desk.html):
// two of the artifact's own named scenarios, driven against real headless Chromium and a fake app
// that models the exact behavior each one depends on — the pure decision logic is already covered
// offline in test_login_signals.js; this proves the two Playwright-touching halves (the pause sign
// gating a save, and the timekeeper waiting out a late-arriving cookie) against a real browser.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-login-multisignal-"));
process.env.CONXA_DATA_DIR = tmp;
process.env.CONXA_DIR = tmp;
process.env.CONXA_LOGIN_POLL_MS = "50";
process.env.CONXA_LOGIN_CLOSE_GRACE_MS = "100";
process.env.CONXA_LOGIN_BACKUP_AGREE_MS = "100";
// Generous relative to the defaults so the timekeeper actually gets to observe a cookie arriving
// ~300ms after the page that carries it loads, instead of returning after a single sample.
process.env.CONXA_LOGIN_TIMEKEEPER_POLL_MS = "100";
process.env.CONXA_LOGIN_TIMEKEEPER_BUDGET_MS = "3000";

const { chromium } = require("playwright");
const realLaunch = chromium.launch.bind(chromium);
let launched = [];
chromium.launch = async (opts) => { const b = await realLaunch({ ...opts, headless: true }); launched.push(b); return b; };

const browser = require("../../app/browser");
const registry = require("../../app/browser_session");
const { getCachedBrowser, awaitAuthPending, authAppStatus } = browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(30); }
  throw new Error(`timed out waiting for ${what}`);
}

// A single-step form -> texted-code (OTP) -> home flow, with a late same-origin cookie fired 300ms
// after /home loads (a client-side write that arrives after the redirect completes — the artifact's
// "late pass" scenario). /login bounces an already-fully-signed-in visitor to /home, same as any
// real login page and what browser.js's judge specifically checks for.
function startApp() {
  const hits = { login: 0 };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cookies = req.headers.cookie || "";
      const authed = /(?:^|;\s*)sid=1/.test(cookies);
      const pending = /(?:^|;\s*)pending=1/.test(cookies);
      if (req.url.startsWith("/login")) {
        hits.login++;
        if (authed) { res.writeHead(302, { Location: "/home" }); return res.end(); }
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<body><input type=password></body>");
      }
      if (req.url.startsWith("/auth-start")) {
        res.writeHead(302, { "Set-Cookie": "pending=1; Path=/", Location: "/mfa" }); return res.end();
      }
      if (req.url.startsWith("/mfa-complete")) {
        // `dest` lets a test land somewhere other than plain /home (e.g. /home-named, AUTH-8's
        // account-marker fixture) without touching every other scenario's expectations.
        const dest = new URL(req.url, "http://x").searchParams.get("dest") || "/home";
        res.writeHead(302, { "Set-Cookie": ["sid=1; Path=/", "pending=; Path=/; Max-Age=0"], Location: dest }); return res.end();
      }
      if (req.url.startsWith("/mfa")) {
        if (!pending) { res.writeHead(302, { Location: "/login" }); return res.end(); }
        res.writeHead(200, { "content-type": "text/html" });
        // Two single-character numeric inputs — the OTP shape pauseSignProbe looks for.
        return res.end('<body><input maxlength="1" inputmode="numeric"><input maxlength="1" inputmode="numeric"></body>');
      }
      if (req.url.startsWith("/late-cookie")) {
        res.writeHead(200, { "Set-Cookie": "csrf=late; Path=/", "content-type": "text/plain" }); return res.end("ok");
      }
      // AUTH-8: a plain landed page (no account/profile marker) vs. one with a structural marker
      // accountNameProbe looks for — proves the probe stays silent on a miss and surfaces text
      // only when a plausible marker is actually present.
      if (req.url.startsWith("/home-named")) {
        if (!authed) { res.writeHead(302, { Location: "/login" }); return res.end(); }
        res.writeHead(200, { "content-type": "text/html" });
        return res.end('<body><header><button aria-label="Account: Ada Lovelace"></button></header></body>');
      }
      if (req.url.startsWith("/home")) {
        if (!authed) { res.writeHead(302, { Location: "/login" }); return res.end(); }
        res.writeHead(200, { "content-type": "text/html" });
        return res.end('<body>home<script>setTimeout(()=>fetch("/late-cookie"),300)</script></body>');
      }
      res.writeHead(404); res.end();
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port, hits }));
  });
}

let APP, ORIGIN;
const SESSIONS = () => path.join(tmp, "cache", "sessions");

function workspace(id, { successPath = "/home" } = {}) {
  const ws = `ws_${id}`;
  fs.mkdirSync(path.join(tmp, "skill-packs", ws), { recursive: true });
  fs.writeFileSync(path.join(tmp, "skill-packs", ws, "pack.json"), JSON.stringify({
    groups: [{ id: "g1", name: "Team", apps: [{ id: "a", name: "AppA", login_url: `${ORIGIN}/login`, success_url: `${ORIGIN}${successPath}` }] }],
  }));
  return ws;
}
const opts = (ws) => ({ headless: false, groupId: "g1", requiredAppIds: ["a"], runId: `run_${ws}` });
const loginTabs = (ctx) => ctx.pages().filter((p) => !p.isClosed() && p.url().startsWith(`${ORIGIN}/`) && !p.url().startsWith(`${ORIGIN}/home`));

async function reset() { await registry.closeAll(); for (const b of launched) await b.close().catch(() => {}); launched = []; }

async function run() {
  APP = await startApp();
  ORIGIN = `http://127.0.0.1:${APP.port}`;

  await check("pause sign: an OTP screen holds the save back until the code step completes", async () => {
    await reset();
    const ws = workspace("otp");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    assert.strictEqual(r1.authPending, true);
    const key = `${ws}__a`;
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx).length === 1, "login tab");
    await loginTabs(ctx)[0].goto(`${ORIGIN}/auth-start`); // password "submitted" -> half-logged-in, MFA screen up

    // Give the ladder several ticks to prove it does NOT save while the OTP screen is showing —
    // this is the exact mistake the recorder's own auth_mode fallback makes (session.py saves the
    // instant the URL leaves the login page, with no concept of "still mid-sign-in").
    await sleep(400);
    assert.strictEqual(authAppStatus(key), "waiting", "must not have saved while the code screen is up");

    await loginTabs(ctx)[0].goto(`${ORIGIN}/mfa-complete`); // "code entered"
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    assert.ok(!waited[0].accountName, "AUTH-8: a plain landed page has no account marker — must stay silent, not guess");
  });

  await check("AUTH-8: an account marker on the landed page surfaces as a positive \"Signed in as\" confirmation", async () => {
    await reset();
    const ws = workspace("named", { successPath: "/home-named" });
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx).length === 1, "login tab");
    await loginTabs(ctx)[0].goto(`${ORIGIN}/auth-start`);
    await loginTabs(ctx)[0].goto(`${ORIGIN}/mfa-complete?dest=/home-named`);
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    assert.strictEqual(waited[0].accountName, "Account: Ada Lovelace", "never blocking, never a warning — just surfaced when found");
  });

  await check("timekeeper: waits out a cookie the site writes a moment after landing on the app", async () => {
    await reset();
    const ws = workspace("late");
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx).length === 1, "login tab");
    await loginTabs(ctx)[0].goto(`${ORIGIN}/auth-start`);
    await loginTabs(ctx)[0].goto(`${ORIGIN}/mfa-complete`); // lands on /home, which fires the late cookie itself
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    const saved = JSON.parse(fs.readFileSync(path.join(SESSIONS(), `${ws}__a_raw_state.json`), "utf8"));
    assert.ok(saved.cookies.some((c) => c.name === "sid"), "the real sign-in cookie was saved");
    assert.ok(saved.cookies.some((c) => c.name === "csrf"), "the late-arriving cookie was NOT missed");
  });

  await check("AUTH-6: the human-override file-drop forces a save even while the pause sign is showing", async () => {
    await reset();
    const ws = workspace("override");
    const key = `${ws}__a`;
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx).length === 1, "login tab");
    await loginTabs(ctx)[0].goto(`${ORIGIN}/auth-start`); // half-logged-in, OTP screen up — the ladder alone would wait
    await sleep(200);
    assert.strictEqual(authAppStatus(key), "waiting", "still paused, sanity check before dropping the signal");

    // Exactly what the CLI subcommand and Execute's "I'm done signing in" button both do.
    const file = browser._humanOverrideFile(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "done");

    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"], "the ladder never got to judge_yes/backup-agreed — only the override decided this");

    const logLines = fs.readFileSync(path.join(tmp, "logs", "login_signals.log"), "utf8").trim().split("\n");
    const lastEntry = JSON.parse(logLines[logLines.length - 1]);
    assert.strictEqual(lastEntry.key, key);
    assert.strictEqual(lastEntry.decision, "human_override", "AUTH-7's decision log must record WHY this one saved");
  });

  await check("already signed in: the 'before' snapshot alone saves a sibling app's shared SSO cookie", async () => {
    await reset();
    const ws = `ws_sso`;
    // Two apps sharing one origin (one SSO cookie): AppA has a valid, cache-trusted session; AppB
    // has nothing stored, so pre-flight opens a login window for it — but the context is seeded
    // with AppA's cookie first, so AppB's login page is ALREADY signed in the instant it's asked
    // (docs/artifacts/login-desk.html "Old login still works").
    fs.mkdirSync(path.join(tmp, "skill-packs", ws), { recursive: true });
    fs.writeFileSync(path.join(tmp, "skill-packs", ws, "pack.json"), JSON.stringify({
      groups: [{ id: "g1", name: "Team", apps: [
        { id: "a", name: "AppA", login_url: `${ORIGIN}/login`, success_url: `${ORIGIN}/home` },
        { id: "b", name: "AppB", login_url: `${ORIGIN}/login`, success_url: `${ORIGIN}/home` },
      ] }],
    }));
    fs.mkdirSync(SESSIONS(), { recursive: true });
    const fileA = path.join(SESSIONS(), `${ws}__a_raw_state.json`);
    fs.writeFileSync(fileA, JSON.stringify({
      cookies: [{ name: "sid", value: "1", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [],
    }));
    browser._writeValidationCache(`${ws}__a`, fileA);

    const before = APP.hits.login;
    const r1 = await getCachedBrowser(ws, null, { headless: false, groupId: "g1", requiredAppIds: ["a", "b"], runId: `run_${ws}` });
    assert.strictEqual(r1.authPending, true);
    assert.deepStrictEqual(r1.apps.map((x) => x.id), ["b"], "only AppB needed a login window");
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);

    const decisionLines = fs.readFileSync(path.join(tmp, "logs", "login_signals.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = decisionLines.filter((d) => d.key === `${ws}__b`).pop();
    assert.strictEqual(last.decision, "already_signed_in", "the before-snapshot alone decided this, not the ladder");
    // The before-snapshot, the visible login tab's own first navigation, and the prover's re-check
    // each touch /login once — never the ladder's judge/lookout machinery on top of that.
    assert.ok(APP.hits.login - before <= 3, "no extra /login hits from the ladder — the before-snapshot alone decided this");
  });

  await check("judge: the whole OTP flow costs only a handful of /login hits, never one per poll tick", async () => {
    // The regression this guards: the judge used to be re-asked on EVERY tick once any lookout had
    // fired (login_signals.js's own shouldAskJudge tests cover the pure rule; this proves the wiring
    // end to end). CONXA_LOGIN_POLL_MS is 50 here, so the OLD bug would rack up a hit roughly every
    // 50ms across a ~400ms pause — a handful of hits, not dozens.
    await reset();
    const ws = workspace("judgeonce");
    const before = APP.hits.login;
    const r1 = await getCachedBrowser(ws, null, opts(ws));
    const ctx = launched[0].contexts()[0];
    await waitFor(() => loginTabs(ctx).length === 1, "login tab");
    await loginTabs(ctx)[0].goto(`${ORIGIN}/auth-start`); // password-gone lookout fires -> the OTP screen goes up
    await sleep(400); // several poll ticks while paused, then several more once it's not
    await loginTabs(ctx)[0].goto(`${ORIGIN}/mfa-complete`);
    const waited = await awaitAuthPending(r1, { timeoutMs: 15000 });
    assert.deepStrictEqual(waited.map((w) => w.outcome), ["captured"]);
    // before-snapshot + visible tab's own first nav + at most a couple of real judge asks + prover.
    assert.ok(APP.hits.login - before <= 6, `expected only a handful of /login hits, got ${APP.hits.login - before}`);
  });

  await reset();
  APP.srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  process.exit(process.exitCode || 0);
}

run();
