"""EXEC-38: workflow_mutations.py's _new_manual_step scaffold + insert_step_after for
for_each, mirroring the branch-primitive scaffolding tests."""

from __future__ import annotations

from conxa_compile.editor.workflow_mutations import _new_manual_step, insert_step_after


def test_new_manual_step_scaffolds_a_loadable_for_each():
    step = _new_manual_step("for_each", "https://x.test")
    assert step["action"]["action"] == "for_each"
    assert step["intent"] == "process_each_row"
    for_each = step["for_each"]
    assert for_each["rows"] == {"container_selector": ""}
    assert for_each["as"] == "row"
    assert for_each["max_iterations"] == 50  # required field ships with a default, not absent
    assert for_each["on_row_error"] == "stop"
    assert for_each["steps"] == []


def test_for_each_is_insertable_into_a_document():
    doc = {"skills": [{"steps": [
        {"action": {"action": "navigate"}, "intent": "go", "url": "https://x.test"},
    ]}]}
    out = insert_step_after(doc, "for_each", 0)
    steps = out["skills"][0]["steps"]
    assert len(steps) == 2
    assert steps[1]["action"]["action"] == "for_each"
