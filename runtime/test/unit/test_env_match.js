"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { compareEnvironment, primaryLangSubtag, crossesBreakpoint } = require("../../app/env_match");

const REC = { locale: "en-US", timezone: "America/New_York", utc_offset_minutes: -300, viewport: { w: 1920, h: 1080 } };

test("identical environments produce no mismatches", () => {
  const r = compareEnvironment(REC, { ...REC });
  assert.deepStrictEqual(r, []);
});

test("empty recorded or empty live environment produces no mismatches (unknown, never a mismatch)", () => {
  assert.deepStrictEqual(compareEnvironment({}, REC), []);
  assert.deepStrictEqual(compareEnvironment(REC, {}), []);
  assert.deepStrictEqual(compareEnvironment(null, REC), []);
  assert.deepStrictEqual(compareEnvironment(REC, undefined), []);
});

// ─── locale ───────────────────────────────────────────────────────────────

test("primaryLangSubtag extracts the language subtag", () => {
  assert.strictEqual(primaryLangSubtag("en-US"), "en");
  assert.strictEqual(primaryLangSubtag("de-DE"), "de");
  assert.strictEqual(primaryLangSubtag(""), "");
});

test("region-only locale difference (en-US vs en-GB) does not warn", () => {
  const r = compareEnvironment(REC, { ...REC, locale: "en-GB" });
  assert.strictEqual(r.find((m) => m.field === "locale"), undefined);
});

test("a different primary language subtag warns", () => {
  const r = compareEnvironment(REC, { ...REC, locale: "de-DE" });
  const m = r.find((x) => x.field === "locale");
  assert.ok(m, "expected a locale mismatch");
  assert.match(m.message, /English \(US\)|en-US/);
});

// ─── timezone ─────────────────────────────────────────────────────────────

test("same UTC offset under a different timezone name does not warn", () => {
  // Phoenix and LA share -420 in summer-adjacent contexts; use two labels, same offset.
  const r = compareEnvironment(REC, { ...REC, timezone: "America/Phoenix", utc_offset_minutes: -300 });
  assert.strictEqual(r.find((m) => m.field === "timezone"), undefined);
});

test("a different UTC offset warns", () => {
  const r = compareEnvironment(REC, { ...REC, timezone: "Europe/Berlin", utc_offset_minutes: 60 });
  const m = r.find((x) => x.field === "timezone");
  assert.ok(m, "expected a timezone mismatch");
});

// ─── viewport ─────────────────────────────────────────────────────────────

test("crossesBreakpoint detects a width straddling 1024 or 768", () => {
  assert.strictEqual(crossesBreakpoint(1920, 1366), false); // both >= 1024
  assert.strictEqual(crossesBreakpoint(1920, 1000), true);  // 1920>=1024, 1000<1024
  assert.strictEqual(crossesBreakpoint(900, 700), true);    // 900>=768, 700<768
  assert.strictEqual(crossesBreakpoint(500, 400), false);   // both < both breakpoints
});

test("a small viewport difference within tolerance and no breakpoint crossed does not warn", () => {
  const r = compareEnvironment(REC, { ...REC, viewport: { w: 1800, h: 1000 } }); // ~6% narrower, both >= 1024
  assert.strictEqual(r.find((m) => m.field === "viewport"), undefined);
});

test("a viewport width crossing the 1024 breakpoint warns even with a small ratio", () => {
  const r = compareEnvironment({ ...REC, viewport: { w: 1050, h: 800 } }, { viewport: { w: 1000, h: 800 }, locale: "en-US", utc_offset_minutes: -300 });
  const m = r.find((x) => x.field === "viewport");
  assert.ok(m, "expected a viewport mismatch from crossing the breakpoint");
});

test("a viewport width differing by more than 25% warns even without crossing a breakpoint", () => {
  const r = compareEnvironment(REC, { ...REC, viewport: { w: 1300, h: 1080 } }); // 32% narrower, both >= 1024
  const m = r.find((x) => x.field === "viewport");
  assert.ok(m, "expected a viewport mismatch from the ratio");
});

test("mobile-scale viewport (crosses 768) warns", () => {
  const r = compareEnvironment(REC, { ...REC, viewport: { w: 400, h: 800 } });
  const m = r.find((x) => x.field === "viewport");
  assert.ok(m);
});

// ─── combined ─────────────────────────────────────────────────────────────

test("multiple material differences all appear in the result", () => {
  const live = { locale: "de-DE", timezone: "Europe/Berlin", utc_offset_minutes: 60, viewport: { w: 1366, h: 768 } };
  const r = compareEnvironment(REC, live);
  const fields = r.map((m) => m.field).sort();
  assert.deepStrictEqual(fields, ["locale", "timezone", "viewport"]);
  for (const m of r) assert.ok(typeof m.message === "string" && m.message.length > 0);
});
