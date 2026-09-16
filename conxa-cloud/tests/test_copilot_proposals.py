"""Copilot proposal gating (BUILD-26 stages c1-c3).

Every raw {step_key, field, patch, why} object the LLM returns must clear the SAME patch_gate a
manual edit clears before it is ever shown, and must never be trusted to still be valid by the
time it is accepted — an insert/delete/reorder between proposal and accept renumbers steps
(BUILD-22/BUILD-23), which is exactly the failure step_key exists to prevent.
"""

from __future__ import annotations

from conxa_compile.editor.copilot_proposals import ProposalError, gate_proposals, resolve_step_index
from conxa_compile.editor.workflow_mutations import delete_step_at, reorder_steps


def _doc(steps: list[dict]) -> dict:
    return {"meta": {"version": 1}, "skills": [{"steps": steps}]}


def _click(stable_hash: str, **overrides) -> dict:
    step = {
        "action": {"action": "click"},
        "url": "https://x",
        "identity_bundle": {"stable_hash": stable_hash},
        "intent": "click_submit",
        "value": "",
    }
    step.update(overrides)
    return step


def test_a_valid_proposal_is_shaped_with_an_id_command_and_preview():
    doc = _doc([_click("h1", value="old text")])
    proposals = gate_proposals(doc, [
        {"step_key": "h1#1", "field": "value", "patch": "new text", "why": "matches the recorded page"},
    ])
    assert len(proposals) == 1
    p = proposals[0]
    assert p["command"] == "patch_step"
    assert p["step_key"] == "h1#1"
    assert p["patch"] == {"value": "new text"}
    assert p["preview"] == {"before": "old text", "after": "new text"}
    assert p["why"] == "matches the recorded page"
    assert p["id"]  # a uuid, some non-empty string


def test_a_dotted_field_becomes_a_nested_patch():
    doc = _doc([_click("h1")])
    proposals = gate_proposals(doc, [
        {"step_key": "h1#1", "field": "validation.assertions", "patch": [{"type": "text_present", "target": "Done"}]},
    ])
    assert len(proposals) == 1
    assert proposals[0]["patch"] == {"validation": {"assertions": [{"type": "text_present", "target": "Done"}]}}


def test_selector_bearing_fields_are_never_proposed():
    doc = _doc([_click("h1")])
    for forbidden in ("target", "identity_bundle", "compiled_selectors", "primary_selector", "fallback_selectors"):
        proposals = gate_proposals(doc, [{"step_key": "h1#1", "field": forbidden, "patch": "whatever"}])
        assert proposals == [], f"{forbidden} must never be proposable"


def test_unknown_step_key_is_dropped_silently():
    doc = _doc([_click("h1")])
    proposals = gate_proposals(doc, [{"step_key": "does-not-exist#1", "field": "value", "patch": "x"}])
    assert proposals == []


def test_a_patch_that_fails_the_gate_is_dropped_not_shown_broken():
    doc = _doc([_click("h1")])
    # Malformed placeholder syntax — patch_gate.py's _validate_value_placeholders rejects it.
    proposals = gate_proposals(doc, [{"step_key": "h1#1", "field": "value", "patch": "{{bad-name}}"}])
    assert proposals == []


def test_malformed_raw_proposals_are_ignored():
    doc = _doc([_click("h1")])
    proposals = gate_proposals(doc, ["not a dict", {"field": "value"}, {"step_key": "h1#1"}, None])
    assert proposals == []


def test_resolve_step_index_finds_the_current_position():
    doc = _doc([_click("h1"), _click("h2")])
    assert resolve_step_index(doc, "h1#1") == 0
    assert resolve_step_index(doc, "h2#1") == 1


def test_resolve_step_index_survives_a_reorder():
    doc = _doc([_click("h1"), _click("h2")])
    reordered = reorder_steps(doc, [1, 0])
    assert resolve_step_index(reordered, "h1#1") == 1
    assert resolve_step_index(reordered, "h2#1") == 0


def test_resolve_step_index_raises_when_the_step_was_deleted():
    doc = _doc([_click("h1"), _click("h2")])
    after_delete = delete_step_at(doc, 0)
    try:
        resolve_step_index(after_delete, "h1#1")
        assert False, "expected ProposalError"
    except ProposalError as exc:
        assert exc.code == "proposal_stale"
