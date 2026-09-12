"""EXEC-38: SkillStep.for_each -> execution.json serialization (_saved_for_each_step /
_saved_step_to_execution_step), and the action-registry wiring that makes it insertable."""

from __future__ import annotations

from conxa_compile.skill_package_builder_saved_skill import (
    _saved_for_each_step,
    _saved_step_to_execution_step,
)
from conxa_compile.editor.action_registry import (
    INSERTABLE_ACTIONS,
    is_supported_action,
    normalize_action_kind,
)


def _body_click_step(selector: str = '[data-testid="delete-btn"]') -> dict:
    return {
        "action": {"action": "click"},
        "target": {"primary_selector": selector},
        "identity_bundle": {
            "signals": [{"engine": "testid", "selector": f"internal:testid={selector}", "durability": 0.99}],
            "fingerprint": {"data_testid": "delete-btn"},
        },
        "entity_binding": {
            "container_selector": "table#invoices tr",
            "identifier": "{{row_id}}",
            "source": "input",
            "confirmed": True,
        },
    }


def _for_each_source_step(*, max_iterations=50, on_row_error=None, body=None, container="table#invoices tr") -> dict:
    for_each: dict = {
        "rows": {"container_selector": container},
        "as": "row",
        "max_iterations": max_iterations,
        "steps": body if body is not None else [_body_click_step()],
    }
    if on_row_error is not None:
        for_each["on_row_error"] = on_row_error
    return {"action": {"action": "for_each"}, "for_each": for_each}


def test_for_each_is_registered_as_a_supported_insertable_action():
    assert normalize_action_kind("for_each") == "for_each"
    assert is_supported_action("for_each")
    assert "for_each" in INSERTABLE_ACTIONS


def test_serializes_a_well_formed_for_each_step():
    out = _saved_for_each_step(_for_each_source_step())
    assert out["type"] == "for_each"
    assert out["rows"] == {"container_selector": "table#invoices tr"}
    assert out["as"] == "row"
    assert out["max_iterations"] == 50
    assert "on_row_error" not in out  # default (stop) is omitted, not written as "stop"
    assert len(out["steps"]) == 1
    assert out["steps"][0]["type"] == "click"
    assert out["steps"][0]["entity_binding"]["identifier"] == "{{row_id}}"


def test_on_row_error_continue_is_preserved():
    out = _saved_for_each_step(_for_each_source_step(on_row_error="continue"))
    assert out["on_row_error"] == "continue"


def test_default_as_name_is_row_when_omitted():
    step = _for_each_source_step()
    del step["for_each"]["as"]
    out = _saved_for_each_step(step)
    assert out["as"] == "row"


def test_missing_container_selector_drops_the_step():
    out = _saved_for_each_step(_for_each_source_step(container=""))
    assert out is None


def test_empty_body_drops_the_step():
    out = _saved_for_each_step(_for_each_source_step(body=[]))
    assert out is None


def test_missing_max_iterations_drops_the_step():
    step = _for_each_source_step()
    del step["for_each"]["max_iterations"]
    assert _saved_for_each_step(step) is None


def test_zero_or_negative_max_iterations_drops_the_step():
    assert _saved_for_each_step(_for_each_source_step(max_iterations=0)) is None
    assert _saved_for_each_step(_for_each_source_step(max_iterations=-5)) is None


def test_nested_body_is_recursively_serialized_same_as_a_branch_body():
    step = _for_each_source_step(body=[_body_click_step(), _body_click_step('[data-testid="confirm-btn"]')])
    out = _saved_for_each_step(step)
    assert len(out["steps"]) == 2
    assert out["steps"][1]["selector"] or out["steps"][1].get("target")


def test_dispatches_through_the_generic_saved_step_serializer():
    out = _saved_step_to_execution_step(_for_each_source_step())
    assert out is not None
    assert out["type"] == "for_each"
