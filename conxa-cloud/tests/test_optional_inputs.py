"""An input variable flagged `optional` in Human Edit must not end up in the shipped
manifest's `inputs_required`, and must still round-trip through the saved-skill packager.
Without this, the runtime's pre-execution gate and the agent-facing tool schema would keep
demanding a value the user explicitly said was optional."""

from __future__ import annotations

from conxa_compile.editor.workflow_mutations import _validate_skill_inputs
from conxa_compile.skill_package_builder_output import _compute_inputs_required
from conxa_compile.skill_package_builder_saved_skill import _normalize_saved_skill_inputs


def test_optional_input_excluded_from_inputs_required():
    idata = {
        "inputs": [
            {"name": "email", "type": "string"},
            {"name": "region", "type": "string", "optional": True},
        ]
    }
    assert _compute_inputs_required(idata) == ["email"]


def test_explicit_required_list_still_wins():
    idata = {"required": ["a", "b"], "inputs": [{"name": "a"}, {"name": "b", "optional": True}]}
    assert _compute_inputs_required(idata) == ["a", "b"]


def test_no_optional_inputs_all_required():
    idata = {"inputs": [{"name": "a"}, {"name": "b"}]}
    assert _compute_inputs_required(idata) == ["a", "b"]


def test_normalize_saved_skill_inputs_preserves_optional_flag():
    inputs = _normalize_saved_skill_inputs(
        [{"id": "region", "label": "Region", "type": "text", "optional": True}]
    )
    assert inputs == [
        {
            "name": "region",
            "type": "string",
            "description": "Region",
            "optional": True,
        }
    ]


def test_normalize_saved_skill_inputs_omits_optional_when_unset():
    inputs = _normalize_saved_skill_inputs([{"id": "email", "label": "Email", "type": "text"}])
    assert "optional" not in inputs[0]


def test_validate_skill_inputs_accepts_optional_flag():
    _validate_skill_inputs([{"id": "region", "type": "text", "optional": True}])
