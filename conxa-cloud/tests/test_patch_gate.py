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


# ─────────────────────────────────────────────────
# Branch-step authoring (EXEC-1 editor gap, closed 2026-07-10) — if_present/try_dismiss/
# wait_for_one_of patches, and the recovery/validation restriction on nested branch-body steps.
# ─────────────────────────────────────────────────

def _if_present_step(*, branch=None) -> dict:
    return {
        "action": {"action": "if_present"},
        "intent": "dismiss_if_present",
        "target": {"primary_selector": ".cookie-banner", "fallback_selectors": []},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": []},
        "recovery": {"strategies": [], "max_attempts": 0, "confidence_threshold": 0.85, "require_diverse_attempts": False, "anchors": []},
        "branch": branch if branch is not None else {"steps": [], "timeout_ms": 3000},
    }


def _try_dismiss_step(*, branch=None) -> dict:
    return {
        "action": {"action": "try_dismiss"},
        "intent": "try_dismiss_interstitial",
        "target": {"primary_selector": "", "fallback_selectors": []},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": []},
        "recovery": {"strategies": [], "max_attempts": 0, "confidence_threshold": 0.85, "require_diverse_attempts": False, "anchors": []},
        "branch": branch if branch is not None else {"candidates": [], "timeout_ms": 3000, "fallback_escape": True},
    }


def _wait_for_one_of_step(*, branch=None) -> dict:
    return {
        "action": {"action": "wait_for_one_of"},
        "intent": "wait_for_one_of_states",
        "target": {"primary_selector": "", "fallback_selectors": []},
        "signals": {},
        "validation": {"wait_for": {"type": "none"}, "assertions": []},
        "recovery": {"strategies": [], "max_attempts": 0, "confidence_threshold": 0.85, "require_diverse_attempts": False, "anchors": []},
        "branch": branch if branch is not None else {"options": [], "timeout_ms": 5000, "required": True},
    }


class TestBranchStepPatches:
    def test_if_present_timeout_ms_patch_is_allowed(self):
        step = _if_present_step()
        validate_editor_patch(step, {"branch": {"timeout_ms": 4000}}, {})

    def test_if_present_out_of_range_timeout_ms_raises(self):
        step = _if_present_step()
        with pytest.raises(ValueError, match="branch_timeout_ms_out_of_range"):
            validate_editor_patch(step, {"branch": {"timeout_ms": 999999}}, {})

    def test_if_present_steps_key_rejected_on_parent_patch(self):
        """Nested body steps are structural (insert_branch_step/delete_branch_step/
        reorder_branch_steps) or path-addressed patches, never a blind deep-merge into the
        parent's own patch — otherwise a stale client could clobber concurrent nested edits."""
        step = _if_present_step()
        patch = {"branch": {"steps": [{"action": {"action": "click"}, "target": {"primary_selector": "#x"}}]}}
        with pytest.raises(ValueError, match="branch_if_present_steps_not_patchable_here"):
            validate_editor_patch(step, patch, {})

    def test_try_dismiss_valid_candidate_is_allowed(self):
        step = _try_dismiss_step()
        validate_editor_patch(step, {"branch": {"candidates": ["text=Dismiss"]}}, {})

    def test_try_dismiss_low_quality_candidate_raises(self):
        step = _try_dismiss_step()
        with pytest.raises(ValueError, match="branch_candidate_0_failed_quality_gates"):
            validate_editor_patch(step, {"branch": {"candidates": ["div"]}}, {})

    def test_try_dismiss_fallback_escape_must_be_boolean(self):
        step = _try_dismiss_step()
        with pytest.raises(ValueError, match="branch_fallback_escape_must_be_boolean"):
            validate_editor_patch(step, {"branch": {"fallback_escape": "yes"}}, {})

    def test_wait_for_one_of_option_requires_selector(self):
        step = _wait_for_one_of_step()
        with pytest.raises(ValueError, match="branch_option_0_selector_required"):
            validate_editor_patch(step, {"branch": {"options": [{"selector": ""}]}}, {})

    def test_wait_for_one_of_option_low_quality_selector_raises(self):
        step = _wait_for_one_of_step()
        with pytest.raises(ValueError, match="branch_option_0_selector_failed_quality_gates"):
            validate_editor_patch(step, {"branch": {"options": [{"selector": "div"}]}}, {})

    def test_wait_for_one_of_option_with_nested_steps_rejected(self):
        """Per-option nested bodies are read-only this pass (see StepEditorDTO.branch_summary's
        `options` in workflow_dto.py) — a patch smuggling `steps` content in is rejected rather
        than silently accepted and never rendered."""
        step = _wait_for_one_of_step()
        patch = {"branch": {"options": [{"selector": "#dashboard", "steps": [{"action": {"action": "click"}}]}]}}
        with pytest.raises(ValueError, match="branch_option_0_steps_not_patchable_here"):
            validate_editor_patch(step, patch, {})

    def test_wait_for_one_of_valid_options_patch_is_allowed(self):
        step = _wait_for_one_of_step()
        validate_editor_patch(step, {"branch": {"options": [{"selector": "#dashboard"}], "required": False}}, {})

    def test_branch_step_disallows_unrelated_keys(self):
        step = _if_present_step()
        with pytest.raises(ValueError, match="branch_step_allows_only_target_branch_intent_validation_recovery_frame"):
            validate_editor_patch(step, {"check_kind": "url"}, {})


class TestBranchBodyStepValidation:
    """Nested body steps (if_present's branch.steps[j]) are patched via cmd_patch_step's `path`
    parameter, which passes in_branch_body=True — see handlers/workflow_editor.py."""

    def _nested_click_step(self) -> dict:
        return {
            "action": {"action": "click"},
            "intent": "click_accept",
            "target": {"primary_selector": "text=Accept", "fallback_selectors": []},
            "signals": {},
        }

    def test_recovery_patch_on_branch_body_step_raises(self):
        step = self._nested_click_step()
        with pytest.raises(ValueError, match="branch_body_step_cannot_patch_recovery_or_validation"):
            validate_editor_patch(step, {"recovery": {"max_attempts": 3}}, {}, in_branch_body=True)

    def test_validation_patch_on_branch_body_step_raises(self):
        step = self._nested_click_step()
        with pytest.raises(ValueError, match="branch_body_step_cannot_patch_recovery_or_validation"):
            validate_editor_patch(step, {"validation": {"assertions": []}}, {}, in_branch_body=True)

    def test_non_recovery_patch_on_branch_body_step_is_allowed(self):
        step = self._nested_click_step()
        validate_editor_patch(step, {"intent": "click_accept_button"}, {}, in_branch_body=True)

    def test_same_patch_allowed_outside_branch_body(self):
        """The restriction is specific to in_branch_body=True — an ordinary top-level step keeps
        full recovery/validation editability."""
        step = self._nested_click_step()
        validate_editor_patch(step, {"recovery": {"max_attempts": 3}}, {}, in_branch_body=False)
