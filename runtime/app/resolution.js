"use strict";
// Target/frame resolution seam, extracted from run.js: frame-root walking,
// primary identity-bundle resolution, the pre-action GATE, the agent-override
// uniqueness gate, and the frame-scoped DOM inventory used by failure payloads.
const pageScripts = require("./page_scripts");
const { resolve: resolveSignals, scoreCandidate, DEFAULT_UNIQUE_MARGIN, DEFAULT_CONFIDENCE_THRESHOLD } = require("./resolver");
const { gatherCandidates, bundleFingerprint, _extractDescriptor } = require("./resolve_adapter");
const { STALE_RE } = require("./recovery");
const { interpolate } = require("./interpolate");
const { envNumber } = require("./run_config");
const { unique, asObject, asArray } = require("./step_utils");

// Frame roots are driven solely by identity_bundle.frame_chain (durability-ranked signals per
// iframe level). Each frame signal selector is a CSS attribute selector (iframe[name=…] etc.),
// so it feeds frameLocator() directly.
//
// Async because it must actually VERIFY each iframe element exists (root.locator(selector).count())
// before descending into it with frameLocator() — frameLocator() itself is lazy and happily hands
// back a usable-looking FrameLocator for a selector that matches nothing, so relying on it alone
// can never distinguish "the frame is gone/churned to a new identity" from "the frame exists and
// has content" (confirmed: a synthetic test with a frame_chain selector matching no real iframe
// still produced a non-empty roots array before this check was added, since frameLocator()
// construction never fails on its own).
async function rootCandidates(page, step, inputs) {
  const frameChain = asArray(asObject(step && step.identity_bundle).frame_chain);
  if (!frameChain.length) return [page];

  let roots = [page];
  for (const frameSpec of frameChain) {
    const sigs = asArray(frameSpec.signals)
      .filter(s => s && s.selector)
      .sort((a, b) => (b.durability || 0) - (a.durability || 0));
    const next = [];
    for (const root of roots) {
      if (!root || typeof root.frameLocator !== "function") continue;
      for (const s of sigs) {
        const selector = interpolate(String(s.selector), inputs);
        let exists = false;
        try { exists = (await root.locator(selector).count()) > 0; } catch (_) { exists = false; }
        if (!exists) continue;
        next.push(root.frameLocator(selector));
      }
    }
    roots = next;
    if (!roots.length) break;
  }

  // A non-empty frame_chain that resolved to zero roots means the containing iframe itself
  // could not be located (e.g. its identifying attribute churned to a new value on reattach).
  // This must NOT silently fall back to the top-level page — a same-selector element there
  // could be wrongly acted on in place of a target that actually lives in a frame we lost
  // track of. Return [] (distinct from the "no frame_chain at all" case above, which correctly
  // returns [page]) so callers can diagnose "frame not found" instead of a generic miss.
  return roots;
}

// True only when the step's own frame_chain exists but rootCandidates() came back empty — i.e.
// the frame lookup itself failed, not just "no frame_chain to resolve" (that returns [page]).
function isFrameNotFound(step, roots) {
  return asArray(asObject(step && step.identity_bundle).frame_chain).length > 0 && roots.length === 0;
}

async function locatorCandidates(page, step, inputs, selector) {
  const resolved = interpolate(selector || "", inputs);
  if (!resolved) return [];
  const roots = await rootCandidates(page, step, inputs);
  return roots.map(root => root.locator(resolved));
}

// Sentinel selector marking "resolve the step's primary target via identity_bundle.signals".
const PRIMARY = Symbol("primary-target");

