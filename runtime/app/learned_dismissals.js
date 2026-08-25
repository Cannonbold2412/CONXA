"use strict";

// Runtime-local memory of which overlay-dismissal selectors actually worked on which host.
//
// This is runtime STATE (same class as the browser session cache), not pack mutation:
// execution.json and every signed artifact stay untouched, entries expire, counts are
// capped, and an entry is only ever TRIED on the host it was learned on. Consumption is
// still gated at use time — the candidate must exist on the live page and click cleanly,
// exactly like the static known-pattern list in dismiss_patterns.js.
//
// Today the only writer is the Tier 1 ladder itself (a known-pattern success refreshes its
// entry so repeat visits skip straight to it). The planned Tier 3+ hook — "the agent's
// recovery pick dismissed an INTERCEPTED overlay" — will call record() with these same
// guard rails; that is what turns a paid first fix into free replays (TODO.md EXEC-5).

const fs = require("fs");
const path = require("path");

const STORE_FILENAME = "learned_overlays.json";
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES_PER_HOST = 10;
const MAX_HOSTS = 50;
const MAX_SELECTOR_LEN = 200;

function defaultStorePath() {
  // server.js resolves and re-exports CONXA_DATA_DIR before any run starts; when unset
  // (some unit tests, odd embedding) the store is simply disabled rather than guessed at.
  const dir = process.env.CONXA_DATA_DIR || null;
  return dir ? path.join(dir, STORE_FILENAME) : null;
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

function prune(store, now) {
  const out = {};
  let hosts = 0;
  for (const host of Object.keys(store)) {
    const entries = (Array.isArray(store[host]) ? store[host] : [])
      .filter(e => e && typeof e.selector === "string" && e.selector.length > 0
        && e.selector.length <= MAX_SELECTOR_LEN)
      .map(e => ({ selector: e.selector, ts: Number(e.ts) || now, hits: Math.max(1, Number(e.hits) || 1) }))
      .filter(e => now - e.ts <= ENTRY_TTL_MS)
      .sort((a, b) => b.hits - a.hits || b.ts - a.ts)
      .slice(0, MAX_ENTRIES_PER_HOST);
    if (!entries.length || hosts >= MAX_HOSTS) continue;
    out[host] = entries;
    hosts++;
  }
  return out;
}

function load(filePath = defaultStorePath()) {
  if (!filePath) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return prune(parsed && typeof parsed === "object" ? parsed : {}, Date.now());
  } catch (_) {
    return {};
  }
}

function save(store, filePath = defaultStorePath()) {
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, filePath); // atomic on same volume — never a half-written store
    return true;
  } catch (_) {
    return false;
  }
}

// Ordered candidate selectors learned for this URL's host (most-hit first).
function selectorsFor(url, filePath = defaultStorePath()) {
  const host = hostOf(url);
  if (!host) return [];
  return load(filePath)[host]?.map(e => e.selector) ?? [];
}

// Record/refresh a successful dismissal. `url` is the page the success happened on; the
// entry is scoped to its hostname so a pattern proven on one site is never tried on another.
function record(url, selector, filePath = defaultStorePath()) {
  if (!filePath) return false;
  const sel = String(selector || "");
  const host = hostOf(url);
  if (!host || !sel || sel.length > MAX_SELECTOR_LEN) return false;
  const store = load(filePath);
  const list = Array.isArray(store[host]) ? store[host] : [];
  const now = Date.now();
  const existing = list.find(e => e.selector === sel);
  const entry = existing
    ? { selector: sel, ts: now, hits: existing.hits + 1 }
    : { selector: sel, ts: now, hits: 1 };
  store[host] = [entry, ...list.filter(e => e.selector !== sel)];
  save(prune(store, now), filePath);
  return true;
}

module.exports = { defaultStorePath, hostOf, load, save, selectorsFor, record, STORE_FILENAME, ENTRY_TTL_MS, MAX_ENTRIES_PER_HOST, MAX_HOSTS };
