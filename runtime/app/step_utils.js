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

module.exports = { unique, asObject, asArray };
