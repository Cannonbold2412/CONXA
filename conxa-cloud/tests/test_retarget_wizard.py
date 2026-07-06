"""Tests for the 3-phase re-target wizard: conxa_compile/editor/retarget.py.

Phase 2/3 preview (`preview_retarget`) must never persist. Phase 3 apply
(`apply_retarget`) composes bbox + target selectors + identity_bundle +
validation atomically. The handler layer (`cmd_retarget_apply`) must land
exactly one undo entry for the whole wizard.
"""

from __future__ import annotations

import gzip
import importlib.util
import json
import os
import sys

import pytest

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))

SESSION_ID = "sess_retarget_1"
DOM_HASH = "a" * 64
SKILL_ID = "skill_retarget_1"

DOM_HTML = (
    "<html><body>"
    '<button id="new-btn" data-testid="submit-btn">Submit</button>'
    '<div class="dup">x</div><div class="dup">y</div>'
    "</body></html>"
)

RECORDED_EVENT = {
    "snapshot": {"ref": "ref-1", "dom_hash": DOM_HASH},
    "visual": {
        "bbox": {"x": 10, "y": 10, "w": 50, "h": 20},
        "full_screenshot": f"sessions/{SESSION_ID}/images/step0_full.png",
    },
    "target": {
        "tag": "button",
        "id": "old-btn",
        "classes": [],
        "inner_text": "Submit",
        "role": "button",
        "aria_label": None,
        "name": None,
        "placeholder": None,
    },
    "action": {"action": "click"},
    "ancestors": [],
    "surrounding_text": "Submit",
    "state_change": {"url_changed": False, "dom_changed": True},
    "page": {"url": "https://example.com/form"},
}


def _base_step() -> dict:
    return {
        "intent": "click_submit",
        "action": {"action": "click"},
        "target": {"primary_selector": "#old-selector", "fallback_selectors": []},
        "identity_bundle": {"signals": []},
        "signals": {
            "snapshot": {"ref": "ref-1", "dom_hash": DOM_HASH},
            "visual": dict(RECORDED_EVENT["visual"]),
            "dom": {"tag": "button", "inner_text": "Submit"},
        },
        "validation": {"wait_for": {"type": "none", "target": "", "timeout": 5000}, "assertions": []},
    }


def _base_document() -> dict:
    return {
        "meta": {"id": SKILL_ID, "version": 1, "source_session_id": SESSION_ID},
        "skills": [{"id": SKILL_ID, "steps": [_base_step()]}],
    }


@pytest.fixture()
def session_fixture(tmp_path, monkeypatch):
    from conxa_core import db
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    session_dir = tmp_path / "sessions" / SESSION_ID
    (session_dir / "blobs").mkdir(parents=True)
    (session_dir / "events.jsonl").write_text(json.dumps(RECORDED_EVENT) + "\n", encoding="utf-8")
    (session_dir / "blobs" / f"{DOM_HASH}.html.gz").write_bytes(gzip.compress(DOM_HTML.encode("utf-8")))
    return tmp_path


def _candidate(selector: str, rank: int, intent: str = ""):
    from conxa_compile.llm.openapi_client import SelectorCandidate

    return SelectorCandidate(selector=selector, rank=rank, intent=intent)


def _patch_raw_candidates(monkeypatch, candidates):
    """Patch at the compile_selectors_for_task layer (bypasses ITS internal
    uniqueness filtering) so retarget.py's own post-processing/classification
    can be exercised directly, including candidates that are not unique in the
    stored DOM snapshot."""
    monkeypatch.setattr(
        "conxa_compile.llm.selector_regeneration.compile_selectors_for_task",
        lambda *_a, **_k: candidates,
    )


def _patch_llm_candidates(monkeypatch, candidates):
    """Patch one level lower, at generate_selector_candidates, so the real
    compile_selectors_for_task (including its own validate/rank/cache) runs —
    an end-to-end wiring check."""
    monkeypatch.setattr(
        "conxa_compile.llm.selector_regeneration.generate_selector_candidates",
        lambda **_kwargs: candidates,
    )


def _patch_validation_planner(monkeypatch, *, wait_for=None, assertions=None):
    from conxa_core.models.skill_spec import Assertion

    fixed_wait_for = wait_for if wait_for is not None else {"type": "url_change", "target": "", "timeout": 8000}
    fixed_assertions = assertions if assertions is not None else []
    monkeypatch.setattr(
        "conxa_compile.compiler.validation_planner.infer_wait_for_shape",
        lambda *_a, **_k: dict(fixed_wait_for),
    )
    monkeypatch.setattr(
        "conxa_compile.compiler.build._build_assertions",
        lambda *_a, **_k: [Assertion(**a) for a in fixed_assertions],
    )


