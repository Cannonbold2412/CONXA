"use strict";

// Pure decision logic for interactive sign-in completion — see login_signals.js's own header for
// the vocabulary (lookouts, pause sign, judge, the ladder). No Playwright here: this exercises the
// yes/no/can't-tell rule against synthetic snapshots, the same way test_target_hosts.js exercises
// resolveTargetHosts offline.

const test = require("node:test");
const assert = require("node:assert");

const {
  isKnownIdpHost,
  classifyJourney,
  ticketSignature,
  sameTickets,
  ticketsChanged,
  looksPaused,
  looksLikeLoginAnswer,
  judgeFromSnapshots,
  shouldAskJudge,
  alreadySignedIn,
  backupAgreementHeldMs,
  ladderVerdict,
} = require("../../app/login_signals");

test("isKnownIdpHost matches known providers by suffix, not arbitrary hosts", () => {
  assert.ok(isKnownIdpHost("accounts.google.com"));
  assert.ok(isKnownIdpHost("mycompany.okta.com"));
  assert.ok(isKnownIdpHost("MyCompany.Okta.com")); // case-insensitive
  assert.ok(!isKnownIdpHost("app.acme-cloud.io"));
  assert.ok(!isKnownIdpHost("notokta.com")); // must be a dot-boundary suffix, not a raw substring
  assert.ok(!isKnownIdpHost(""));
});

test("classifyJourney skips the login host and any IdP hop, crediting the first real stop", () => {
  const hosts = ["login.acme.com", "accounts.google.com", "app.acme-cloud.io"];
  assert.strictEqual(classifyJourney(hosts, "login.acme.com"), "app.acme-cloud.io");
});

test("classifyJourney returns null while every host seen so far is the login page or an IdP", () => {
  assert.strictEqual(classifyJourney(["login.acme.com", "accounts.google.com"], "login.acme.com"), null);
  assert.strictEqual(classifyJourney([], "login.acme.com"), null);
});

test("classifyJourney treats a same-host journey (no IdP hop) the same way", () => {
  assert.strictEqual(classifyJourney(["app.acme.com", "app.acme.com/dashboard"], "app.acme.com"), "app.acme.com/dashboard");
});

test("ticketSignature sorts names/keys so signature comparison isn't order-sensitive", () => {
  const sig = ticketSignature({ cookieNames: ["b", "a"], storageKeyCounts: { z: 1, a: 2 } });
  assert.deepStrictEqual(sig.cookieNames, ["a", "b"]);
  assert.deepStrictEqual(Object.keys(sig.storageKeyCounts), ["a", "z"]);
});

test("sameTickets compares by content, not object identity", () => {
  const a = ticketSignature({ cookieNames: ["session"], storageKeyCounts: { app: 2 } });
  const b = ticketSignature({ cookieNames: ["session"], storageKeyCounts: { app: 2 } });
  const c = ticketSignature({ cookieNames: ["session"], storageKeyCounts: { app: 3 } });
  assert.ok(sameTickets(a, b));
  assert.ok(!sameTickets(a, c));
  assert.ok(!sameTickets(null, b));
});

test("ticketsChanged fires the first time something real is seen, and again on any later diff", () => {
  const nothing = ticketSignature({});
  const first = ticketSignature({ cookieNames: ["session"] });
  assert.ok(!ticketsChanged(null, nothing)); // nothing before, nothing after — not a signal
  assert.ok(ticketsChanged(null, first)); // nothing before, something now — "a new ticket appeared"
  assert.ok(!ticketsChanged(first, first)); // unchanged
  const second = ticketSignature({ cookieNames: ["session", "csrf"] });
  assert.ok(ticketsChanged(first, second));
});

