"""EXEC-38-UI (partial): the re-target wizard (preview_retarget/apply_retarget) and cmd_patch_step
now accept a `for_each.steps[N]` nested_path, so a loop body step gets the same Pick
element/Review selectors/Validation experience a top-level step gets — not just the read-only
ForEachBodyViewer. See conxa_compile/editor/step_path.py for the shared path-addressing helper.
"""

from __future__ import annotations

import pytest

from conxa_compile.editor.step_path import StepPathError, get_nested_step, parse_nested_step_path, with_nested_step
from conxa_compile.editor.retarget import RetargetError, apply_retarget, preview_retarget
from conxa_compile.editor.patch_gate import validate_editor_patch


_EXISTING_BBOX = {"x": 1, "y": 2, "w": 20, "h": 20}


def _nested_click_step(selector: str = '[data-testid="download-btn"]') -> dict:
    return {
        "action": {"action": "click"},
        "intent": "click_download",
        "target": {"primary_selector": selector, "fallback_selectors": []},
        "identity_bundle": {
            "signals": [
                {"engine": "testid", "selector": f'internal:testid={selector.strip("[]").split("=")[-1].strip(chr(34))}',
                 "durability": 0.97, "orthogonality_class": "test-id", "unique_at_compile": True, "source": "compiler"},
            ],
            "fingerprint": {"data_testid": "download-btn"},
        },
        "validation": {"wait_for": {}, "success_conditions": {}, "assertions": []},
        "recovery": {},
        # apply_retarget always calls into recording_visual's bbox/vision-anchor update first,
        # which requires meta.source_session_id — matching bbox exactly here takes the "nothing
        # to redraw" early-return path (see update_step_visual_bbox_and_regenerate_anchors_or_raise),
        # so these tests exercise the selector/validation write path without needing a real
        # recording session or screenshot on disk.
        "signals": {"visual": {"bbox": dict(_EXISTING_BBOX)}},
    }


def _document(nested_body: list[dict] | None = None) -> dict:
    body = nested_body if nested_body is not None else [_nested_click_step()]
    steps = [
        {"action": {"action": "navigate"}, "intent": "x", "url": "https://example.com"},
        {
            "action": {"action": "for_each"},
            "intent": "download_each_selected_file",
            "for_each": {"items": "files", "as": "file", "max_iterations": 50, "steps": body},
        },
    ]
    return {
        "meta": {"id": "skill_x", "version": 1, "source_session_id": "sess_x"},
        "skills": [{"steps": steps}],
        "inputs": [{"id": "files", "type": "text"}],
    }


# ── step_path.py ────────────────────────────────────────────────────────────────────


def test_parse_nested_step_path_for_each():
    assert parse_nested_step_path("for_each.steps[2]") == ("for_each", 2)


def test_parse_nested_step_path_branch():
    assert parse_nested_step_path("branch.steps[0]") == ("branch", 0)


def test_parse_nested_step_path_absent():
    assert parse_nested_step_path(None) is None
    assert parse_nested_step_path("") is None


def test_parse_nested_step_path_rejects_garbage():
    with pytest.raises(StepPathError):
        parse_nested_step_path("for_each.steps[abc]")
    with pytest.raises(StepPathError):
        parse_nested_step_path("while.steps[0]")


def test_get_and_with_nested_step_round_trip():
    parent = {"for_each": {"items": "files", "steps": [{"a": 1}, {"a": 2}]}}
    assert get_nested_step(parent, ("for_each", 1)) == {"a": 2}
    updated = with_nested_step(parent, ("for_each", 1), {"a": 99})
    assert updated["for_each"]["steps"] == [{"a": 1}, {"a": 99}]
    # Original untouched (pure function).
    assert parent["for_each"]["steps"][1] == {"a": 2}


def test_get_nested_step_out_of_range_raises():
    with pytest.raises(StepPathError):
        get_nested_step({"for_each": {"steps": []}}, ("for_each", 0))


# ── retarget.py: preview/apply against a for_each nested step ──────────────────────


def test_preview_retarget_reads_the_nested_step_not_the_parent():
    doc = _document()
    result = preview_retarget(doc, 1, {"x": 0, "y": 0, "w": 10, "h": 10}, regenerate=False, nested_path=("for_each", 0))
    selectors = [c["selector"] for c in result["candidates"]]
    assert any("download-btn" in s for s in selectors)


def test_preview_retarget_stale_nested_index_raises():
    doc = _document()
    with pytest.raises(RetargetError):
        preview_retarget(doc, 1, {"x": 0, "y": 0, "w": 10, "h": 10}, regenerate=False, nested_path=("for_each", 5))


def test_apply_retarget_updates_only_the_nested_step():
    doc = _document(nested_body=[_nested_click_step(), _nested_click_step('[data-testid="other-btn"]')])
    payload = {
        "bbox": dict(_EXISTING_BBOX),
        "primary_selector": '[data-testid="renamed-btn"]',
        "fallback_selectors": [],
        "keep_validation": True,
    }
    out = apply_retarget(doc, 1, payload, nested_path=("for_each", 0))
    for_each = out["skills"][0]["steps"][1]["for_each"]
    assert for_each["steps"][0]["target"]["primary_selector"] == '[data-testid="renamed-btn"]'
    # Sibling nested step and loop config untouched.
    assert for_each["steps"][1]["target"]["primary_selector"] == '[data-testid="other-btn"]'
    assert for_each["items"] == "files"
    assert for_each["max_iterations"] == 50
    # The parent for_each step itself still has no element target of its own.
    assert "target" not in out["skills"][0]["steps"][1] or not out["skills"][0]["steps"][1].get("target")


def test_apply_retarget_stale_nested_index_raises():
    doc = _document()
    payload = {"bbox": dict(_EXISTING_BBOX), "primary_selector": "#x", "fallback_selectors": []}
    # The bbox/vision-anchor step (recording_visual.py) raises a plain ValueError for an
    # out-of-range index, same as it always has for a bad top-level step_index — apply_retarget
    # doesn't wrap it into RetargetError. Pre-existing behavior, not something this change alters.
    with pytest.raises(ValueError):
        apply_retarget(doc, 1, payload, nested_path=("for_each", 5))


# ── patch_gate.py: for_each nested steps keep recovery/validation patchable ────────


def test_for_each_nested_patch_allows_validation_and_recovery():
    # in_branch_body=False (the for_each case) must NOT reject recovery/validation — the whole
    # point of a loop body running through the real recovery cascade (EXEC-38) is that its
    # validation/recovery blocks are meaningful and the wizard's Validation phase can edit them.
    step = _nested_click_step()
    validate_editor_patch(step, {"validation": {"wait_for": {"kind": "text_present"}}}, {}, in_branch_body=False)
    validate_editor_patch(step, {"recovery": {"anchors": []}}, {}, in_branch_body=False)


def test_branch_nested_patch_still_rejects_validation_and_recovery():
    # Unchanged existing behavior — branch bodies never enter recovery, so patching either block
    # there stays rejected. Regression guard for the in_branch_body reasoning this file relies on.
    step = _nested_click_step()
    with pytest.raises(ValueError):
        validate_editor_patch(step, {"validation": {"wait_for": {}}}, {}, in_branch_body=True)
    with pytest.raises(ValueError):
        validate_editor_patch(step, {"recovery": {"anchors": []}}, {}, in_branch_body=True)
