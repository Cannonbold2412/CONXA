"use strict";
// Unit tests for the pure date-picker replay math (runtime/app/date_picker.js). No browser, no
// mocks — every function here is pure by construction (see the file's own header comment).

const test = require("node:test");
const assert = require("node:assert");

const {
  parseDateValue,
  formatForDisplay,
  parseHeader,
  monthDelta,
  machineCellSelector,
  dayNumberSelector,
  monthLabel,
} = require("../../app/date_picker");

test("parseDateValue: plain ISO date", () => {
  assert.deepStrictEqual(parseDateValue("2026-09-15"), { year: 2026, month: 9, day: 15, hour: null, minute: null });
});

test("parseDateValue: ISO datetime", () => {
  assert.deepStrictEqual(parseDateValue("2026-09-15T14:30"), { year: 2026, month: 9, day: 15, hour: 14, minute: 30 });
});

test("parseDateValue: rejects garbage rather than guessing", () => {
  assert.strictEqual(parseDateValue("not a date"), null);
  assert.strictEqual(parseDateValue(""), null);
  assert.strictEqual(parseDateValue("09/15/2026"), null);
});

test("formatForDisplay: renders MM/DD/YYYY", () => {
  const parsed = parseDateValue("2026-01-05");
  assert.strictEqual(formatForDisplay(parsed, "MM/DD/YYYY"), "01/05/2026");
});

test("formatForDisplay: renders DD-MM-YYYY (different order/separator)", () => {
  const parsed = parseDateValue("2026-01-05");
  assert.strictEqual(formatForDisplay(parsed, "DD-MM-YYYY"), "05-01-2026");
});

test("formatForDisplay: two-digit year token", () => {
  const parsed = parseDateValue("2026-01-05");
  assert.strictEqual(formatForDisplay(parsed, "MM/DD/YY"), "01/05/26");
});

test("formatForDisplay: no format means no guess", () => {
  const parsed = parseDateValue("2026-01-05");
  assert.strictEqual(formatForDisplay(parsed, ""), null);
  assert.strictEqual(formatForDisplay(null, "MM/DD/YYYY"), null);
});

test("parseHeader: full month name", () => {
  assert.deepStrictEqual(parseHeader("September 2026"), { year: 2026, month: 9 });
});

test("parseHeader: abbreviated month name", () => {
  assert.deepStrictEqual(parseHeader("Sep 2026"), { year: 2026, month: 9 });
});

test("parseHeader: year-first ordering", () => {
  assert.deepStrictEqual(parseHeader("2026 September"), { year: 2026, month: 9 });
});

test("parseHeader: numeric MM/YYYY", () => {
  assert.deepStrictEqual(parseHeader("09/2026"), { year: 2026, month: 9 });
});

test("parseHeader: numeric YYYY-MM", () => {
  assert.deepStrictEqual(parseHeader("2026-09"), { year: 2026, month: 9 });
});

test("parseHeader: unparseable text returns null, never a guess", () => {
  assert.strictEqual(parseHeader("Loading..."), null);
  assert.strictEqual(parseHeader(""), null);
});

test("monthDelta: forward within the same year", () => {
  assert.strictEqual(monthDelta("August 2026", 2026, 9), 1);
});

test("monthDelta: backward within the same year", () => {
  assert.strictEqual(monthDelta("December 2026", 2026, 9), -3);
});

test("monthDelta: crosses a year boundary forward", () => {
  assert.strictEqual(monthDelta("November 2026", 2027, 1), 2);
});

test("monthDelta: crosses a year boundary backward", () => {
  assert.strictEqual(monthDelta("January 2027", 2026, 11), -2);
});

test("monthDelta: zero when already on the target month", () => {
  assert.strictEqual(monthDelta("September 2026", 2026, 9), 0);
});

test("monthDelta: unparseable header refuses to guess a click count", () => {
  assert.strictEqual(monthDelta("", 2026, 9), null);
});

test("machineCellSelector: builds a selector for a machine-readable attribute", () => {
  assert.strictEqual(machineCellSelector("data-date", "2026-09-15"), '[data-date="2026-09-15"]');
});

test("machineCellSelector: refuses to regenerate an aria-label sentence", () => {
  assert.strictEqual(machineCellSelector("", "2026-09-15"), null);
  assert.strictEqual(machineCellSelector("aria-label", "2026-09-15"), null);
});

test("monthLabel: 1-indexed month number to English label", () => {
  assert.strictEqual(monthLabel(1), "January");
  assert.strictEqual(monthLabel(12), "December");
  assert.strictEqual(monthLabel(9), "September");
});

test("monthLabel: out-of-range month refuses to guess", () => {
  assert.strictEqual(monthLabel(0), null);
  assert.strictEqual(monthLabel(13), null);
});

test("dayNumberSelector: excludes disabled/outside-month cells, matches exact day text", () => {
  const sel = dayNumberSelector(15);
  assert.match(sel, /:text-is\("15"\)$/);
  assert.match(sel, /disabled/);
  assert.match(sel, /outside/);
  // Never matches "15" as a substring of "150" or similar via a loose text selector.
  assert.doesNotMatch(sel, /text=15[^"]/);
});
