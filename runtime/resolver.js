"use strict";

// Pure, browser-independent element resolver (Phase 8 — Final Selector Architecture).
//
// resolve() walks IdentityBundle signals in durability order and applies a strict
// uniqueness gate: it never blindly picks candidate[0]. On ambiguity it scores each
// candidate against the recorded fingerprint and only accepts a winner when its margin
// over the runner-up clears `uniqueMargin`; otherwise it falls through to the next signal.
//
// The `root` argument must expose `queryAll(selector) -> node[]`. Each node must expose
// the fingerprint-comparable getters consumed by scoreCandidate (role, name, text, testid,
// stableHash, anchorNeighbors). This keeps the module unit-testable with mock roots.

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_UNIQUE_MARGIN = 0.15;

function str(v) {
  return typeof v === "string" ? v : (v == null ? "" : String(v));
}

function norm(v) {
  return str(v).trim().toLowerCase();
}

// The compiled fingerprint's `role` is frequently the raw HTML tag (e.g. "input",
// "a", "select") rather than the computed ARIA role, while the live DOM extractor
// reports the implicit ARIA role ("textbox", "link", "combobox"). A naive string
// compare therefore reports a FALSE disagreement for every form control — which, when
// the fingerprint carries no other positive signal (empty data_testid/name/text),
// collapses the candidate's score to 0 and makes the resolver reject a uniquely
// testid-matched element. Treat tag names and their implicit roles as compatible.
const ROLE_ALIASES = {
  input:    ["textbox", "searchbox", "combobox", "spinbutton", "checkbox", "radio", "button"],
  textarea: ["textbox"],
  select:   ["combobox", "listbox"],
  a:        ["link"],
  button:   ["button"],
  img:      ["img"],
};

function roleAgrees(fpRole, nodeRole) {
  const f = norm(fpRole);
  const n = norm(nodeRole);
  if (!f || !n) return false;
  if (f === n) return true;
  if ((ROLE_ALIASES[f] || []).includes(n)) return true;
  if ((ROLE_ALIASES[n] || []).includes(f)) return true;
  return false;
}

// A "contract" signal is a structural identity that is unique by construction on a
// well-formed page (an explicit test id or a DOM id). A single such match is the
// strongest identity available — the fingerprint scorer exists to DISAMBIGUATE
// multiple matches and to guard low-durability text/xpath drift, not to VETO a unique
// contract match just because the recorded fingerprint is impoverished.
function isContractSignal(signal) {
  const engine = norm(signal && signal.engine);
  return engine === "testid" || engine === "css-id";
}

// The node positively CONTRADICTS the fingerprint only when a strong recorded field is
// present AND demonstrably different (not merely absent). Absence of agreement is not
// contradiction — that is the whole point of trusting a unique contract signal.
function contradicts(node, fingerprint) {
  const fp = fingerprint || {};
  const fpTestid = norm(fp.data_testid);
  if (fpTestid && node && norm(node.testid) && norm(node.testid) !== fpTestid) return true;
  return false;
}

// Weighted agreement between a candidate node and the recorded fingerprint.
// Returns a score in [0, 1]. Higher = stronger match.
function scoreCandidate(node, fingerprint) {
  if (!node) return 0;
  const fp = fingerprint || {};
  let score = 0;
  let weight = 0;

  const add = (w, agree) => { weight += w; if (agree) score += w; };

  const fpTestid = norm(fp.data_testid);
  if (fpTestid) add(0.30, norm(node.testid) === fpTestid);

  const fpRole = norm(fp.role);
  if (fpRole) add(0.20, roleAgrees(fp.role, node.role));

  // aria_label and name are the element's own accessible-name attributes.
  // label_text is the nearest <label>'s text — for nav buttons this is surrounding
  // context (e.g. "Projects Search CTRL + K K"), not the element's identity. Exclude it
  // from fpName so it doesn't shadow inner_text ("New") and drop the score below threshold.
  const fpName = norm(fp.aria_label || fp.name || fp.inner_text);
  if (fpName) {
    const nodeName = norm(node.name || node.text);
    add(0.25, nodeName === fpName || (!!nodeName && (nodeName.includes(fpName) || fpName.includes(nodeName))));
  }

  const fpText = norm(fp.inner_text);
  if (fpText) {
    const nodeText = norm(node.text);
    add(0.15, nodeText === fpText || (!!nodeText && nodeText.includes(fpText)));
  }

  const anchors = Array.isArray(fp.anchor_phrases) ? fp.anchor_phrases.map(norm).filter(Boolean) : [];
  if (anchors.length) {
    const neighbors = Array.isArray(node.anchorNeighbors) ? node.anchorNeighbors.map(norm) : [];
    add(0.10, anchors.some(a => neighbors.some(n => n.includes(a) || a.includes(n))));
  }

  return weight > 0 ? score / weight : 0;
}

