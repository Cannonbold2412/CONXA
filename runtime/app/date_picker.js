"use strict";
// Pure date-picker replay math, extracted the same way resolver.js is kept separate from
// resolve_adapter.js: nothing here touches Playwright or the live page, so it's unit-testable
// without a browser. handlers.js's date_pick handler is the adapter that turns these into actual
// locators/clicks — see CLAUDE.md's date-picker plan for the full design.
//
// English-only header parsing is a deliberate, documented limitation (test sites and the common
// case are English) — not a correctness ceiling for the feature as a whole, since the typed-first
// attempt in handlers.js never needs the header at all, and only the grid fallback does.

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** "2026-09-15" or "2026-09-15T14:30" -> {year, month, day, hour, minute} (hour/minute null for
 * a date-only value). Returns null for anything else — the caller must never guess a date. */
function parseDateValue(raw) {
  const m = ISO_RE.exec(String(raw || "").trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] != null ? Number(m[4]) : null,
    minute: m[5] != null ? Number(m[5]) : null,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Render `parsed` through a compile-time-inferred format template ("MM/DD/YYYY"). Returns null
 * when there's no format to render through — the caller falls back to the grid strategy instead
 * of guessing a separator/order. */
function formatForDisplay(parsed, displayFormat) {
  if (!displayFormat || !parsed) return null;
  let out = displayFormat;
  if (out.includes("YYYY")) out = out.replace("YYYY", String(parsed.year));
  else if (out.includes("YY")) out = out.replace("YY", pad2(parsed.year % 100));
  if (out.includes("MM")) out = out.replace("MM", pad2(parsed.month));
  if (out.includes("DD")) out = out.replace("DD", pad2(parsed.day));
  return out;
}

/** "September 2026" / "Sep 2026" / "2026 Sep" / "09/2026" / "2026-09" -> {year, month}. */
function parseHeader(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  for (let i = 0; i < MONTHS.length; i++) {
    const abbr = MONTHS[i].slice(0, 3);
    const re = new RegExp(`\\b${abbr}[a-z]*\\b`);
    if (re.test(t)) {
      const yearMatch = t.match(/\d{4}/);
      if (yearMatch) return { year: Number(yearMatch[0]), month: i + 1 };
    }
  }
  let m = t.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (m) return { year: Number(m[2]), month: Number(m[1]) };
  m = t.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  return null;
}

/** How many next(+)/prev(-) clicks to get from the header's current month to the target month.
 * Null when the header can't be parsed — the caller must not guess a click count either. */
function monthDelta(headerText, targetYear, targetMonth) {
  const from = parseHeader(headerText);
  if (!from) return null;
  return (targetYear - from.year) * 12 + (targetMonth - from.month);
}

// Machine-readable attributes buildDateContext (bridge.js) knows how to parse a date out of.
// Mirrors bridge.js's _CELL_DATE_ATTRS exactly — anything outside this list (aria-label/title
// sentences) can't be regenerated for a different date without knowing the site's phrasing, so
// the runtime never tries; see dayNumberSelector's :text-is fallback instead.
const MACHINE_CELL_ATTRS = new Set(["data-date", "datetime", "data-day", "data-value"]);

/** `[data-date="2026-09-15"]`-shaped selector for the target date, or null when the recorded
 * cell wasn't identified through one of the machine-readable attributes. */
function machineCellSelector(cellAttr, iso) {
  if (!cellAttr || !MACHINE_CELL_ATTRS.has(cellAttr) || !iso) return null;
  return `[${cellAttr}="${iso}"]`;
}

// Locale/library-agnostic fallback: match by the cell's own exact day-number text (Playwright's
// :text-is() — not standard CSS — matches an element's own trimmed text, not a descendant's),
// excluding anything that reads as disabled or belonging to the adjacent month. This is the fix
// for the "text=15 also matches the greyed-out day from next month" ambiguity that makes a plain
// text selector useless for calendar grids.
function dayNumberSelector(day) {
  const exclude = [
    '[aria-disabled="true"]', '[aria-hidden="true"]',
    '[class*="disabled" i]', '[class*="outside" i]', '[class*="other-month" i]',
    '[class*="prev-month" i]', '[class*="next-month" i]', '[class*="adjacent" i]',
  ].map(sel => `:not(${sel})`).join("");
  return `${exclude}:text-is("${day}")`;
}

// 1 -> "January" ... 12 -> "December". For selectOption({label}) against a year/month <select>
// (react-datepicker's showMonthDropdown mode and equivalents) — deliberately by LABEL, not by
// the option's raw value: react-datepicker's own month values are 0-indexed, other libraries use
// 1-indexed or the month name itself as the value, and there is no reliable way to tell which
// without reading the site's source. Every one of those libraries still renders a human-readable
// English month name as the option's visible text, so matching on that sidesteps the indexing
// question entirely.
function monthLabel(month) {
  const name = MONTHS[month - 1];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

module.exports = {
  parseDateValue,
  formatForDisplay,
  parseHeader,
  monthDelta,
  machineCellSelector,
  dayNumberSelector,
  monthLabel,
  MAX_NAV_CLICKS: 24,
};
