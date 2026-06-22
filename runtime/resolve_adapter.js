"use strict";

// Browser-side adapter that lets the pure resolver (resolver.js) run against a live Playwright
// page. The pure resolve() expects a synchronous root.queryAll(selector); the DOM is async, so we
// pre-gather candidate descriptors per signal, then hand resolve() a synchronous map view.

const crypto = require("crypto");

// ── Signal → Playwright locator ────────────────────────────────────────────
// Map a compiled IdentitySignal to a Playwright locator builder. We key off signal.engine and
// parse role/name/testid/text out of the Playwright `internal:` grammar, rather than relying on
// Playwright to parse internal: strings (not a public guarantee).
function signalToLocator(root, signal, interpolate, inputs) {
  const engine = String(signal.engine || "");
  const raw = interpolate(String(signal.selector || ""), inputs);
  if (!raw) return null;

  if (engine === "testid") {
    const m = raw.match(/data-testid=["']?([^"'\]]+)/);
    return m ? root.getByTestId(m[1]) : root.locator(raw);
  }
  if (engine === "role" || engine === "aria") {
    const rm = raw.match(/internal:role=([a-zA-Z]+)(?:\[name="([^"]*)"\])?/);
    if (rm) return rm[2] ? root.getByRole(rm[1], { name: rm[2] }) : root.getByRole(rm[1]);
    return root.locator(raw);
  }
  if (engine === "text" || engine === "text_based") {
    let tm = raw.match(/internal:text="([^"]*)"/);
    if (!tm) tm = raw.match(/^text=["']?(.+?)["']?$/);
    if (tm) return root.getByText(tm[1], { exact: true });
    return root.locator(raw);
  }
  if (engine === "relational") {
    // No public Playwright `right-of` engine — fall back to the base role+name locator.
    const base = raw.split(">>")[0].trim();
    const rm = base.match(/internal:role=([a-zA-Z]+)(?:\[name="([^"]*)"\])?/);
    if (rm) return rm[2] ? root.getByRole(rm[1], { name: rm[2] }) : root.getByRole(rm[1]);
    return root.locator(base);
  }
  if (engine === "xpath") {
    return root.locator(raw.startsWith("xpath=") ? raw : ("xpath=" + raw));
  }
  // css-id, css-structural, css
  return root.locator(raw);
}

// ── Page-side fingerprint extractor ─────────────────────────────────────────
// Returns the comparable attributes for one candidate element plus the stable-hash payload
// string. The payload mirrors compiler/stable_hash.py so the Node-side SHA256 (below) matches the
// compiled stable_hash when the recorded attributes match.
/* istanbul ignore next — runs in the browser context */
function _extractDescriptor(el) {
  const DYNAMIC_TOKENS = new Set([
    "focus", "hover", "active", "focus-visible", "focus-within",
    "loading", "animating", "transitioning", "selected", "disabled",
    "expanded", "collapsed", "open", "closed", "checked", "pressed",
    "dragging", "dragged", "dropping",
  ]);
  const DYNAMIC_PREFIXES = ["is-", "has-", "js-", "animate-", "transition-", "state-"];
  const SKIP = new Set([
    "class", "style", "tabindex",
    "aria-expanded", "aria-selected", "aria-checked", "aria-disabled",
    "aria-pressed", "aria-current", "aria-busy",
    "data-state", "data-active", "data-focus", "data-open",
  ]);

  const tag = (el.tagName || "").toLowerCase();
  const attrsObj = {};
  for (const a of Array.from(el.attributes || [])) {
    const k = a.name.toLowerCase();
    if (SKIP.has(k)) continue;
    if (k === "class") {
      const stable = String(a.value || "").split(/\s+/).filter(c => {
        const lc = c.toLowerCase();
        if (!c || DYNAMIC_TOKENS.has(lc)) return false;
        return !DYNAMIC_PREFIXES.some(p => lc.startsWith(p));
      });
      if (stable.length) attrsObj["class"] = stable.sort().join(" ");
    } else {
      attrsObj[k] = String(a.value || "");
    }
  }
  const sortedAttrs = Object.keys(attrsObj).sort().map(k => `${k}=${attrsObj[k]}`).join("&");

  const ariaLabel = el.getAttribute("aria-label") || "";
  const nameAttr = el.getAttribute("name") || "";
  const innerText = (el.textContent || "").trim().slice(0, 80);
  const axName = (ariaLabel || nameAttr || innerText).trim();
  const hashPayload = `${tag}|${sortedAttrs}|${axName}`;

  // Implicit-role best effort (covers the common interactive tags).
  let role = el.getAttribute("role") || "";
  if (!role) {
    if (tag === "a" && el.hasAttribute("href")) role = "link";
    else if (tag === "button") role = "button";
    else if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      role = ({ checkbox: "checkbox", radio: "radio", button: "button", submit: "button" })[t] || "textbox";
    }
  }

  const neighbors = [];
  const pushText = (n) => {
    const t = (n && n.textContent || "").trim();
    if (t && t.length < 60) neighbors.push(t);
  };
  pushText(el.parentElement);
  pushText(el.previousElementSibling);
  pushText(el.nextElementSibling);

  return {
    role,
    name: (ariaLabel || nameAttr || (el.textContent || "").trim()).slice(0, 120),
    text: (el.textContent || "").trim().slice(0, 120),
    testid: el.getAttribute("data-testid") || "",
    anchorNeighbors: neighbors,
    _hashPayload: hashPayload,
  };
}

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
