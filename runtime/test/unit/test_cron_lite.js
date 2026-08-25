"use strict";

// cron_lite.js — PROD-5 scheduler foundations. This suite pins both syntax
// handling (ranges/lists/steps/dow-7 normalization/Vixie dom-dow OR rule) and
// nextAfter()'s correctness against a brute-force minute-by-minute oracle, so a
// clever-jump optimization bug can never silently shift a scheduled run.

const test = require("node:test");
const assert = require("node:assert");
const { parseCron, nextAfter } = require("../../app/cron_lite");

// ─── parsing ──────────────────────────────────────────────────────────────────

test("parseCron accepts standard 5-field expressions", () => {
  const c = parseCron("0 6 * * *");
  assert.deepStrictEqual(c.minute, [0]);
  assert.deepStrictEqual(c.hour, [6]);
  assert.deepStrictEqual(c.month, [1,2,3,4,5,6,7,8,9,10,11,12]);
});

test("parseCron handles lists, ranges, and steps", () => {
  const c = parseCron("0,30 6-8/2 * * 1,5");
  assert.deepStrictEqual(c.minute, [0, 30]);
  assert.deepStrictEqual(c.hour, [6, 8]); // 6-8 step 2
  assert.deepStrictEqual(c.dow, [1, 5]);
});

test("parseCron normalizes dow 7 to Sunday (0)", () => {
  const c = parseCron("* * * * 7");
  assert.ok(c.dow.includes(0));
  assert.strictEqual(c.dow.length, 1);
});

test("parseCron accepts presets", () => {
  assert.deepStrictEqual(parseCron("@daily").hour, [0]);
  assert.deepStrictEqual(parseCron("@WEEKLY").dow, [0]);
});

test("parseCron rejects malformed expressions with clear errors", () => {
  assert.throws(() => parseCron("0 6 * *"), /5 fields/);
  assert.throws(() => parseCron("60 * * * *"), /out of range/);
  assert.throws(() => parseCron("* * * * 9"), /out of range/);
  assert.throws(() => parseCron("a * * * *"), /non-numeric/);
  assert.throws(() => parseCron("*/0 * * * *"), /invalid step/);
  assert.throws(() => parseCron(""), /empty/);
});

// ─── nextAfter ────────────────────────────────────────────────────────────────

// Independent oracle: walk forward one minute at a time (no smart jumps) and
// return the first matching minute. Slow on purpose — it shares NO code path
// with nextAfter beyond parseCron itself.
function bruteNext(expr, from, maxMinutes = 1_600_000) { // ~4.4 years of minutes
  const c = parseCron(expr);
  const dayMatches = (d) => {
    const domOk = c.dom.includes(d.getDate());
    const dowOk = c.dow.includes(d.getDay());
    if (c.domRestricted && c.dowRestricted) return domOk || dowOk;
    if (c.domRestricted) return domOk;
    if (c.dowRestricted) return dowOk;
    return true;
  };
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < maxMinutes; i++) {
    if (dayMatches(t) && c.month.includes(t.getMonth() + 1)
      && c.hour.includes(t.getHours()) && c.minute.includes(t.getMinutes())) {
      return new Date(t.getTime());
    }
    t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

test("nextAfter: daily job picks today or tomorrow depending on current time", () => {
  const morning = new Date(2026, 7, 26, 5, 0); // Wed Aug 26 2026, 05:00 local
  assert.deepStrictEqual(nextAfter("0 6 * * *", morning), new Date(2026, 7, 26, 6, 0));

  const after = new Date(2026, 7, 26, 6, 0); // exactly AT the slot → strictly after
  assert.deepStrictEqual(nextAfter("0 6 * * *", after), new Date(2026, 7, 27, 6, 0));
});

test("nextAfter: */15 lands on the next quarter boundary", () => {
  const d = new Date(2026, 7, 26, 10, 7);
  assert.deepStrictEqual(nextAfter("*/15 * * * *", d), new Date(2026, 7, 26, 10, 15));
});

test("nextAfter agrees with the brute-force oracle across many schedules", () => {
  const exprs = [
    "0 6 * * *",
    "*/15 * * * *",
    "30 4 1,15 * *",
    "0 6 * * 1-5",
    "0 0 13 * 5",     // dom AND dow restricted → Vixie OR rule
    "0 9-17/2 * * *",
    "59 23 31 12 *",
    "0 0 29 2 *",     // leap-day only
  ];
  const starts = [
    new Date(2026, 7, 26, 10, 7),
    new Date(2026, 7, 26, 23, 59),
    new Date(2027, 1, 28, 12, 0),
  ];
  for (const expr of exprs) {
    for (const s of starts) {
      const got = nextAfter(expr, s);
      const want = bruteNext(expr, s);
      assert.deepStrictEqual(got, want, `${expr} from ${s}`);
    }
  }
});

test("nextAfter: impossible date returns null (bounded search, no hang)", () => {
  assert.strictEqual(nextAfter("0 0 30 2 *", new Date(2026, 0, 1)), null);
});

test("nextAfter is pure — repeated calls agree", () => {
  const d = new Date(2026, 7, 26, 10, 7);
  assert.deepStrictEqual(nextAfter("0 6 * * *", d), nextAfter("0 6 * * *", d));
});
