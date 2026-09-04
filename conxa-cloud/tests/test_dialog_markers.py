"""EXEC-29 — native JS dialog recording/compile regressions.

A confirm's dialog_accept answer and the following prompt's dialog_accept answer landed
adjacent in the recorded event stream (a race between the dialog server's own answer thread
and the triggering click's bridge.js payload — see pipeline/run.py::_reorder_by_timestamp's
docstring), and clean_steps's duplicate-consecutive-action collapse — built for double-clicks,
which do carry a real target — silently dropped the second one because marker steps carry no
target and therefore always compare equal. These tests pin both the ordering fix and the dedup
exemption so a real prompt answer (or a real second download) can never be silently lost again.
"""
from __future__ import annotations

import json

from conxa_compile.compiler.step_anchors import clean_steps
from conxa_compile.pipeline.run import run_pipeline


def _marker_event(action: str, value: dict, ts: str) -> dict:
    return {
        "action": {"action": action, "timestamp": ts, "value": json.dumps(value)},
        "target": {"tag": "", "id": None, "classes": [], "inner_text": "", "role": None, "aria_label": None, "name": None},
        "selectors": {"css": "", "xpath": "", "text_based": "", "aria": ""},
        "context": {"parent": "", "siblings": [], "index_in_parent": 0, "form_context": None},
        "semantic": {"normalized_text": "", "role": "", "input_type": None, "intent_hint": ""},
        "anchors": [],
        "visual_placeholder": {"bbox": {"x": 0, "y": 0, "w": 0, "h": 0}, "viewport": "", "scroll_position": "0,0"},
        "page": {"url": "https://the-internet.herokuapp.com/javascript_alerts", "title": ""},
        "state_change": {"before": "", "after": ""},
        "ancestors": [],
        "surrounding_text": "",
        "dom_signature_short": "",
        "visual": {"bbox": {"x": 0, "y": 0, "w": 0, "h": 0}, "viewport": "", "scroll_position": "0,0", "timestamp_ms": 0},
        "timing": {"timeout": 5000},
        "snapshot": {},
    }


def _click_event(name: str, ts: str) -> dict:
    ev = _marker_event("click", {}, ts)
    ev["action"]["value"] = None
    ev["target"] = {"tag": "button", "id": f"id_{name}", "classes": [], "inner_text": name, "role": "button", "aria_label": None, "name": name}
    ev["selectors"] = {"css": f"#{name}", "xpath": "", "text_based": "", "aria": f'[role="button"][name="{name}"]'}
    return ev


def test_clean_steps_keeps_two_consecutive_dialog_accept_markers() -> None:
    """The EXEC-29 repro: confirm's answer immediately followed by prompt's answer must not
    collapse into one — losing the prompt's typed text ("CONXA") the way it did live."""
    seq = [
        _marker_event("dialog_accept", {"type": "confirm", "message": "I am a JS Confirm", "value": ""}, "2026-09-03T21:37:50.286369Z"),
        _marker_event("dialog_accept", {"type": "prompt", "message": "I am a JS prompt", "value": "CONXA"}, "2026-09-03T21:37:58.335544Z"),
    ]
    out = clean_steps(seq, {})
    assert len(out) == 2
    values = [json.loads((s.get("action") or {}).get("value") or "{}") for s in out]
    assert values[0]["type"] == "confirm"
    assert values[1]["type"] == "prompt"
    assert values[1]["value"] == "CONXA"


def test_clean_steps_keeps_two_consecutive_download_observed_markers() -> None:
    """Same latent bug, same fix: two downloads back to back must both survive."""
    seq = [
        _marker_event("download_observed", {"url": "https://x/a.pdf", "suggested_filename": "a.pdf"}, "2026-09-03T21:00:00.000000Z"),
        _marker_event("download_observed", {"url": "https://x/b.pdf", "suggested_filename": "b.pdf"}, "2026-09-03T21:00:01.000000Z"),
    ]
    out = clean_steps(seq, {})
    assert len(out) == 2


def test_run_pipeline_reorders_a_dialog_answer_that_arrived_before_its_own_click() -> None:
    """Reproduces the exact inversion seen in session 7fb53d62: the prompt's dialog_accept
    (queued from the dialog server's own answer thread) landed in the recorded array BEFORE the
    click that triggered it (queued once the page's JS thread unblocked). Sorting by each
    event's own timestamp must put the click back in front."""
    click = _click_event("Click for JS Prompt", "2026-09-03T21:37:53.371000Z")
    answer = _marker_event(
        "dialog_accept",
        {"type": "prompt", "message": "I am a JS prompt", "value": "CONXA"},
        "2026-09-03T21:37:58.335544Z",
    )
    # Arrival order: answer BEFORE its own click — the actual race outcome recorded live.
    out = run_pipeline([answer, click])
    actions = [(e.get("action") or {}).get("action") for e in out]
    assert actions == ["click", "dialog_accept"], actions