// Resolve the step's primary target through the pure resolver over the live DOM.
// Returns a single Playwright locator for the chosen element, or throws a classified error.
async function resolveStep(page, step, inputs) {
  const bundle = asObject(step.identity_bundle);
  const signals = asArray(bundle.signals).filter(s => s && s.selector);
  if (!signals.length) {
    throw Object.assign(
      new Error("Step has no identity_bundle.signals — pack must be recompiled"),
      { recompileRequired: true },
    );
  }
  const roots = await rootCandidates(page, step, inputs);
  if (isFrameNotFound(step, roots)) {
    throw Object.assign(
      new Error("Containing frame could not be located (identity may have changed)"),
      { frameNotFound: true },
    );
  }
  const map = await gatherCandidates(roots, signals, interpolate, inputs);
  const fp = bundleFingerprint(bundle);
  const result = resolveSignals(signals, fp, { queryAll: sel => map[sel] || [] }, {});
  if (result && result.node && result.node._loc) {
    return result.node._loc;
  }
  if (result && result.ambiguous) {
    throw Object.assign(new Error("Ambiguous element resolution (no signal cleared uniqueness gate)"), { ambiguous: true });
  }
  throw Object.assign(new Error("Element not found (resolve miss)"), { resolveMiss: true });
}

const GATE_ENABLED = process.env.CONXA_GATE !== "0";
const GATE_BUDGET_MS = envNumber("CONXA_GATE_BUDGET_MS", 600);

// Phase 8: pre-action GATE — confirm the element is attached, visible, RAF-stable, and enabled
// before acting. Budget is confidence-adaptive (a high-confidence step gets a shorter wait).
// Best-effort: gate failures throw so the caller can try the next candidate / recovery.
async function gateLocator(loc, step) {
  if (!GATE_ENABLED) return;
  const conf = Number(asObject(step).confidence);
  const budget = Number.isFinite(conf) && conf >= 0.85
    ? Math.round(GATE_BUDGET_MS / 2)
    : GATE_BUDGET_MS;

  await loc.waitFor({ state: "visible", timeout: budget });

  // RAF-stable: bounding box must be unchanged across two animation frames.
  try {
    const stable = await loc.evaluate(pageScripts.rafStable);
    if (!stable) {
      await loc.waitFor({ state: "visible", timeout: budget }); // settle once more
    }
  } catch (_) {
    // evaluate may fail on detach — let the action path surface the real error.
  }

  // Enabled: reject disabled / aria-disabled controls.
  try {
    const disabled = await loc.evaluate(pageScripts.isDisabled);
    if (disabled) throw new Error("Element is disabled");
  } catch (err) {
    const msg = String((err && err.message) || "");
    // A detach here means the element vanished between the RAF-stability check and
    // this one — the caller must see that, not proceed to act on a stale locator.
    if (err && (/disabled/i.test(msg) || STALE_RE.test(msg.toLowerCase()))) throw err;
  }
}

// The override gate deliberately reuses resolver.js's exact default margin/threshold
// values (now imported, not locally copied — a silent drift between the two would
// loosen the "never pick candidate[0]" invariant on one edge but not the other).
// The semantics differ (single ad-hoc selector vs resolve()'s signal walk), only
// the numbers are shared.
const OVERRIDE_UNIQUE_MARGIN = DEFAULT_UNIQUE_MARGIN;
const OVERRIDE_CONFIDENCE_THRESHOLD = DEFAULT_CONFIDENCE_THRESHOLD;

// Validates an agent-supplied recovery selector (`step._explicit_selector` + `_agent_override`)
// against the step's recorded fingerprint before it is allowed to act. Extends the "resolver
// never blindly picks candidate[0]" invariant (resolver.js) to the Tier 3/4 closing edge —
// without this, a multi-match override selector silently acted on whatever `.first()` returned.
async function validateOverrideSelector(page, step, inputs) {
  const selector = interpolate(step._explicit_selector || "", inputs);
  if (!selector) return { valid: false, reason: "missing-selector", candidates: [] };

  const roots = await rootCandidates(page, step, inputs);
  if (isFrameNotFound(step, roots)) {
    // Distinct from "no-match": the agent's selector was never even tried, because the
    // containing frame itself couldn't be located — telling the agent "no element matched"
    // here would be misleading (it would keep proposing element selectors forever, when the
    // real problem is the frame is gone/changed identity).
    return { valid: false, reason: "frame-not-found", candidates: [] };
  }

  const descriptors = [];
  for (const root of roots) {
    let all;
    try { all = await root.locator(selector).all(); } catch (_) { continue; }
    for (const item of all) {
      let d;
      try { d = await item.evaluate(_extractDescriptor); } catch (_) { continue; }
      if (!d) continue;
      d._loc = item;
      descriptors.push(d);
    }
  }

  if (!descriptors.length) return { valid: false, reason: "no-match", candidates: [] };
  if (descriptors.length === 1) return { valid: true, loc: descriptors[0]._loc };

  const fp = bundleFingerprint(asObject(step.identity_bundle));
  const scored = descriptors
    .map(d => ({ d, s: scoreCandidate(d, fp) }))
    .sort((a, b) => b.s - a.s);
  const margin = scored[0].s - (scored[1] ? scored[1].s : 0);
  if (margin >= OVERRIDE_UNIQUE_MARGIN && scored[0].s >= OVERRIDE_CONFIDENCE_THRESHOLD) {
    return { valid: true, loc: scored[0].d._loc };
  }
  return {
    valid: false,
    reason: "ambiguous",
    candidates: descriptors.slice(0, 20).map(d => ({ role: d.role, name: d.name, text: d.text, testid: d.testid })),
  };
}

