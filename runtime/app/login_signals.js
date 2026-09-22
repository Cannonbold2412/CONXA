"use strict";
// login_signals.js — pure decision logic for interactive sign-in completion detection.
//
// Shared by both wait implementations in browser.js (_waitForSessionLogin, the normal
// one-Chromium-per-run case, and _waitForInteractiveAuth, the standalone-browser fallback) so
// the two never grow independently-drifting copies of the same rule — the same reason
// second_opinion.js::build_try_dismiss_from_hint is the one place a try_dismiss branch gets
// built. Nothing here touches Playwright: signal *gathering* (reading page.url(), querying the
// DOM, diffing cookies) stays in browser.js/page_scripts.js; this module only decides what a
// gathered snapshot means, so it is unit-testable offline like target_hosts.js/resolver.js.
//
// Vocabulary (matches the "Login Desk" design doc, docs/artifacts/login-desk.html):
//   lookouts   — passive signals that something happened: journey, password-box-gone, new tickets.
//   pause sign — a mid-sign-in screen (OTP code, MFA) is up; nothing below counts while it is.
//   judge      — the active check: re-request the login URL and see if it still shows a login form.
//   timekeeper — wait for the ticket signature to stop changing before saving (see browser.js).
//   prover     — verify the saved session actually works (see browser.js::_proveSession).

// A short allow-list of hosts that host a THIRD-PARTY sign-in step, never the app itself, so the
// journey lookout can skip over an IdP hop and credit the first stop that isn't one of these as
// "arrived at the app". Mirrors the same handful of providers _loginEntryUrl already special-cases
// in its own comments — keep this the one place that names them. Hostname-suffix match, so a
// tenant subdomain (foo.okta.com) still matches its own entry.
const KNOWN_IDP_HOST_SUFFIXES = [
  "accounts.google.com",
  "login.microsoftonline.com",
  "login.live.com",
  "login.windows.net",
  "okta.com",
  "auth0.com",
  "appleid.apple.com",
  "github.com",
];

function isKnownIdpHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  return KNOWN_IDP_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith("." + suffix));
}

// First host in `hostsVisitedInOrder` (already deduped consecutive, oldest first) that is neither
// the login page's own host nor a known IdP — the artifact's "first stop after the login page and
// those services". Returns null while every host seen so far is the login host or an IdP (still
// mid-journey, e.g. sitting on accounts.google.com waiting for the person to approve).
function classifyJourney(hostsVisitedInOrder, loginHost) {
  const login = String(loginHost || "").toLowerCase();
  for (const raw of hostsVisitedInOrder || []) {
    const h = String(raw || "").toLowerCase();
    if (!h || h === login || isKnownIdpHost(h)) continue;
    return h;
  }
  return null;
}

// ── Tickets (cookies + storage keys) ────────────────────────────────────────────────────────
// Names and counts only — never values. Keeps the existing "secrets stay on the machine" rule
// (see runtime/app/auth_manager.js's own comments) intact: this never has to be redacted from a
// log because it never carries anything worth redacting.
function ticketSignature({ cookieNames = [], storageKeyCounts = {} } = {}) {
  const sortedCounts = {};
  for (const k of Object.keys(storageKeyCounts).sort()) sortedCounts[k] = storageKeyCounts[k];
  return { cookieNames: [...cookieNames].sort(), storageKeyCounts: sortedCounts };
}

function sameTickets(a, b) {
  if (!a || !b) return false;
  if (a.cookieNames.length !== b.cookieNames.length) return false;
  for (let i = 0; i < a.cookieNames.length; i++) {
    if (a.cookieNames[i] !== b.cookieNames[i]) return false;
  }
  const ak = Object.keys(a.storageKeyCounts);
  const bk = Object.keys(b.storageKeyCounts);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a.storageKeyCounts[k] !== b.storageKeyCounts[k]) return false;
  }
  return true;
}

// "A new ticket appeared" — true the first time anything is seen (before === null) as long as
// there IS something, and true whenever the signature differs from the previous one.
function ticketsChanged(before, after) {
  if (!after) return false;
  if (!before) return after.cookieNames.length > 0 || Object.values(after.storageKeyCounts).some((n) => n > 0);
  return !sameTickets(before, after);
}

// ── Pause sign ───────────────────────────────────────────────────────────────────────────────
// Scoped deliberately narrow to the one mid-sign-in screen with an unambiguous DOM shape: an
// OTP/texted-code entry (a run of single-character inputs, or the standard
// autocomplete="one-time-code" marker). "Choose an account" / "approve on your phone" screens
// have no comparably reliable structural signature without reading text — see page_scripts.js's
// pauseSignProbe for the exact query — so they are left to the judge/backup-agreement ladder
// below instead of a dedicated pause. ponytail: OTP-only pause sign; broaden if real logins show
// the journey/password-box lookouts firing early on an account-chooser or approval screen too
// often for the backup rule to catch cleanly.
function looksPaused(domProbe) {
  if (!domProbe) return false;
  return domProbe.otpLikeInputCount >= 2 || Boolean(domProbe.hasOneTimeCodeAutocomplete);
}

// ── The decision ladder ──────────────────────────────────────────────────────────────────────
// `firedAt`: { journey?: ms, passwordGone?: ms, newTickets?: ms } — first-fire timestamp per
// lookout, or absent/undefined if it hasn't fired. Lookouts are monotonic (once true, always
// true for the rest of one sign-in wait), so "two or more have agreed for `agreeMs`" reduces to
// "the SECOND-earliest fire time is at least `agreeMs` in the past".
function backupAgreementHeldMs(firedAt, nowMs) {
  const times = Object.values(firedAt || {}).filter((t) => typeof t === "number").sort((a, b) => a - b);
  if (times.length < 2) return 0;
  return Math.max(0, nowMs - times[1]);
}

const DEFAULT_BACKUP_AGREE_MS = 10000;

// `judge` is one of "yes" | "no" | null (not asked yet, or the site can't be told apart before vs.
// after — see _reachedProtectedUrl called against a fresh probe in browser.js). Mirrors the
// artifact's "Who do we believe?" ladder exactly:
//   paused                                  -> wait, nothing counts
//   judge yes                               -> save
//   judge no                                -> wait (false alarm — a lookout fired but the site
//                                               still shows its login form)
//   judge null + 2 lookouts agreed >= agreeMs -> save (backup rule, for sites the judge can't read)
//   otherwise                               -> wait
function ladderVerdict({ paused, judge, firedAt, nowMs, agreeMs = DEFAULT_BACKUP_AGREE_MS }) {
  if (paused) return { action: "wait", reason: "paused" };
  if (judge === "yes") return { action: "save", reason: "judge_yes" };
  if (judge === "no") return { action: "wait", reason: "judge_no" };
  const held = backupAgreementHeldMs(firedAt, nowMs);
  if (held >= agreeMs) return { action: "save", reason: "lookouts_agreed" };
  return { action: "wait", reason: "insufficient_signal" };
}

module.exports = {
  KNOWN_IDP_HOST_SUFFIXES,
  isKnownIdpHost,
  classifyJourney,
  ticketSignature,
  sameTickets,
  ticketsChanged,
  looksPaused,
  backupAgreementHeldMs,
  ladderVerdict,
  DEFAULT_BACKUP_AGREE_MS,
};
