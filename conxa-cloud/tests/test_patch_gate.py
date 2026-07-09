"""Tests for the editor patch gate's consequential-action assertion invariant.

validate_editor_patch() is not yet wired into any RPC handler (cmd_patch_step doesn't call it
today) — these tests exercise the function directly, the same way the destructive wait_for
invariant it sits alongside is exercised.
"""

from __future__ import annotations

import pytest

from conxa_compile.editor.patch_gate import validate_editor_patch


def _fill_step(*, required_assertion: bool | None = True) -> dict:
    assertions = []
    if required_assertion is not None:
        assertions = [
            {"type": "value_equals", "target": "#email", "expected": "alice@example.com", "required": required_assertion},
        ]
    return {
        "action": {"action": "fill", "value": "alice@example.com"},
        "intent": "Enter email address",
        "value": "alice@example.com",
        "target": {"primary_selector": "#email", "fallback_selectors": []},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": assertions},
    }


def _submit_click_step(*, required_assertion: bool | None = True) -> dict:
    assertions = []
    if required_assertion is not None:
        assertions = [{"type": "state_changed", "required": required_assertion}]
    return {
        "action": {"action": "click"},
        "intent": "Submit the form",
        "target": {"primary_selector": "#submit-btn", "fallback_selectors": [], "type": "submit"},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": assertions},
    }


def test_clearing_assertions_on_a_fill_step_raises():
    step = _fill_step(required_assertion=True)
    with pytest.raises(ValueError, match="consequential_step_requires_required_assertion"):
        validate_editor_patch(step, {"validation": {"assertions": []}}, {})


def test_unrelated_patch_on_a_fill_step_with_existing_required_assertion_is_allowed():
    step = _fill_step(required_assertion=True)
    # Doesn't touch validation at all — the required assertion carries over unchanged.
    validate_editor_patch(step, {"intent": "Enter the customer email"}, {})


def test_unrelated_patch_on_a_legacy_fill_step_without_assertions_is_allowed():
    # Backward compatibility: a step compiled before enforced post-conditions existed has no
    # required assertion. An edit that doesn't touch validation must not be blocked by it.
    step = _fill_step(required_assertion=None)
    validate_editor_patch(step, {"intent": "Enter the customer email"}, {})


def test_editing_validation_on_a_legacy_step_without_a_required_check_raises():
    # The patch explicitly touches validation but still leaves nothing enforced — this is the
    # case the invariant exists to catch (a human edit silently dropping the enforced check).
    step = _fill_step(required_assertion=None)
    patch = {"validation": {"assertions": [{"type": "text_present", "target": "ok", "required": False}]}}
    with pytest.raises(ValueError, match="consequential_step_requires_required_assertion"):
        validate_editor_patch(step, patch, {})


def test_editing_validation_on_a_legacy_step_to_add_a_required_check_is_allowed():
    step = _fill_step(required_assertion=None)
    patch = {"validation": {"assertions": [{"type": "value_equals", "target": "#email", "expected": "x", "required": True}]}}
    validate_editor_patch(step, patch, {})


def test_clearing_assertions_on_a_consequential_click_raises():
    step = _submit_click_step(required_assertion=True)
    with pytest.raises(ValueError, match="consequential_step_requires_required_assertion"):
        validate_editor_patch(step, {"validation": {"assertions": []}}, {})


def test_non_consequential_click_is_never_gated():
    step = {
        "action": {"action": "click"},
        "intent": "Expand the row",
        "target": {"primary_selector": ".row-toggle", "fallback_selectors": []},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": []},
    }
    # No commit/destructive signal at all — clearing (already-empty) assertions is a no-op.
    validate_editor_patch(step, {"validation": {"assertions": []}}, {})
