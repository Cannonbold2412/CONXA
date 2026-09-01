"use strict";
// EXEC-24 idempotency classification (step_utils.js::isNonIdempotent) — governs whether
// recovery is allowed to re-dispatch a step's action after a verifyFail. date_pick is a special
// case, not a blanket type-set entry: see step_utils.js's comment on why a custom-calendar grid
// drive can land the picker in the opposite state on a re-drive while a native input's re-fill
// stays a genuine no-op.

const test = require("node:test");
const assert = require("node:assert");

const { isNonIdempotent } = require("../../app/step_utils");

test("native date_pick (no control_kind) is idempotent — freely re-dispatched", () => {
  assert.strictEqual(isNonIdempotent({ type: "date_pick", handler_hints: {} }), false);
});

test("custom-calendar date_pick (control_kind=date_picker) is NOT idempotent — guarded", () => {
  assert.strictEqual(
    isNonIdempotent({ type: "date_pick", handler_hints: { control_kind: "date_picker" } }),
    true,
  );
});

test("an ordinary click is still non-idempotent (unaffected by the date_pick special-case)", () => {
  assert.strictEqual(isNonIdempotent({ type: "click" }), true);
});

test("an ordinary fill is still idempotent (unaffected by the date_pick special-case)", () => {
  assert.strictEqual(isNonIdempotent({ type: "fill" }), false);
});