// True when the node's stable_hash exactly matches the recorded fingerprint's.
function stableHashMatch(node, fingerprint) {
  const fp = fingerprint || {};
  return !!(fp.stable_hash && node && node.stableHash && node.stableHash === fp.stable_hash);
}

// resolve(signals, fingerprint, root, opts)
//   → { node, score, margin, signalUsed } | { miss: true } | { ambiguous: true }
function resolve(signals, fingerprint, root, opts) {
  const options = opts || {};
  const confidenceThreshold = typeof options.confidenceThreshold === "number"
    ? options.confidenceThreshold : DEFAULT_CONFIDENCE_THRESHOLD;
  const uniqueMargin = typeof options.uniqueMargin === "number"
    ? options.uniqueMargin : DEFAULT_UNIQUE_MARGIN;

  if (!root || typeof root.queryAll !== "function") return { miss: true };

  const ordered = Array.isArray(signals)
    ? signals.filter(s => s && s.selector).slice().sort((a, b) => (b.durability || 0) - (a.durability || 0))
    : [];

  let sawAmbiguous = false;

  for (const signal of ordered) {
    let candidates;
    try {
      candidates = root.queryAll(signal.selector) || [];
    } catch (_) {
      continue;
    }
    if (!candidates.length) continue;

    if (candidates.length === 1) {
      const s = scoreCandidate(candidates[0], fingerprint);
      if (s >= confidenceThreshold) {
        return { node: candidates[0], score: s, margin: 1, signalUsed: signal };
      }
      // A unique contract signal (testid / DOM id) is ground-truth identity. Accept it
      // even when the impoverished fingerprint yields no positive agreement, as long as
      // the candidate does not actively contradict the recorded element. This is what
      // keeps the zero-token primary path alive for form controls whose compiled
      // fingerprint records the tag ("input") instead of the ARIA role and omits the
      // test id — without it, every such step silently degrades onto flaky recovery.
      if (isContractSignal(signal) && !contradicts(candidates[0], fingerprint)) {
        return { node: candidates[0], score: s, margin: 1, signalUsed: signal, trustedContract: true };
      }
      continue;
    }

    // Multi-match → uniqueness gate via scored margin.
    const scored = candidates
      .map(c => ({ c, s: scoreCandidate(c, fingerprint), h: stableHashMatch(c, fingerprint) }))
      .sort((a, b) => b.s - a.s);
    const margin = scored[0].s - (scored[1] ? scored[1].s : 0);
    if (margin >= uniqueMargin && scored[0].s >= confidenceThreshold) {
      return { node: scored[0].c, score: scored[0].s, margin, signalUsed: signal };
    }
    // Tie-break: exactly one candidate's stable_hash matches the recorded element.
    const hashMatches = scored.filter(x => x.h);
    if (hashMatches.length === 1 && hashMatches[0].s >= confidenceThreshold) {
      return { node: hashMatches[0].c, score: hashMatches[0].s, margin, signalUsed: signal, stableHashTieBreak: true };
    }
    sawAmbiguous = true;
    // still ambiguous → try next signal
  }

  return sawAmbiguous ? { ambiguous: true } : { miss: true };
}

module.exports = { resolve, scoreCandidate };
