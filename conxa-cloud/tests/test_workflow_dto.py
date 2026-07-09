"""step_to_dto: the editor DTO must surface validation.assertions to the Human Edit UI."""

from __future__ import annotations

from conxa_compile.editor.workflow_dto import step_to_dto


def _fill_step() -> dict:
    return {
        "action": {"action": "fill", "value": "alice@example.com"},
        "intent": "Enter email address",
        "value": "alice@example.com",
        "target": {"primary_selector": "#email", "fallback_selectors": []},
        "signals": {"selectors": {}, "semantic": {}},
        "validation": {
            "wait_for": {"type": "none"},
            "success_conditions": {},
            "assertions": [
                {"type": "value_equals", "target": "#email", "expected": "alice@example.com", "required": True},
            ],
        },
    }


def test_step_to_dto_surfaces_assertions():
    dto = step_to_dto("skill_1", _fill_step(), 0, {}, "")
    assert dto.validation["wait_for"] == {"type": "none"}
    assert dto.validation["assertions"] == [
        {"type": "value_equals", "target": "#email", "expected": "alice@example.com", "required": True},
    ]


def test_step_to_dto_assertions_default_to_empty_list():
    step = _fill_step()
    del step["validation"]["assertions"]
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert dto.validation["assertions"] == []


def test_step_to_dto_drops_non_dict_assertion_entries():
    step = _fill_step()
    step["validation"]["assertions"].append("not-a-dict")  # malformed data shouldn't reach the UI
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert len(dto.validation["assertions"]) == 1
