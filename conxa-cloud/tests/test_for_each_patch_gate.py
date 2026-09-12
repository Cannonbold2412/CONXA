"""EXEC-38: patch_gate.py's for_each key-whitelist + _validate_for_each_patch."""

from __future__ import annotations

import pytest

from conxa_compile.editor.patch_gate import validate_editor_patch


def _for_each_step(*, for_each=None) -> dict:
    return {
        "action": {"action": "for_each"},
        "intent": "process_each_invoice",
        "for_each": for_each if for_each is not None else {
            "rows": {"container_selector": "table#invoices tr"},
            "as": "row",
            "max_iterations": 50,
            "steps": [],
        },
    }


class TestForEachStepPatches:
    def test_intent_patch_is_allowed(self):
        step = _for_each_step()
        validate_editor_patch(step, {"intent": "process_each_pending_order"}, {})

    def test_max_iterations_patch_is_allowed(self):
        step = _for_each_step()
        validate_editor_patch(step, {"for_each": {"max_iterations": 10}}, {})

    def test_target_key_is_rejected_for_a_for_each_step(self):
        # for_each has no target of its own — its body steps do.
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_step_allows_only_intent_for_each_frame"):
            validate_editor_patch(step, {"target": {"primary_selector": "#x"}}, {})

    def test_recovery_key_is_rejected_for_a_for_each_step(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_step_allows_only_intent_for_each_frame"):
            validate_editor_patch(step, {"recovery": {"max_attempts": 2}}, {})

    def test_steps_key_rejected_on_parent_patch(self):
        """Nested body steps are structural (insert/delete/reorder RPCs, mirroring
        insert_branch_step) or path-addressed patches, never a blind deep-merge here —
        otherwise a stale client could clobber concurrent nested edits."""
        step = _for_each_step()
        patch = {"for_each": {"steps": [{"action": {"action": "click"}, "target": {"primary_selector": "#x"}}]}}
        with pytest.raises(ValueError, match="for_each_steps_not_patchable_here"):
            validate_editor_patch(step, patch, {})

    def test_zero_max_iterations_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_max_iterations_out_of_range"):
            validate_editor_patch(step, {"for_each": {"max_iterations": 0}}, {})

    def test_negative_max_iterations_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_max_iterations_out_of_range"):
            validate_editor_patch(step, {"for_each": {"max_iterations": -1}}, {})

    def test_absurdly_large_max_iterations_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_max_iterations_out_of_range"):
            validate_editor_patch(step, {"for_each": {"max_iterations": 999999}}, {})

    def test_non_integer_max_iterations_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_max_iterations_must_be_integer"):
            validate_editor_patch(step, {"for_each": {"max_iterations": "many"}}, {})

    def test_invalid_on_row_error_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_on_row_error_invalid"):
            validate_editor_patch(step, {"for_each": {"on_row_error": "retry"}}, {})

    def test_valid_on_row_error_values_are_allowed(self):
        step = _for_each_step()
        validate_editor_patch(step, {"for_each": {"on_row_error": "stop"}}, {})
        validate_editor_patch(step, {"for_each": {"on_row_error": "continue"}}, {})

    def test_empty_as_name_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_as_must_be_non_empty_string"):
            validate_editor_patch(step, {"for_each": {"as": "   "}}, {})

    def test_for_each_not_a_dict_raises(self):
        step = _for_each_step()
        with pytest.raises(ValueError, match="for_each_must_be_object"):
            validate_editor_patch(step, {"for_each": "not an object"}, {})
