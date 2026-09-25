"use strict";
/**
 * env_match.js — EXEC-36 environment-fingerprint comparison (pure, no Playwright).
 *
 * A skill recorded by an admin in en-US at 1920×1080 replayed by a viewer in de-DE at
 * 1366×768 can hit a button now hidden behind a hamburger menu, a date field expecting
 * DD.MM.YYYY, or a control that doesn't exist for that role — none of which is a broken
 * selector, but all of which fail exactly like one, burning the same recovery ladder and
 * Tier B tokens as genuine drift. `runtime/app/drift.js` checks structural landmarks; this
 * checks the ENVIRONMENT those landmarks were recorded in.
 *
 * Deliberately narrow — a noisy warning is worse than none. Only flags a difference material
 * enough to plausibly change what's on the page:
 *   - locale:   primary language subtag differs (en vs de). Region-only (en-US vs en-GB) is
 *               not flagged — the page's language doesn't change.
 *   - timezone: UTC OFFSET differs. Name-only differences (two zones sharing an offset today)
 *               are not flagged.
 *   - viewport: width differs by more than 25%, OR the two widths sit on opposite sides of a
 *               common responsive breakpoint (1024px, 768px) — the ranges where nav commonly
 *               collapses into a hamburger menu.
 * Role is deliberately not compared here — see docs/TRD.md §9.7 for why capture stops short
 * of it.
 */

const BREAKPOINTS = [1024, 768];

function primaryLangSubtag(locale) {
  return String(locale || "").split(/[-_]/)[0].toLowerCase();
}

function localeLabel(locale) {
  return String(locale || "").trim();
}

function crossesBreakpoint(a, b) {
  return BREAKPOINTS.some((bp) => (a >= bp) !== (b >= bp));
}

// Returns a list of { field, recorded, live, message } entries — empty when nothing material
// differs, or when either side's environment is missing/incomplete ("unknown," never a
// mismatch — see SkillMeta.environment's docstring).
function compareEnvironment(recorded, live) {
  const rec = recorded && typeof recorded === "object" ? recorded : {};
  const cur = live && typeof live === "object" ? live : {};
  if (!Object.keys(rec).length || !Object.keys(cur).length) return [];

  const mismatches = [];

  const recLang = primaryLangSubtag(rec.locale);
  const curLang = primaryLangSubtag(cur.locale);
  if (recLang && curLang && recLang !== curLang) {
    mismatches.push({
      field: "locale",
      recorded: rec.locale,
      live: cur.locale,
      message: `This workflow was recorded in ${localeLabel(rec.locale) || "a different language"}; ` +
        `this browser is set to ${localeLabel(cur.locale) || "a different language"} — labels, date ` +
        `formats, and field text may not match what was recorded.`,
    });
  }

  const recOffset = rec.utc_offset_minutes;
  const curOffset = cur.utc_offset_minutes;
  if (typeof recOffset === "number" && typeof curOffset === "number" && recOffset !== curOffset) {
    mismatches.push({
      field: "timezone",
      recorded: rec.timezone,
      live: cur.timezone,
      message: `This workflow was recorded in a timezone ${(curOffset - recOffset) / 60} hour(s) from ` +
        `this browser's — dates, times, or scheduled data shown on the page may differ from what was recorded.`,
    });
  }

  const recW = rec.viewport && rec.viewport.w;
  const curW = cur.viewport && cur.viewport.w;
  if (typeof recW === "number" && recW > 0 && typeof curW === "number" && curW > 0) {
    const ratio = Math.abs(curW - recW) / recW;
    if (ratio > 0.25 || crossesBreakpoint(recW, curW)) {
      mismatches.push({
        field: "viewport",
        recorded: rec.viewport,
        live: cur.viewport,
        message: `This workflow was recorded at ${recW}×${(rec.viewport && rec.viewport.h) || "?"}; this ` +
          `browser is ${curW}×${(cur.viewport && cur.viewport.h) || "?"} — buttons or menus may be hidden ` +
          `behind a collapsed nav or moved off-screen.`,
      });
    }
  }

  return mismatches;
}

module.exports = { compareEnvironment, primaryLangSubtag, crossesBreakpoint, BREAKPOINTS };
