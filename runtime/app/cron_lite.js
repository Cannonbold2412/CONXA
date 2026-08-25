"use strict";
/**
 * cron_lite.js — minimal 5-field cron parser + next-occurrence calculator for the
 * PROD-5 scheduler daemon (runtime/app/scheduler_daemon.js). Hand-rolled on purpose:
 * a cron dependency would need pkg-bundling review and IT-security disclosure for
 * ~150 lines of pure logic that unit-tests fully offline.
 *
 * Supported syntax: "m h dom mon dow" with "*", numbers, ranges (a-b), lists
 * (a,b,c), and steps (* / n, a-b/n, a/n). Day-of-week accepts 0-7 with 7 normalized
 * to 0 (Sunday), matching standard cron. Presets: @hourly @daily @midnight @weekly
 * @monthly @yearly @annually.
 *
 * Semantics follow Vixie cron: when BOTH dom and dow are restricted, a day matches
 * if EITHER matches; when one is restricted only it is consulted. All arithmetic is
 * local time; nextAfter() recomputes from the wall clock every call, which makes DST
 * transitions safe by construction (a 02:30 daily job simply fires at the first
 * matching local minute after the gap).
 */

const PRESETS = {
  "@hourly":   "0 * * * *",
  "@daily":    "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly":   "0 0 * * 0",
  "@monthly":  "0 0 1 * *",
  "@yearly":   "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

// Field spec: [name, min, max, isDow]. Month/dow are kept in HUMAN numbering
// (1-12, 0-7) — comparisons convert from Date getters explicitly.
const FIELDS = [
  ["minute", 0, 59, false],
  ["hour",   0, 23, false],
  ["dom",    1, 31, false],
  ["month",  1, 12, false],
  ["dow",    0, 7,  true],
];

function _parseField(name, raw, min, max, isDow) {
  const values = new Set();
  for (const part of String(raw).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error(`empty list element in ${name} field "${raw}"`);
    const slash = trimmed.indexOf("/");
    const rangePart = slash === -1 ? trimmed : trimmed.slice(0, slash);
    const stepPart = slash === -1 ? null : trimmed.slice(slash + 1);
    let step = 1;
    if (stepPart !== null) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) throw new Error(`invalid step "/${stepPart}" in ${name} field "${raw}"`);
    }
    let start;
    let end;
    if (rangePart === "*" || rangePart === "?") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const bits = rangePart.split("-");
      start = Number(bits[0]);
      end = Number(bits[1]);
    } else {
      start = Number(rangePart);
      // "5/10" = starting at 5, every 10 up to max (cron convention); bare "5" = just 5.
      end = stepPart !== null ? max : start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) throw new Error(`non-numeric value in ${name} field "${raw}"`);
    if (start < min || end > max || start > end) throw new Error(`${name} value out of range (${min}-${max}): "${raw}"`);
    for (let v = start; v <= end; v += step) values.add(isDow && v === 7 ? 0 : v);
  }
  return [...values].sort((a, b) => a - b);
}

/** Parse a cron expression into sorted value arrays. Throws Error on invalid input. */
function parseCron(expr) {
  const raw = String(expr || "").trim();
  if (!raw) throw new Error("empty cron expression");
  const expanded = PRESETS[raw.toLowerCase()] || raw;
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron needs exactly 5 fields (m h dom mon dow), got ${parts.length}: "${expr}"`);
  const parsed = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const [name, min, max, isDow] = FIELDS[i];
    parsed[name] = _parseField(name, parts[i], min, max, isDow);
  }
  parsed.domRestricted = parsed.dom.length !== 31; // not plain "*"
  parsed.dowRestricted = parsed.dow.length !== 7;
  return parsed;
}

function _dayMatches(cron, date) {
  const domOk = cron.dom.includes(date.getDate());
  const dowOk = cron.dow.includes(date.getDay());
  // Vixie cron rule: both restricted → OR; one restricted → it alone decides.
  if (cron.domRestricted && cron.dowRestricted) return domOk || dowOk;
  if (cron.domRestricted) return domOk;
  if (cron.dowRestricted) return dowOk;
  return true;
}

function _firstOfNextMonth(t) {
  const r = new Date(t.getFullYear(), t.getMonth() + 1, 1, 0, 0, 0, 0);
  return r;
}

function _nextDayStart(t) {
  const r = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 0, 0, 0, 0);
  return r;
}

/**
 * First occurrence STRICTLY AFTER `from` (minute precision), or null when no
 * occurrence exists within the search bound (~4 years — only reachable for
 * impossible dates like Feb 30).
 */
function nextAfter(expr, from) {
  const cron = typeof expr === "string" ? parseCron(expr) : expr;
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);

  // Bound: 4 leap years of minutes. Structured jumps below make real schedules
  // resolve in a handful of iterations; the cap only matters for never-matching
  // expressions like "0 0 30 2 *".
  const guard = 366 * 4 * 24 * 60;
  for (let i = 0; i < guard; i++) {
    if (!cron.month.includes(t.getMonth() + 1)) {
      const jump = _firstOfNextMonth(t);
      if (jump <= t) return null; // defensive: never loop without progress
      t.setTime(jump.getTime());
      continue;
    }
    if (!_dayMatches(cron, t)) {
      const jump = _nextDayStart(t);
      if (jump <= t) return null;
      t.setTime(jump.getTime());
      continue;
    }
    for (const h of cron.hour) {
      if (h < t.getHours()) continue;
      const mins = h === t.getHours()
        ? cron.minute.filter((m) => m >= t.getMinutes())
        : cron.minute;
      if (!mins.length) continue;
      const result = new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, mins[0], 0, 0);
      if (result > from) return result;
      break; // this hour's slot already passed `from` inside the current minute — move on
    }
    // No remaining slot today → tomorrow 00:00.
    const jump = _nextDayStart(t);
    if (jump <= t) return null;
    t.setTime(jump.getTime());
  }
  return null;
}

module.exports = { parseCron, nextAfter, PRESETS };
