"""EXEC-13: workflow_mutations.py's _new_manual_step scaffold + insert_step_after for
ai_review, mirroring test_for_each_mutations.py's for_each coverage."""

from __future__ import annotations

from conxa_compile.editor.action_registry import default_action_value
from conxa_compile.editor.workflow_dto import step_to_dto
from conxa_compile.editor.workflow_mutations import _new_manual_step, insert_step_after


def test_new_manual_step_scaffolds_a_loadable_ai_review():
    step = _new_manual_step("ai_review", "https://x.test")
    assert step["action"]["action"] == "ai_review"
    assert step["intent"] == "ai_review_checkpoint"
    # Blank prompt is deliberate — patch_gate rejects a blank prompt on save, and the builder
    # drops a still-blank one at build time with a warning (see
    # test_saved_skill_export_drops_unconfigured_ai_review_with_warning).
    assert step["ai_review_prompt"] == ""
    assert step["ai_review_on_failure"] == "abort"
    schema = step["ai_review_output_schema"]
    assert schema["required"] == ["answer", "why"]
    assert schema["properties"]["answer"]["enum"] == ["yes", "no"]
    # Output binding name — the "value" a value-bearing, non-selector action carries.
    assert step["value"] == "review_answer"
    assert step["action"]["value"] == "review_answer"


def test_default_action_value_seeds_an_output_binding_name():
    assert default_action_value("ai_review") == "review_answer"


def test_ai_review_is_insertable_into_a_document():
    doc = {"skills": [{"steps": [
        {"action": {"action": "navigate"}, "intent": "go", "url": "https://x.test"},
    ]}]}
    out = insert_step_after(doc, "ai_review", 0)
    steps = out["skills"][0]["steps"]
    assert len(steps) == 2
    assert steps[1]["action"]["action"] == "ai_review"


def test_step_to_dto_surfaces_ai_review_fields():
    """Previously invisible to the renderer — persisted on disk and gated by patch_gate, but
    with no StepEditorDTO projection (check_kind/check_pattern's precedent, dto.py)."""
    step = {
        "action": {"action": "ai_review", "value": "error_present"},
        "intent": "ai_review_checkpoint",
        "value": "error_present",
        "target": {"primary_selector": "", "fallback_selectors": []},
        "signals": {"selectors": {}, "semantic": {}},
        "validation": {"wait_for": {"type": "none"}, "success_conditions": {}},
        "ai_review_prompt": "Is there an error banner on this page?",
        "ai_review_output_schema": {"type": "object", "required": ["answer"]},
        "ai_review_on_failure": "use_default",
        "ai_review_default_value": {"answer": "no"},
    }
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert dto.ai_review_prompt == "Is there an error banner on this page?"
    assert dto.ai_review_output_schema == {"type": "object", "required": ["answer"]}
    assert dto.ai_review_on_failure == "use_default"
    assert dto.ai_review_default_value == {"answer": "no"}


def test_step_to_dto_ai_review_fields_are_none_for_other_step_kinds():
    step = {
        "action": {"action": "fill", "value": "alice@example.com"},
        "intent": "Enter email",
        "value": "alice@example.com",
        "target": {"primary_selector": "#email", "fallback_selectors": []},
        "signals": {"selectors": {}, "semantic": {}},
        "validation": {"wait_for": {"type": "none"}, "success_conditions": {}},
    }
    dto = step_to_dto("skill_1", step, 0, {}, "")
    assert dto.ai_review_prompt is None
    assert dto.ai_review_output_schema is None
    assert dto.ai_review_on_failure is None
    assert dto.ai_review_default_value is None
