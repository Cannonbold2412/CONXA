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


class TestForEachRowSource:
    """EXEC-38 items source: exactly one of `rows.container_selector` / `items`, checked
    against the EFFECTIVE for_each (existing step merged with the patch), not the raw patch
    alone — see _validate_for_each_source."""

    def _items_step(self, *, for_each=None) -> dict:
        return {
            "action": {"action": "for_each"},
            "intent": "download_each_file",
            "for_each": for_each if for_each is not None else {
                "items": "files",
                "as": "file",
                "max_iterations": 50,
                "steps": [],
            },
        }

    def test_valid_items_patch_is_allowed(self):
        step = self._items_step()
        validate_editor_patch(step, {"for_each": {"max_iterations": 10}}, {})

    def test_invalid_items_id_raises(self):
        step = self._items_step()
        with pytest.raises(ValueError, match="for_each_items_must_be_valid_input_id"):
            validate_editor_patch(step, {"for_each": {"items": "not a valid id!"}}, {})

    def test_both_sources_in_one_patch_raises(self):
        step = _for_each_step()  # rows-based
        with pytest.raises(ValueError, match="for_each_requires_exactly_one_row_source"):
            validate_editor_patch(step, {"for_each": {"items": "files"}}, {})

    def test_neither_source_raises(self):
        step = self._items_step()
        with pytest.raises(ValueError, match="for_each_items_must_be_valid_input_id"):
            validate_editor_patch(step, {"for_each": {"items": ""}}, {})

    def test_switching_items_to_rows_without_clearing_items_raises(self):
        step = self._items_step()
        with pytest.raises(ValueError, match="for_each_requires_exactly_one_row_source"):
            validate_editor_patch(step, {"for_each": {"rows": {"container_selector": "table tr"}}}, {})

    def test_proper_switch_from_rows_to_items_is_allowed(self):
        step = _for_each_step()  # rows-based
        validate_editor_patch(
            step,
            {"for_each": {"rows": {"container_selector": ""}, "items": "files"}},
            {},
        )
