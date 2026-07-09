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


def test_step_to_dto_surfaces_identity_signal_metadata_and_confidence():
    """identity_engines must carry orthogonality_class/unique_at_compile/source (not just
    selector/engine/durability), and compile_confidence must be derived from the bundle when
    nothing is already persisted at target.selector_confidence."""
    step = _fill_step()
    step["identity_bundle"] = {
        "signals": [
            {
                "engine": "testid",
                "selector": "[data-testid=\"email\"]",
                "durability": 0.99,
                "orthogonality_class": "test-contract",
                "unique_at_compile": True,
                "source": "compiler",
            },
            {
                "engine": "css-id",
                "selector": "#email",
                "durability": 0.45,
                "orthogonality_class": "structural",
                "unique_at_compile": True,
                "source": "compiler",
            },
        ]
    }
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert dto.identity_engines[0] == {
        "selector": "[data-testid=\"email\"]",
        "engine": "testid",
        "durability": 0.99,
        "orthogonality_class": "test-contract",
        "unique_at_compile": True,
        "source": "compiler",
    }
    # Two orthogonality classes represented + a unique-at-compile signal -> no discount factors.
    assert dto.compile_confidence == 0.99


def test_step_to_dto_prefers_persisted_selector_confidence_over_bundle_derivation():
    step = _fill_step()
    step["identity_bundle"] = {
        "signals": [
            {"engine": "testid", "selector": "[data-testid=\"email\"]", "durability": 0.99,
             "orthogonality_class": "test-contract", "unique_at_compile": True, "source": "compiler"},
        ]
    }
    step["target"]["selector_confidence"] = 0.42
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert dto.compile_confidence == 0.42


def test_step_to_dto_compile_confidence_none_without_identity_bundle():
    dto = step_to_dto("skill_1", _fill_step(), 0, {}, "")
    assert dto.compile_confidence is None
