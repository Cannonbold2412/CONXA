"use strict";

// Browser-side adapter that lets the pure resolver (resolver.js) run against a live Playwright
// page. The pure resolve() expects a synchronous root.queryAll(selector); the DOM is async, so we
// pre-gather candidate descriptors per signal, then hand resolve() a synchronous map view.

const crypto = require("crypto");
const { extractDescriptor: _extractDescriptor } = require("./page_scripts");

// Build a getByRole locator from an `internal:role=<role>[name="<name>"]` grammar string.
// The name is QUOTED in the grammar, which in Playwright's own parser means an EXACT match
// (e.g. `internal:role=link[name="Blueprint"]` resolves only "Blueprint", never "Blueprints").
// getByRole defaults to substring matching, so we pass exact:true to honour the grammar — this
// keeps the re-parsed locator semantically identical to the native string and is the single
// role+name code path shared by primary resolution AND a11y recovery. Returns null if not a
// role grammar string (caller falls back to a raw locator).
function roleLocator(root, raw) {
  const rm = String(raw).match(/internal:role=([a-zA-Z]+)(?:\[name="([^"]*)"\])?/);
  if (!rm) return null;
  return rm[2] ? root.getByRole(rm[1], { name: rm[2], exact: true }) : root.getByRole(rm[1]);
}

// ── Signal → Playwright locator ────────────────────────────────────────────
// Map a compiled IdentitySignal to a Playwright locator builder. We key off signal.engine and
// parse role/name/testid/text out of the Playwright `internal:` grammar, rather than relying on
// Playwright to parse internal: strings (not a public guarantee).
function signalToLocator(root, signal, interpolate, inputs) {
  const engine = String(signal.engine || "");
  const raw = interpolate(String(signal.selector || ""), inputs);
  if (!raw) return null;

  if (engine === "testid") {
    // Honour the page's actual attribute name (data-test-id vs data-testid). Playwright's
    // getByTestId is hard-wired to data-testid with no hyphen, so a hyphenated attribute would
    // silently match nothing and drop the signal. The signal text after the internal: prefix is
    // already a literal [attr="value"] CSS selector — use root.locator() on it directly so the
    // exact attribute name is preserved.
    const css = raw.replace(/^internal:testid=/, "").trim();
    if (css.startsWith("[")) return root.locator(css);
    // Fallback: reconstruct from the attribute name + value captured in the raw string.
    const m = raw.match(/(data-test-?id)=["']?([^"'\]]+)/);
    return m ? root.locator(`[${m[1]}="${m[2]}"]`) : root.locator(raw);
  }
  if (engine === "role" || engine === "aria") {
    return roleLocator(root, raw) || root.locator(raw);
  }
  if (engine === "text" || engine === "text_based") {
    let tm = raw.match(/internal:text="([^"]*)"/);
    if (!tm) tm = raw.match(/^text=["']?(.+?)["']?$/);
    if (tm) return root.getByText(tm[1], { exact: true });
    return root.locator(raw);
  }
  if (engine === "relational") {
    // Playwright has no `right-of=`/`left-of=`/… chain engine (the recorded `>> right-of=…`
    // serialization is not a parseable selector — only the CSS `:right-of()` pseudo exists,
    // and it cannot take a role-based base). Resolve the durable base role+name instead; the
    // resolver's fingerprint scoring + uniqueness gate disambiguates among siblings, which is
    // what the spatial anchor was meant to do anyway.
    const base = raw.split(">>")[0].trim();
    return roleLocator(root, base) || root.locator(base);
  }
  if (engine === "xpath") {
    return root.locator(raw.startsWith("xpath=") ? raw : ("xpath=" + raw));
  }
  // css-id, css-structural, css
  return root.locator(raw);
}

// _extractDescriptor is imported from page_scripts.js (runs in the browser context — see that
// file's header for why it lives in its own, less-obfuscated module).

function _sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Gather candidate descriptors for every signal. Returns { [signal.selector]: descriptor[] },
// each descriptor carrying its live locator (`_loc`) so the caller can act on the winner.
async function gatherCandidates(roots, signals, interpolate, inputs, perSignalCap = 25) {
  const map = {};
  for (const sig of signals) {
    const descriptors = [];
    for (const root of roots) {
      let locator;
      try { locator = signalToLocator(root, sig, interpolate, inputs); } catch (_) { locator = null; }
      if (!locator) continue;
      let all = [];
      try { all = await locator.all(); } catch (_) { all = []; }
      for (const item of all.slice(0, perSignalCap)) {
        let d;
        try { d = await item.evaluate(_extractDescriptor); } catch (_) { continue; }
        if (!d) continue;
        d.stableHash = d._hashPayload ? _sha256(d._hashPayload) : "";
        delete d._hashPayload;
        d._loc = item;
        descriptors.push(d);
      }
    }
    map[sig.selector] = descriptors;
  }
  return map;
}

// Shape the bundle's fingerprint into what resolver.scoreCandidate expects.
function bundleFingerprint(bundle) {
  const fp = (bundle && bundle.fingerprint) || {};
  return { ...fp, stable_hash: (bundle && bundle.stable_hash) || "" };
}

module.exports = { signalToLocator, gatherCandidates, bundleFingerprint, _extractDescriptor, _sha256 };