test("looksPaused recognises an OTP-style input group or the standard autocomplete marker", () => {
  assert.ok(looksPaused({ otpLikeInputCount: 6, hasOneTimeCodeAutocomplete: false }));
  assert.ok(looksPaused({ otpLikeInputCount: 0, hasOneTimeCodeAutocomplete: true }));
  assert.ok(!looksPaused({ otpLikeInputCount: 1, hasOneTimeCodeAutocomplete: false }));
  assert.ok(!looksPaused(null));
});

test("backupAgreementHeldMs is 0 until a SECOND lookout has fired", () => {
  assert.strictEqual(backupAgreementHeldMs({ journey: 1000 }, 5000), 0);
  assert.strictEqual(backupAgreementHeldMs({}, 5000), 0);
});

test("backupAgreementHeldMs counts from the second-earliest fire, not the first or the latest", () => {
  // journey fired at 1000, passwordGone at 3000, newTickets at 3200 — the "two agree" moment is 3000.
  const firedAt = { journey: 1000, passwordGone: 3000, newTickets: 3200 };
  assert.strictEqual(backupAgreementHeldMs(firedAt, 13000), 10000);
});

test("ladder: paused overrides everything else, even a judge yes", () => {
  const v = ladderVerdict({ paused: true, judge: "yes", firedAt: { journey: 0, passwordGone: 0 }, nowMs: 20000 });
  assert.deepStrictEqual(v, { action: "wait", reason: "paused" });
});

test("ladder: judge yes saves immediately regardless of lookout agreement", () => {
  const v = ladderVerdict({ paused: false, judge: "yes", firedAt: {}, nowMs: 0 });
  assert.deepStrictEqual(v, { action: "save", reason: "judge_yes" });
});

test("ladder: judge no is a false alarm — keep watching even with lookouts fired", () => {
  const v = ladderVerdict({ paused: false, judge: "no", firedAt: { journey: 0, passwordGone: 0 }, nowMs: 20000 });
  assert.deepStrictEqual(v, { action: "wait", reason: "judge_no" });
});

test("ladder: can't-tell (judge null) falls back to the backup rule once two lookouts agree for 10s", () => {
  const firedAt = { journey: 1000, passwordGone: 2000 };
  assert.deepStrictEqual(
    ladderVerdict({ paused: false, judge: null, firedAt, nowMs: 11999 }),
    { action: "wait", reason: "insufficient_signal" },
  );
  assert.deepStrictEqual(
    ladderVerdict({ paused: false, judge: null, firedAt, nowMs: 12000 }),
    { action: "save", reason: "lookouts_agreed" },
  );
});

test("ladder: can't-tell with only one lookout never saves on the backup rule alone", () => {
  const v = ladderVerdict({ paused: false, judge: null, firedAt: { journey: 1000 }, nowMs: 999999 });
  assert.deepStrictEqual(v, { action: "wait", reason: "insufficient_signal" });
});

// ── looksLikeLoginAnswer / judgeFromSnapshots / alreadySignedIn ─────────────────────────────────
// docs/artifacts/login-desk.html "Ask for the login page again" — the judge's before/after compare.

test("looksLikeLoginAnswer: a password box always counts, regardless of URL", () => {
  assert.ok(looksLikeLoginAnswer({ url: "https://app.acme-cloud.io/dashboard", hasPasswordBox: true }));
});

test("looksLikeLoginAnswer: a known IdP host always counts, even off a /login-shaped path", () => {
  assert.ok(looksLikeLoginAnswer({ url: "https://accounts.google.com/signin/v2/identifier", hasPasswordBox: false }));
});

test("looksLikeLoginAnswer: a login-shaped path counts even with no password box (e.g. email-first)", () => {
  assert.ok(looksLikeLoginAnswer({ url: "https://app.acme.com/login", hasPasswordBox: false }));
});

test("looksLikeLoginAnswer: an ordinary app page with neither is not a login answer", () => {
  assert.ok(!looksLikeLoginAnswer({ url: "https://app.acme-cloud.io/dashboard", hasPasswordBox: false }));
});

