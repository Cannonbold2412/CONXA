"use strict";

// Functions Playwright serializes via page.evaluate()/locator.evaluate() and runs inside the
// browser page realm (Function.prototype.toString(), re-parsed in-page — NOT in this Node
// process). Each export below must stay fully self-contained: no closures over module-scope
// vars, no calls into other app modules. That constraint is also why this file is obfuscated
// with --string-array/--self-defending OFF in the build scripts (build-runtime-app.yml,
// build-app-local.ps1) while the rest of the app layer keeps full obfuscation: those two
// transforms rewrite a function body to reference a module-scope decoder/guard var, which does
// not exist once the source is re-parsed in the browser — see the scroll ReferenceError this
// file was extracted to fix.

// ── Page-side fingerprint extractor ─────────────────────────────────────────
// Returns the comparable attributes for one candidate element plus the stable-hash payload
// string. The payload mirrors compiler/stable_hash.py so the Node-side SHA256 (resolve_adapter.js)
// matches the compiled stable_hash when the recorded attributes match.
function extractDescriptor(el) {
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

  // Implicit-role best effort. This must cover every tag the compiler can record a role for,
  // not just the interactive ones: resolver.js's roleAgrees() returns false whenever EITHER
  // side is empty, so a tag missing here scores 0 against a fingerprint that names its role —
  // which silently vetoes an otherwise correctly-matched candidate. A bare <img> hit exactly
  // that: the compiled fingerprint said role "img", this said "", and the one structural
  // signal that DID find the element was rejected below the confidence threshold.
  let role = el.getAttribute("role") || "";
  if (!role) {
    if (tag === "a" && el.hasAttribute("href")) role = "link";
    else if (tag === "button") role = "button";
    else if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      role = ({ checkbox: "checkbox", radio: "radio", button: "button", submit: "button" })[t] || "textbox";
    }
    else if (tag === "img") role = "img";
    else if (tag === "textarea") role = "textbox";
    else if (tag === "select") role = el.hasAttribute("multiple") ? "listbox" : "combobox";
    else if (/^h[1-6]$/.test(tag)) role = "heading";
    else if (tag === "nav") role = "navigation";
    else if (tag === "main") role = "main";
  }

  const neighbors = [];
  const pushText = (n) => {
    const t = (n && n.textContent || "").trim();
    if (t && t.length < 60) neighbors.push(t);
  };
  pushText(el.parentElement);
  pushText(el.previousElementSibling);
  pushText(el.nextElementSibling);

  // `name` feeds resolver.js's fpName match — placeholder is included so a live candidate
  // for a label-less input (e.g. a search box) can still match a fingerprint the compiler
  // named from its placeholder (identity_bundle.py's aria_label||name||inner_text||placeholder).
  // `_hashPayload`/axName above deliberately excludes it — that mirrors stable_hash.py's
  // narrower ax_name (aria_label||name||inner_text) and must not drift from it.
  // alt/title mirror identity_bundle.py's _accessible_name — an <img>'s only real name is
  // its alt, so without them a live image candidate could never match a fingerprint named
  // from one.
  const placeholder = el.getAttribute("placeholder") || "";
  const altAttr = el.getAttribute("alt") || "";
  const titleAttr = el.getAttribute("title") || "";
  return {
    role,
    name: (ariaLabel || nameAttr || altAttr || titleAttr || (el.textContent || "").trim() || placeholder).slice(0, 120),
    text: (el.textContent || "").trim().slice(0, 120),
    testid: el.getAttribute("data-testid") || el.getAttribute("data-test-id") || "",
    anchorNeighbors: neighbors,
    _hashPayload: hashPayload,
  };
}

// RAF-stable check: bounding box must be unchanged across two animation frames.
function rafStable(el) {
  return new Promise(resolve => {
    const r1 = el.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r2 = el.getBoundingClientRect();
      resolve(Math.abs(r1.x - r2.x) < 1 && Math.abs(r1.y - r2.y) < 1
        && Math.abs(r1.width - r2.width) < 1 && Math.abs(r1.height - r2.height) < 1);
    }));
  });
}

function isDisabled(el) {
  return el.disabled === true || el.getAttribute("aria-disabled") === "true";
}

function scrollBy([x, y]) {
  window.scrollBy(x, y);
}

function getScrollY() {
  return window.scrollY;
}

// Cheap, deterministic snapshot of page shape used only to answer "did anything happen" for the
// state_changed assertion. No LLM, no DOM diffing — three counters compared before vs. after.
function preStepSignature(sel) {
  return {
    textLen: (document.body && document.body.innerText || "").length,
    interactiveCount: document.querySelectorAll(sel).length,
  };
}

// Page fingerprint used by server.js for change detection.
function pageFingerprint() {
  return {
    interactiveCount: document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="link"]'
    ).length,
    text: (document.body && document.body.innerText || "").slice(0, 5000),
  };
}

