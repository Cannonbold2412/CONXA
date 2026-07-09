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
    # snapshot_ref / snapshot_dom_hash are top-level Step fields (see conxa_core Step schema and
    # compiler/build.py) — the recorded-event lookup keys off the step's top-level snapshot_ref,
    # not anything under `signals`.
    return {
        "intent": "click_submit",
        "action": {"action": "click"},
        "target": {"primary_selector": "#old-selector", "fallback_selectors": []},
        "identity_bundle": {"signals": []},
        "snapshot_ref": "ref-1",
        "snapshot_dom_hash": DOM_HASH,
        "signals": {
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
    (session_dir / "images").mkdir(parents=True)
    (session_dir / "events.jsonl").write_text(json.dumps(RECORDED_EVENT) + "\n", encoding="utf-8")
    (session_dir / "blobs" / f"{DOM_HASH}.html.gz").write_bytes(gzip.compress(DOM_HTML.encode("utf-8")))
    # region_selector_vision reads the recorded full-page screenshot to highlight the drawn
    # region before sending it to the vision LLM — a real (tiny) image is needed on disk.
    from PIL import Image

    Image.new("RGB", (100, 100), color="white").save(session_dir / "images" / "step0_full.png")
    return tmp_path


def _candidate(selector: str, rank: int, intent: str = ""):
    from conxa_compile.llm.openapi_client import SelectorCandidate

    return SelectorCandidate(selector=selector, rank=rank, intent=intent)


def _patch_raw_candidates(monkeypatch, candidates):
    """Patch at the compile_selectors_for_region layer (bypasses ITS internal
    caching/highlighting) so retarget.py's own post-processing/classification
    can be exercised directly, including candidates that are not unique in the
    stored DOM snapshot."""
    monkeypatch.setattr(
        "conxa_compile.llm.region_selector_vision.compile_selectors_for_region",
        lambda *_a, **_k: candidates,
    )


def _patch_llm_candidates(monkeypatch, candidates):
    """Patch one level lower, at call_llm, so the real compile_selectors_for_region
    (highlighting the drawn region on the recorded screenshot, base64-encoding, caching)
    runs — an end-to-end wiring check."""
    monkeypatch.setattr(
        "conxa_compile.llm.region_selector_vision.call_llm",
        lambda *_a, **_k: {"candidates": [c.to_dict() for c in candidates]},
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
    """Exercises retarget.py's own candidate classification + pruning directly — raw candidates
    come straight from the mock, so a non-unique (2-match) candidate reaches retarget.py's own
    validate_selector/prune step and must be dropped there (regenerate path must apply the same
    "no non-unique" rule as the review path)."""
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
    # non-unique (2-match) and zero-match candidates are both dropped — never offered
    assert ".dup" not in selectors
    assert "#not-there" not in selectors

    testid_cand = selectors['[data-testid="submit-btn"]']
    assert testid_cand["engine"] == "testid"
    assert testid_cand["match_count"] == 1
    assert testid_cand["unique"] is True
    assert testid_cand["descriptor"] == "Submit the form"

    assert result["pick_quality"] == "good"  # testid candidate is unique + durable
    # preview never persists — original doc argument is untouched
    assert doc["meta"]["version"] == 1


def test_preview_end_to_end_llm_wiring_filters_to_unique_candidates(session_fixture, monkeypatch):
    """Exercises the real compile_selectors_for_region (screenshot load + highlight + base64 +
    cache) via a call_llm mock — only the unique (in-snapshot) selector should reach
    preview_retarget's result once retarget.py's own validate_selector/prune step runs."""
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


def test_preview_regenerate_path_prunes_same_as_review_path(session_fixture, monkeypatch):
    """Regression: the regenerate path (user redraws the bbox, LLM proposes fresh candidates)
    must enforce the same "no non-unique, nothing below 30% durability" rule as the no-repick
    review path — a freshly re-picked element doesn't get a weaker bar than a reviewed one."""
    from conxa_compile.editor.retarget import preview_retarget

    _patch_raw_candidates(
        monkeypatch,
        [
            _candidate('[data-testid="submit-btn"]', rank=0),  # unique, 99% — survives
            _candidate(".dup", rank=1),  # matches 2 elements — must be pruned
            # unique (matches the first .dup div) but positional → durability 0.30*0.1=0.03,
            # well under the 30% floor — must be pruned despite being unique.
            _candidate("div:nth-of-type(1)", rank=2),
        ],
    )
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    selectors = {c["selector"] for c in result["candidates"]}
    assert selectors == {'[data-testid="submit-btn"]'}


def test_preview_pick_quality_none_when_only_candidate_is_not_unique(session_fixture, monkeypatch):
    """A non-unique candidate doesn't just fail to be "good" — it's pruned outright, so with
    nothing else offered the result is "none" (nothing to pick), not "ambiguous"."""
    from conxa_compile.editor.retarget import preview_retarget

    _patch_raw_candidates(monkeypatch, [_candidate(".dup", rank=0)])
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["candidates"] == []
    assert result["pick_quality"] == "none"


def test_preview_pick_quality_ambiguous_when_unique_but_below_good_bar(session_fixture, monkeypatch):
    """A unique candidate with durability between the prune floor (30%) and the "good" bar (50%)
    survives pruning (it's offered) but doesn't clear "good" — ambiguous, not none."""
    from conxa_compile.editor.retarget import preview_retarget

    # "#new-btn" matches the DOM_HTML's <button id="new-btn" ...> exactly once; css-id engine
    # scores 0.45 durability — above the 0.3 prune floor, below the 0.5 "good" bar.
    _patch_raw_candidates(monkeypatch, [_candidate("#new-btn", rank=0)])
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    assert result["candidates"]
    assert result["candidates"][0]["unique"] is True
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


def _fail_if_llm_called(monkeypatch):
    def _boom(*_a, **_k):
        raise AssertionError("compile_selectors_for_region must not run on the review path")

    monkeypatch.setattr("conxa_compile.llm.region_selector_vision.compile_selectors_for_region", _boom)


def test_preview_review_path_uses_compiled_selectors_without_llm(session_fixture, monkeypatch):
    """regenerate=False (user continues without re-picking) must reuse the selectors compiled
    earlier and never call the LLM."""
    from conxa_compile.editor.retarget import preview_retarget

    _fail_if_llm_called(monkeypatch)

    doc = _base_document()
    doc["skills"][0]["steps"][0]["target"] = {
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": [".dup"],
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    selectors = {c["selector"]: c for c in result["candidates"]}
    # .dup matches 2 elements → pruned as non-unique; the unique testid selector remains.
    assert set(selectors) == {'[data-testid="submit-btn"]'}
    assert selectors['[data-testid="submit-btn"]']["match_count"] == 1  # validated against the DOM snapshot
    assert result["pick_quality"] == "good"
    assert result["validation_changed"] is False  # nothing changed → no proposed diff
    assert doc["meta"]["version"] == 1  # never persists


def test_preview_review_path_surfaces_compile_time_uniqueness(session_fixture, monkeypatch):
    """The review path reuses the compiler's own per-signal `unique_at_compile` verdict, so
    role=/text= selectors it can't re-check offline still show as verified (not "unverified"),
    using the compiled engine + durability — and it never calls the LLM."""
    from conxa_compile.editor.retarget import preview_retarget

    _fail_if_llm_called(monkeypatch)

    doc = _base_document()
    step = doc["skills"][0]["steps"][0]
    step["target"] = {
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": [
            'role=button[name="Submit"]',
            'text="Submit"',
            ".dup",
            "/html[1]/body[1]/div[1]/button[1]",
        ],
    }
    step["identity_bundle"] = {
        "signals": [
            {"engine": "testid", "selector": 'internal:testid=[data-testid="submit-btn"]', "durability": 0.99, "unique_at_compile": True},
            {"engine": "role", "selector": 'internal:role=button[name="Submit"]', "durability": 0.9, "unique_at_compile": True},
            {"engine": "text_based", "selector": 'internal:text="Submit"', "durability": 0.8, "unique_at_compile": True},
            {"engine": "css-structural", "selector": ".dup", "durability": 0.3, "unique_at_compile": False},
            {"engine": "xpath", "selector": "/html[1]/body[1]/div[1]/button[1]", "durability": 0.01, "unique_at_compile": True},
        ]
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    by_sel = {c["selector"]: c for c in result["candidates"]}
    # role / text selectors are verified from the compile — NOT "unverified"
    assert by_sel['role=button[name="Submit"]']["verified"] == "unique"
    assert by_sel['role=button[name="Submit"]']["engine"] == "role"  # compiled engine, not misclassified as "name"
    assert by_sel['text="Submit"']["verified"] == "unique"
    assert by_sel['text="Submit"']["engine"] == "text_based"
    # the non-unique selector is pruned (could resolve to the wrong element at runtime)
    assert ".dup" not in by_sel
    # the near-zero-durability absolute XPath is pruned as categorically brittle, even though unique
    assert "/html[1]/body[1]/div[1]/button[1]" not in by_sel
    assert not any(c["verified"] == "unverified" for c in result["candidates"])
    assert result["pick_quality"] == "good"


def test_preview_review_path_surfaces_orthogonality_and_source(session_fixture, monkeypatch):
    """The review path's candidates must carry orthogonality_class + source through from the
    bundle's signals, not just selector/engine/durability — this is the identity metadata the
    Human Edit UI badges (and the runtime resolver) actually rely on."""
    from conxa_compile.editor.retarget import preview_retarget

    _fail_if_llm_called(monkeypatch)

    doc = _base_document()
    step = doc["skills"][0]["steps"][0]
    step["target"] = {"primary_selector": '[data-testid="submit-btn"]', "fallback_selectors": []}
    step["identity_bundle"] = {
        "signals": [
            {
                "engine": "testid",
                "selector": 'internal:testid=[data-testid="submit-btn"]',
                "durability": 0.99,
                "orthogonality_class": "test-contract",
                "unique_at_compile": True,
                "source": "compiler",
            },
        ]
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    cand = result["candidates"][0]
    assert cand["orthogonality_class"] == "test-contract"
    assert cand["source"] == "compiler"
    # a strong, unique, single-class signal still yields a confidence rollup on the response
    assert result["compile_confidence"] == pytest.approx(0.99 * 0.7)  # only one orthogonality class


def test_preview_regenerate_path_tags_candidates_as_llm_sourced(session_fixture, monkeypatch):
    """Freshly LLM-regenerated candidates (user re-picked the element) must be tagged
    source='llm', distinguishing them from the compiler's own selectors."""
    from conxa_compile.editor.retarget import preview_retarget

    _patch_raw_candidates(monkeypatch, [_candidate('[data-testid="submit-btn"]', rank=0)])
    _patch_validation_planner(monkeypatch)

    doc = _base_document()
    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20})

    cand = result["candidates"][0]
    assert cand["source"] == "llm"
    assert cand["orthogonality_class"] == "test-contract"


def test_preview_review_path_prunes_below_30pct_durability(session_fixture, monkeypatch):
    """Hard floor: a unique selector still gets pruned if its durability is under 30%; one at
    exactly 30% is kept."""
    from conxa_compile.editor.retarget import preview_retarget

    _fail_if_llm_called(monkeypatch)

    doc = _base_document()
    step = doc["skills"][0]["steps"][0]
    step["target"] = {
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": ["div.at-floor", "div.below-floor"],
    }
    step["identity_bundle"] = {
        "signals": [
            {"engine": "testid", "selector": 'internal:testid=[data-testid="submit-btn"]', "durability": 0.99, "unique_at_compile": True},
            {"engine": "css-structural", "selector": "div.at-floor", "durability": 0.30, "unique_at_compile": True},
            {"engine": "css-structural", "selector": "div.below-floor", "durability": 0.29, "unique_at_compile": True},
        ]
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    shown = {c["selector"] for c in result["candidates"]}
    assert "div.at-floor" in shown  # exactly 30% is kept
    assert "div.below-floor" not in shown  # under 30% does not move forward, even though unique


def test_preview_review_path_all_below_floor_yields_no_candidates(session_fixture, monkeypatch):
    """If every option is under the durability floor, none move forward — the list is empty and
    the wizard falls to its "re-pick" prompt rather than offering a too-weak selector."""
    from conxa_compile.editor.retarget import preview_retarget

    _fail_if_llm_called(monkeypatch)

    doc = _base_document()
    step = doc["skills"][0]["steps"][0]
    step["target"] = {"primary_selector": "div.weak", "fallback_selectors": ["span.weaker"]}
    step["identity_bundle"] = {
        "signals": [
            {"engine": "css-structural", "selector": "div.weak", "durability": 0.2, "unique_at_compile": True},
            {"engine": "css-structural", "selector": "span.weaker", "durability": 0.1, "unique_at_compile": True},
        ]
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    assert result["candidates"] == []
    assert result["pick_quality"] == "none"


def test_preview_review_path_works_without_recording_session(tmp_path, monkeypatch):
    """The review path doesn't need the recording session — no session_artifacts_missing, and
    selectors it can't DOM-verify come back as unverified (match_count -1) but still trusted."""
    from conxa_core import db
    from conxa_core.config import settings
    from conxa_compile.editor.retarget import preview_retarget

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)
    _fail_if_llm_called(monkeypatch)  # no session, and still no LLM

    doc = _base_document()
    doc["skills"][0]["steps"][0]["target"] = {
        "primary_selector": '[data-testid="submit-btn"]',
        "fallback_selectors": [],
    }

    result = preview_retarget(doc, 0, {"x": 10, "y": 10, "w": 40, "h": 20}, regenerate=False)

    cand = result["candidates"][0]
    assert cand["selector"] == '[data-testid="submit-btn"]'
    assert cand["match_count"] == -1  # unverifiable without the DOM snapshot
    assert result["pick_quality"] == "good"  # durable testid selector is trusted from compile


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