test("looksLikeLoginAnswer: an unparseable url is treated as a login answer, never a false yes", () => {
  assert.ok(looksLikeLoginAnswer({ url: "", hasPasswordBox: false }));
});

test("judgeFromSnapshots: after is null (probe failed) -> can't tell", () => {
  assert.strictEqual(judgeFromSnapshots({ url: "https://app.acme.com/login", hasPasswordBox: true }, null), null);
});

test("judgeFromSnapshots: before is null (pre-sign-in probe failed) -> can't tell", () => {
  assert.strictEqual(judgeFromSnapshots(null, { url: "https://app.acme.com/dashboard", hasPasswordBox: false }), null);
});

test("judgeFromSnapshots: same origin+path both times -> can't tell (site shows its login page either way)", () => {
  const before = { url: "https://app.acme.com/login", hasPasswordBox: true };
  const after = { url: "https://app.acme.com/login?x=1", hasPasswordBox: true }; // query ignored
  assert.strictEqual(judgeFromSnapshots(before, after), null);
});

test("judgeFromSnapshots: bounced off the login page to the app -> yes", () => {
  const before = { url: "https://app.acme.com/login", hasPasswordBox: true };
  const after = { url: "https://app.acme.com/dashboard", hasPasswordBox: false };
  assert.strictEqual(judgeFromSnapshots(before, after), "yes");
});

test("judgeFromSnapshots: still shows a login-shaped answer at a different address -> no (false alarm)", () => {
  const before = { url: "https://app.acme.com/login", hasPasswordBox: true };
  const after = { url: "https://accounts.google.com/signin", hasPasswordBox: false };
  assert.strictEqual(judgeFromSnapshots(before, after), "no");
});

test("alreadySignedIn: the before snapshot already doesn't look like a login answer -> old login still works", () => {
  assert.ok(alreadySignedIn({ url: "https://app.acme-cloud.io/dashboard", hasPasswordBox: false }));
});

test("alreadySignedIn: a real login page, or no snapshot at all, is not already signed in", () => {
  assert.ok(!alreadySignedIn({ url: "https://app.acme.com/login", hasPasswordBox: true }));
  assert.ok(!alreadySignedIn(null));
});

// ── shouldAskJudge ───────────────────────────────────────────────────────────────────────────
// The regression this guards: the judge used to be re-asked on EVERY tick once any lookout had
// fired, hammering the site's login page over and over (docs/artifacts/login-desk.html "Gentle
// with the website"). It must fire once per NEW lookout, then go quiet until another one fires.

test("shouldAskJudge: fires the first time a lookout has fired", () => {
  assert.ok(shouldAskJudge({ firedCount: 1, judgedAtFiredCount: 0, judgeVerdict: null, judging: false, paused: false }));
});

test("shouldAskJudge: does NOT re-fire tick after tick with no NEW lookout, even many ticks later", () => {
  const opts = { firedCount: 1, judgedAtFiredCount: 1, judgeVerdict: "no", judging: false, paused: false };
  assert.ok(!shouldAskJudge(opts));
  assert.ok(!shouldAskJudge(opts), "still no on a later tick — nothing changed");
});

test("shouldAskJudge: fires again once a SECOND, different lookout fires", () => {
  assert.ok(shouldAskJudge({ firedCount: 2, judgedAtFiredCount: 1, judgeVerdict: "no", judging: false, paused: false }));
});

test("shouldAskJudge: never while paused, never while a previous ask is still in flight, never once judge already said yes", () => {
  assert.ok(!shouldAskJudge({ firedCount: 1, judgedAtFiredCount: 0, judgeVerdict: null, judging: false, paused: true }));
  assert.ok(!shouldAskJudge({ firedCount: 1, judgedAtFiredCount: 0, judgeVerdict: null, judging: true, paused: false }));
  assert.ok(!shouldAskJudge({ firedCount: 2, judgedAtFiredCount: 1, judgeVerdict: "yes", judging: false, paused: false }));
});