// Selector shared by domInventory() (top-level document) and inventoryEntryForElement() (a
// single element already matched inside a frame — see run.js's frame-scoped inventory helper).
// Duplicated as a literal string in both call sites below rather than a shared const: these
// functions are serialized via Function.prototype.toString() and re-parsed standalone in the
// browser page realm (see file header) — they cannot close over module-scope values.
const INVENTORY_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]';

// Interactive-element inventory — shared by run.js's early-failure snapshot and server.js's
// post-cascade "current inventory" for Tier 3+ recovery context. Top-level document only; for a
// step whose target lives inside an iframe, run.js additionally gathers a frame-scoped inventory
// via inventoryEntryForElement() below (document.querySelectorAll cannot see into iframes).
function domInventory() {
  const seen = new Set();
  return Array.from(document.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]'
  )).map(el => {
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80);
    const tag  = el.tagName.toLowerCase();
    const type = el.getAttribute("type")        || "";
    const role = el.getAttribute("role")        || "";
    const id   = el.id                          || undefined;
    const dt   = el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined;
    const key  = `${tag}|${type}|${text}`;
    if (!text && !type && !id && !dt) return null;
    if (seen.has(key)) return null;
    seen.add(key);
    return { tag, type: type || undefined, role: role || undefined, text: text || undefined, id, "data-testid": dt };
  }).filter(Boolean).slice(0, 50);
}

// Per-element counterpart of domInventory(), for elements already matched inside a specific
// frame (run.js resolves the frame via rootCandidates()/frameLocator, then calls this via
// locator.evaluate() on each matched element — the same per-item pattern resolve_adapter.js
// already uses for candidate gathering). Field logic must stay identical to domInventory()'s
// per-element body above; returns null (skip) for elements with no identifying signal, same as
// domInventory() — dedup across elements is the caller's job since this only sees one at a time.
function inventoryEntryForElement(el) {
  const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80);
  const tag  = el.tagName.toLowerCase();
  const type = el.getAttribute("type")        || "";
  const role = el.getAttribute("role")        || "";
  const id   = el.id                          || undefined;
  const dt   = el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined;
  if (!text && !type && !id && !dt) return null;
  return { tag, type: type || undefined, role: role || undefined, text: text || undefined, id, "data-testid": dt };
}

// EXEC-30 — live overlay probe. domInventory() truncates at 50 entries IN DOM ORDER, so a modal
// appended late to <body> can be cut out entirely even though it is the only thing blocking the
// step. This answers "is something sitting on top of the page right now" directly, independent of
// inventory order, and also catches the case where an overlay HIDES the target rather than
// intercepting a click (which never throws INTERCEPTED at all).
// ponytail: three hit-test points (center, top-center, bottom-center), not a full z-order sweep —
// upgrade to a denser grid if a real overlay is ever missed by all three.
function overlayProbe() {
  const DIALOG_SEL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal';
  const vw = window.innerWidth, vh = window.innerHeight;
  const points = [[vw / 2, vh / 2], [vw / 2, vh * 0.15], [vw / 2, vh * 0.85]];

  function isOverlayish(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.matches && el.matches(DIALOG_SEL)) return true;
    const cs = window.getComputedStyle(el);
    return cs.position === "fixed" || cs.position === "sticky";
  }

  function outermostOverlay(startEl) {
    let found = null;
    let el = startEl;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isOverlayish(el)) found = el; // keep walking — want the OUTERMOST match
      el = el.parentElement;
    }
    return found;
  }

  let container = null;
  for (const [x, y] of points) {
    const hit = document.elementFromPoint(x, y);
    const candidate = outermostOverlay(hit);
    if (candidate) { container = candidate; break; }
  }
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const coverage = (Math.max(0, rect.width) * Math.max(0, rect.height)) / (vw * vh);
  if (coverage < 0.05) return null; // a slim sticky header is not "the story"

  const controls = Array.from(container.querySelectorAll(
    'button, a[href], input, [role="button"], [role="link"]'
  )).slice(0, 15).map(el => {
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80);
    const tag  = el.tagName.toLowerCase();
    const type = el.getAttribute("type")        || "";
    const role = el.getAttribute("role")        || "";
    const id   = el.id                          || undefined;
    const dt   = el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined;
    if (!text && !type && !id && !dt) return null;
    return { tag, type: type || undefined, role: role || undefined, text: text || undefined, id, "data-testid": dt };
  }).filter(Boolean);

  return {
    container: {
      tag: container.tagName.toLowerCase(),
      id: container.id || undefined,
      class: container.className && typeof container.className === "string" ? container.className.slice(0, 120) : undefined,
      role: container.getAttribute("role") || undefined,
      text: (container.innerText || "").trim().slice(0, 120),
    },
    controls,
  };
}

module.exports = {
  extractDescriptor,
  rafStable,
  isDisabled,
  scrollBy,
  getScrollY,
  preStepSignature,
  pageFingerprint,
  domInventory,
  inventoryEntryForElement,
  overlayProbe,
  INVENTORY_SELECTOR,
};