# --- preview_retarget ---------------------------------------------------------


def test_preview_returns_ranked_candidates_with_match_counts(session_fixture, monkeypatch):
    """Exercises retarget.py's own candidate classification directly — raw
    candidates come straight from the mock, bypassing compile_selectors_for_task's
    internal uniqueness filter, so an ambiguous (2-match) candidate can survive
    to be classified here."""
    from conxa_compile.editor.retarget import preview_retarget

    _patch_raw_candidates(
        monkeypatch,
        [
            _candidate('[data-testid="submit-btn"]', rank=0, intent="Submit the form"),
            _candidate(".dup", rank=1),
            _candidate("#not-there", rank=2),
        ],
    )
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    selectors = {c["selector"]: c for c in result["candidates"]}
    assert '[data-testid="submit-btn"]' in selectors
    assert ".dup" in selectors
    # zero-match candidate is dropped entirely
    assert "#not-there" not in selectors

    testid_cand = selectors['[data-testid="submit-btn"]']
    assert testid_cand["engine"] == "testid"
    assert testid_cand["match_count"] == 1
    assert testid_cand["unique"] is True
    assert testid_cand["descriptor"] == "Submit the form"

    dup_cand = selectors[".dup"]
    assert dup_cand["match_count"] == 2
    assert dup_cand["unique"] is False

    assert result["pick_quality"] == "good"  # testid candidate is unique + durable
    # preview never persists — original doc argument is untouched
    assert doc["meta"]["version"] == 1


def test_preview_end_to_end_llm_wiring_filters_to_unique_candidates(session_fixture, monkeypatch):
    """compile_selectors_for_task validates candidates itself before returning —
    only the unique (in-snapshot) selector should reach preview_retarget's result
    when going through the real function via a generate_selector_candidates mock."""
    from conxa_compile.editor.retarget import preview_retarget

    _patch_llm_candidates(
        monkeypatch,
        [
            _candidate('[data-testid="submit-btn"]', rank=0, intent="Submit the form"),
            _candidate(".dup", rank=1),
            _candidate("#not-there", rank=2),
        ],
    )
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    selectors = {c["selector"] for c in result["candidates"]}
    assert selectors == {'[data-testid="submit-btn"]'}
    assert result["pick_quality"] == "good"


def test_preview_pick_quality_ambiguous_when_no_unique_durable_candidate(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import preview_retarget

    _patch_raw_candidates(monkeypatch, [_candidate(".dup", rank=0)])
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["candidates"]
    assert result["pick_quality"] == "ambiguous"


def test_preview_pick_quality_none_when_llm_returns_nothing_usable(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import preview_retarget

    _patch_llm_candidates(monkeypatch, [])
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["candidates"] == []
    assert result["pick_quality"] == "none"


def test_preview_validation_diff_flags_change(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import preview_retarget

    _patch_llm_candidates(monkeypatch, [_candidate('[data-testid="submit-btn"]', rank=0)])
    _patch_validation_planner(
        monkeypatch,
        wait_for={"type": "url_change", "target": "", "timeout": 8000},
        assertions=[{"type": "url_changed", "target": "https://example.com/form", "timeout_ms": 8000, "required": True}],
    )

    doc = _base_document()  # current validation is {"type": "none", ...}, no assertions
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["validation_changed"] is True
    assert result["proposed_wait_for"]["type"] == "url_change"
    assert result["fast_finish"] is False  # good pick but validation changed


def test_preview_fast_finish_when_good_pick_and_validation_unchanged(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import preview_retarget

    _patch_llm_candidates(monkeypatch, [_candidate('[data-testid="submit-btn"]', rank=0)])
    _patch_validation_planner(monkeypatch, wait_for={"type": "none", "target": "", "timeout": 5000}, assertions=[])

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["validation_changed"] is False
    assert result["fast_finish"] is True


def test_preview_raises_session_artifacts_missing(tmp_path, monkeypatch):
    from conxa_core import db
    from conxa_core.config import settings
    from conxa_compile.editor.retarget import RetargetError, preview_retarget

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)
    # no events.jsonl / blobs written for this session

    doc = _base_document()
    with pytest.raises(RetargetError) as exc_info:
        preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})
    assert exc_info.value.code == "session_artifacts_missing"


def test_preview_rejects_tiny_bbox(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import RetargetError, preview_retarget

    doc = _base_document()
    with pytest.raises(RetargetError) as exc_info:
        preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 1, "h": 1})
    assert exc_info.value.code == "bbox_too_small"


# --- apply_retarget -----------------------------------------------------------