const FRAME_INVENTORY_CAP = 50;
const FRAME_INVENTORY_PER_ROOT_CAP = 25;

// Frame-scoped counterpart of pageScripts.domInventory() — for a step whose target lives inside
// an iframe, document.querySelectorAll (what domInventory runs) cannot see into it at all, so
// the Tier 3+ agent's "ground truth" inventory would silently omit everything in that frame.
// Gathers the same kind of interactive-element summary, scoped to the step's own resolved frame
// chain, using the same Locator-based pattern resolve_adapter.js already uses for candidate
// gathering (root.locator(...).all() + per-item .evaluate()) — FrameLocator has no direct
// raw-Frame conversion, so this is the correct mechanism, not a workaround.
// Returns null when the step has no frame_chain (nothing extra to gather) or the frame couldn't
// be located at all (a distinct "frame not found" condition surfaced separately — see
// isFrameNotFound/frameNotFound — not silently reported as an empty inventory).
async function frameScopedInventory(page, step, inputs) {
  const frameChain = asArray(asObject(step && step.identity_bundle).frame_chain);
  if (!frameChain.length) return null;

  const roots = await rootCandidates(page, step, inputs);
  if (!roots.length) return null;

  const seen = new Set();
  const out = [];
  for (const root of roots) {
    if (out.length >= FRAME_INVENTORY_CAP) break;
    let items;
    try { items = await root.locator(pageScripts.INVENTORY_SELECTOR).all(); } catch (_) { continue; }
    for (const item of items.slice(0, FRAME_INVENTORY_PER_ROOT_CAP)) {
      if (out.length >= FRAME_INVENTORY_CAP) break;
      let entry;
      try { entry = await item.evaluate(pageScripts.inventoryEntryForElement); } catch (_) { continue; }
      if (!entry) continue;
      const key = `${entry.tag}|${entry.type || ""}|${entry.text || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

// Capture the interactive-element inventory at the exact moment of step failure, before the
// T1/T2 recovery cascade runs (~12 s). Transient elements like open dropdown menus auto-close
// during the cascade, leaving _buildFailureResponse with an empty DOM scan. Storing the snapshot
// on the error object lets _buildFailureResponse prefer it over a stale post-cascade query.
// Merges in the frame-scoped inventory (tagged in_frame: true) when the step targets an iframe.
async function captureEarlyDomSnapshot(page, step, inputs) {
  let top;
  try {
    top = await page.evaluate(pageScripts.domInventory);
  } catch (_) {
    return null;
  }
  if (!Array.isArray(top)) return null;
  let frameEntries = null;
  try { frameEntries = await frameScopedInventory(page, step, inputs); } catch (_) { frameEntries = null; }
  if (Array.isArray(frameEntries) && frameEntries.length) {
    return [...top, ...frameEntries.map(e => ({ ...e, in_frame: true }))];
  }
  return top;
}

module.exports = {
  PRIMARY,
  unique,
  asObject,
  asArray,
  rootCandidates,
  isFrameNotFound,
  locatorCandidates,
  resolveStep,
  gateLocator,
  validateOverrideSelector,
  frameScopedInventory,
  captureEarlyDomSnapshot,
};
