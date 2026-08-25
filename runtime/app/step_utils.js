"use strict";
// Shared low-level accessors for runtime step objects, extracted from run.js.
// Used by every extracted seam below it (resolution → assertions/locators →
// handlers → cascade), so this module stays dependency-free on purpose.
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// EXEC-24 — step types whose action cannot be safely dispatched twice. A second click submits
// twice, a second upload uploads twice, a second checkbox toggle undoes the first. Everything
// NOT listed here (fill, type, select, focus, hover, scroll, date_pick, …) is idempotent in
// practice: re-running it lands the page in the same state, so recovery re-dispatches it freely.
// Lives here, in the dependency-free leaf, because both locators.js and cascade.js need it and
// cascade.js already depends on locators.js.
const NON_IDEMPOTENT_STEP_TYPES = new Set([
  "click", "dblclick", "right_click",
  "keyboard_shortcut", "upload", "drag_drop",
  "set_checkbox", "set_radio",
]);

function isNonIdempotent(step) {
  return NON_IDEMPOTENT_STEP_TYPES.has(asObject(step).type);
}

module.exports = { unique, asObject, asArray, NON_IDEMPOTENT_STEP_TYPES, isNonIdempotent };