def test_apply_composes_bbox_target_and_identity_bundle(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import apply_retarget

    monkeypatch.setattr(
        "conxa_compile.llm.anchor_vision_llm.generate_anchors_for_step_or_raise",
        lambda *_a, **_k: [],
    )

    doc = _base_document()
    payload = {
        "bbox": {"x": 15, "y": 15, "w": 60, "h": 25},
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": ["#new-btn"],
        "keep_validation": True,
    }
    new_doc = apply_retarget(doc, 0, payload)

    step = new_doc["skills"][0]["steps"][0]
    assert step["signals"]["visual"]["bbox"] == {"x": 15, "y": 15, "w": 60, "h": 25}
    assert step["target"]["primary_selector"] == '[data-testid="submit-btn"]'
    assert step["target"]["fallback_selectors"] == ["#new-btn"]
    assert step["signals"]["compiled_selectors"] == ['[data-testid="submit-btn"]', "#new-btn"]
    assert new_doc["meta"]["version"] == 2
    # keep_validation=True leaves validation untouched
    assert step["validation"]["wait_for"] == {"type": "none", "target": "", "timeout": 5000}
    assert step["validation"]["assertions"] == []


def test_apply_regenerates_validation_when_not_kept(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import apply_retarget

    monkeypatch.setattr(
        "conxa_compile.llm.anchor_vision_llm.generate_anchors_for_step_or_raise",
        lambda *_a, **_k: [],
    )

    doc = _base_document()
    payload = {
        "bbox": {"x": 15, "y": 15, "w": 60, "h": 25},
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": [],
        "keep_validation": False,
        "proposed_wait_for": {"type": "url_change", "target": "", "timeout": 8000},
        "proposed_assertions": [
            {"type": "url_changed", "target": "https://example.com/form", "timeout_ms": 8000, "required": True}
        ],
    }
    new_doc = apply_retarget(doc, 0, payload)

    step = new_doc["skills"][0]["steps"][0]
    assert step["validation"]["wait_for"]["type"] == "url_change"
    assert step["validation"]["assertions"][0]["type"] == "url_changed"


def test_apply_rejects_selector_failing_quality_gates(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import RetargetError, apply_retarget

    monkeypatch.setattr(
        "conxa_compile.llm.anchor_vision_llm.generate_anchors_for_step_or_raise",
        lambda *_a, **_k: [],
    )

    doc = _base_document()
    payload = {
        "bbox": {"x": 15, "y": 15, "w": 60, "h": 25},
        "primary_selector": "div",  # too generic — fails selector_passes_filters
        "fallback_selectors": [],
        "keep_validation": True,
    }
    with pytest.raises(RetargetError) as exc_info:
        apply_retarget(doc, 0, payload)
    assert exc_info.value.code == "invalid_selector"


def test_apply_requires_a_chosen_selector(session_fixture, monkeypatch):
    from conxa_compile.editor.retarget import RetargetError, apply_retarget

    doc = _base_document()
    payload = {"bbox": {"x": 15, "y": 15, "w": 60, "h": 25}, "keep_validation": True}
    with pytest.raises(RetargetError) as exc_info:
        apply_retarget(doc, 0, payload)
    assert exc_info.value.code == "primary_selector_required"


# --- handler layer: single undo entry ------------------------------------------


@pytest.fixture()
def backend():
    spec = importlib.util.spec_from_file_location("cbackend_retarget", os.path.join(_PY_DIR, "backend.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: list[dict] = []
    from handlers import protocol as _protocol

    mod._write = lambda obj: out.append(obj)
    _protocol._write = lambda obj: out.append(obj)
    b = mod.Backend()
    return b, out


def test_cmd_retarget_apply_creates_single_undo_entry(backend, session_fixture, monkeypatch):
    from conxa_core.storage.json_store import read_skill, write_skill

    monkeypatch.setattr(
        "conxa_compile.llm.anchor_vision_llm.generate_anchors_for_step_or_raise",
        lambda *_a, **_k: [],
    )

    b, _out = backend
    write_skill(SKILL_ID, _base_document())

    payload = {
        "skill_id": SKILL_ID,
        "step_index": 0,
        "bbox": {"x": 15, "y": 15, "w": 60, "h": 25},
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": [],
        "keep_validation": True,
    }
    result = b.cmd_retarget_apply(payload, "rid")
    assert result["meta"]["version"] == 2

    assert len(b._undo_stacks.get(SKILL_ID, [])) == 1

    undo_result = b.cmd_undo_workflow({"skill_id": SKILL_ID}, "rid")
    restored = read_skill(SKILL_ID)
    assert restored["skills"][0]["steps"][0]["target"]["primary_selector"] == "#old-selector"
    assert undo_result["can_undo"] is False
