"""BUILD-26 stage g: the third proposal kind — typed structural ops (insert/delete/move a step,
or a workflow-level input/literal edit). Gated the same way the other two are, plus two rules
unique to this kind: every op requires non-empty `evidence_refs`, and an `insert_step` of a
selector-bearing kind is refused unless it names an existing step to clone identity from (the
model never writes a selector).
"""

from __future__ import annotations

from conxa_compile.editor.copilot_proposals import gate_structural_proposals
from conxa_compile.compiler.step_key import step_keys


def _doc(steps: list[dict]) -> dict:
    return {"meta": {"version": 1}, "skills": [{"steps": steps}]}


def _click(**overrides) -> dict:
    step = {
        "action": {"action": "click"},
        "url": "https://x",
        "intent": "click_submit",
        "value": "",
        "identity_bundle": {
            "signals": [{"engine": "testid", "selector": "[data-testid=submit]", "durability": 0.9}],
        },
        "target": {"primary_selector": "[data-testid=submit]"},
    }
    step.update(overrides)
    return step


def test_insert_step_of_a_non_selector_kind_needs_no_identity_source():
    doc = _doc([_click()])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {
            "op": "insert_step", "action_kind": "ai_review", "after_step_key": keys[0],
            "fields": {"ai_review_prompt": "Did it work?"},
            "why": "checkpoint", "evidence_refs": [keys[0]],
        },
    ])
    assert len(out) == 1
    assert out[0]["command"] == "structural_op"
    assert out[0]["op"] == "insert_step"
    assert out[0]["identity_from_step_key"] is None


def test_insert_step_of_a_selector_kind_is_dropped_without_identity_from_step_key():
    doc = _doc([_click()])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {"op": "insert_step", "action_kind": "hover", "after_step_key": keys[0], "why": "x", "evidence_refs": [keys[0]]},
    ])
    assert out == []


def test_insert_step_of_a_selector_kind_clones_the_named_steps_identity():
    doc = _doc([_click()])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {
            "op": "insert_step", "action_kind": "hover", "after_step_key": keys[0],
            "identity_from_step_key": keys[0], "why": "hover before clicking", "evidence_refs": [keys[0]],
        },
    ])
    assert len(out) == 1
    assert out[0]["identity_from_step_key"] == keys[0]


def test_insert_step_of_a_non_selector_kind_with_an_identity_source_is_dropped():
    """A model naming identity_from_step_key for a kind that carries no target is a model error,
    not something to silently ignore — the proposal is dropped entirely."""
    doc = _doc([_click()])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {
            "op": "insert_step", "action_kind": "wait", "after_step_key": keys[0],
            "identity_from_step_key": keys[0], "why": "x", "evidence_refs": [keys[0]],
        },
    ])
    assert out == []


def test_every_op_requires_non_empty_evidence_refs():
    doc = _doc([_click()])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {"op": "delete_step", "step_key": keys[0], "why": "unused"},  # no evidence_refs
    ])
    assert out == []


def test_delete_step_of_an_unknown_step_key_is_dropped():
    doc = _doc([_click()])
    out = gate_structural_proposals(doc, [
        {"op": "delete_step", "step_key": "not-a-real-key", "why": "x", "evidence_refs": ["x"]},
    ])
    assert out == []


def test_move_step_after_itself_is_dropped():
    doc = _doc([_click(), _click(intent="click_confirm")])
    keys = step_keys(doc["skills"][0]["steps"])
    out = gate_structural_proposals(doc, [
        {"op": "move_step", "step_key": keys[0], "after_step_key": keys[0], "why": "x", "evidence_refs": ["x"]},
    ])
    assert out == []


def test_update_inputs_requires_a_list():
    doc = _doc([_click()])
    out = gate_structural_proposals(doc, [
        {"op": "update_inputs", "inputs": "not-a-list", "why": "x", "evidence_refs": ["x"]},
    ])
    assert out == []
    out2 = gate_structural_proposals(doc, [
        {"op": "update_inputs", "inputs": [{"id": "report_date", "type": "string"}], "why": "x", "evidence_refs": ["x"]},
    ])
    assert len(out2) == 1


def test_replace_literals_requires_a_non_empty_find():
    doc = _doc([_click()])
    out = gate_structural_proposals(doc, [
        {"op": "replace_literals", "find": "", "replace": "x", "why": "x", "evidence_refs": ["x"]},
    ])
    assert out == []


def test_unknown_op_is_dropped():
    doc = _doc([_click()])
    out = gate_structural_proposals(doc, [{"op": "delete_the_whole_workflow", "why": "x", "evidence_refs": ["x"]}])
    assert out == []
