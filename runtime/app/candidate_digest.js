"use strict";
/**
 * candidate_digest.js — browser-use-style indexed candidate digest for Tier 3
 * (semantic) recovery.
 *
 * browser-use grounds its LLM by serializing every interactive element into a
 * numbered list ("[12] button 'Submit'") and letting the model answer with an
 * INDEX instead of a selector string. We adopt that presentation for Tier 3,
 * with two deliberate departures documented in research-analysis/
 * (01-external-research/repos/browser-use.md, 05-reliability/per-tool/browser-use.md):
 *
 *   • Rank-then-cap, never positional truncation. browser-use blindly cuts its
 *     serialization at max_clickable_elements_length (40k chars) — the flagged
 *     anti-pattern. We rank candidates against the RECORDED TARGET's identity
 *     signals first, then fill the same 40k-char budget with the top-ranked
 *     entries, stopping cleanly before the entry that would overflow it.
 *
 *   • The integer index is a transient prompt convenience only — never durable
 *     identity (browser-use's ephemeral-selector_map anti-pattern). Durable
 *     identity stays the compiled IdentityBundle. When Claude nominates an
 *     index, we resolve it to a derived selector and push that through
 *     validateOverrideSelector's uniqueness-margin gate (resolution.js) before
 *     anything acts on it — the "never blindly pick candidate[0]" invariant
 *     extends to LLM-nominated candidates rather than being bypassed by them.
 *
 * Pure functions over plain data — no browser, fully unit-testable.
 */

// Same character budget browser-use uses for its serialized DOM state
// (max_clickable_elements_length). Applied AFTER ranking, whole-entry only.
const DIGEST_CHAR_BUDGET = 40000;

// Longest live label rendered in a digest line, to keep single rows bounded.
const MAX_TEXT_IN_LINE = 60;

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

function tokens(value) {
  return norm(value).split(/[^a-z0-9]+/).filter(Boolean);
}

// How much of `needle`'s token set appears in `haystack` — 1 when every token
// occurs. Asymmetric on purpose: the recorded target text ("purchase now")
// should count as fully contained in a longer live label ("Purchase your
// order now"), but not vice versa.
function affinity(needle, haystack) {
  const nts = [...new Set(tokens(needle))];
  if (!nts.length) return 0;
  const hay = new Set(tokens(haystack));
  let hits = 0;
  for (const t of nts) if (hay.has(t)) hits++;
  return hits / nts.length;
}

/**
 * Score one inventory entry ({tag,type,role,text,id,"data-testid"}) against
 * the recorded target's identity signals. Deliberately simple additive
 * scoring: this RANKS PROMPT CANDIDATES for an LLM to choose from — it never
 * decides actions; the uniqueness-margin gate owns resolution.
 */
function scoreCandidateEntry(entry, target) {
  if (!entry || !target) return 0;
  let score = 0;

  const eTestid = entry["data-testid"] || "";
  if (target.data_testid && eTestid && eTestid === target.data_testid) score += 100;
  if (target.id && entry.id && entry.id === target.id) score += 90;

  // Anchors are compile-time human-readable descriptions ("Close button, red,
  // top-right") written to survive UI drift — they outrank the fingerprint's
  // possibly-stale inner_text only by ORDER of the tie-break below, since a
  // stale inner_text that still matches is worth as much as a matching anchor.
  const needles = [...(Array.isArray(target.anchors) ? target.anchors : []), target.text]
    .filter((s) => typeof s === "string" && s.trim());
  let bestAffinity = 0;
  for (const needle of needles) {
    bestAffinity = Math.max(bestAffinity, affinity(needle, entry.text || ""));
  }
  score += 50 * bestAffinity;

  if (target.role && entry.role && norm(target.role) === norm(entry.role)) score += 15;
  if (target.tag && entry.tag && norm(target.tag) === norm(entry.tag)) score += 8;

  return score;
}

function truncateLabel(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > MAX_TEXT_IN_LINE ? `${t.slice(0, MAX_TEXT_IN_LINE)}…` : t;
}

function formatDigestLine(index, entry) {
  const bits = [String(entry.tag || "?")];
  // EXEC-30: tag a control the live overlay probe found so the agent can spot a dismiss
  // candidate at a glance instead of hunting through the whole ranked list for one.
  if (entry.in_overlay) bits.push("[overlay]");
  if (entry.type) bits.push(`type=${entry.type}`);
  if (entry.role) bits.push(`role=${entry.role}`);
  if (entry["data-testid"]) bits.push(`testid=${entry["data-testid"]}`);
  if (entry.id) bits.push(`#${entry.id}`);
  const label = truncateLabel(entry.text);
  if (label) bits.push(`"${label}"`);
  return `[${index}] ${bits.join(" ")}`;
}

// Strip characters that would break the quoted Playwright selector engines —
// a derived selector here only has to be GOOD ENOUGH for the validation gate
// to try; it never ships anywhere durable.
function selectorSafe(text) {
  return String(text || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Derive the best-effort Playwright selector for an indexed entry, in the same
 * preference order the recovery prompts advertise:
 * [data-testid] > #id > internal:role=<role>[name="…"] > text="…".
 * Returns null when the entry carries no signal a selector can be derived from
 * (such an index must not be offered for nomination).
 */
function deriveSelectorForEntry(entry) {
  if (!entry) return null;
  const dt = entry["data-testid"];
  if (dt) return `[data-testid="${selectorSafe(dt)}"]`;
  if (entry.id) return `#${selectorSafe(entry.id)}`;
  const role = selectorSafe(entry.role);
  const name = selectorSafe(entry.text);
  if (role && name) return `internal:role=${role}[name="${name}"]`;
  if (name) return `text="${name}"`;
  return null;
}

/**
 * Build the ranked, indexed digest text + the { index → derived selector }
 * nomination map from a live interactive-element inventory.
 *
 * @param {Array<{tag,type,role,text,id,"data-testid"}>} inventory
 * @param {{tag?,role?,text?,data_testid?,id?,anchors?:string[]}} target recorded-target signals
 * @returns {{ text: string, map: Object.<string,{selector:string,score:number}>, total: number, shown: number }}
 */
function buildIndexedDigest(inventory, target) {
  const items = Array.isArray(inventory) ? inventory.filter(Boolean) : [];
  const scored = items
    .map((entry, originalIndex) => ({
      entry,
      score: scoreCandidateEntry(entry, target),
      originalIndex,
    }))
    .sort((a, b) => (b.score - a.score) || (a.originalIndex - b.originalIndex));

  const lines = [];
  const map = {};
  let usedChars = 0;
  let index = 0;
  for (const { entry, score } of scored) {
    if (!deriveSelectorForEntry(entry)) continue;
    const line = formatDigestLine(index, entry);
    if (usedChars + line.length + 1 > DIGEST_CHAR_BUDGET) break; // whole-entry only
    lines.push(line);
    usedChars += line.length + 1;
    map[String(index)] = { selector: deriveSelectorForEntry(entry), score };
    index++;
  }

  return { text: lines.join("\n"), map, total: items.length, shown: index };
}

module.exports = {
  DIGEST_CHAR_BUDGET,
  MAX_TEXT_IN_LINE,
  affinity,
  scoreCandidateEntry,
  formatDigestLine,
  deriveSelectorForEntry,
  buildIndexedDigest,
};
