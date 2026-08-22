"use strict";
// Input interpolation for skill steps, extracted from run.js. Pure.
//
// Grammar must match conxa_compile/editor/placeholder_grammar.py PLACEHOLDER_RE exactly —
// a looser runtime grammar let hyphenated/spaced {{ids}} interpolate here while staying
// invisible to the compiler/UI scanners and always resolving to "" (audit finding C3).
function interpolate(value, inputs) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => String(inputs[key] ?? ""));
}

module.exports = { interpolate };
