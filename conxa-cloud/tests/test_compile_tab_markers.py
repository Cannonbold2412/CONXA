"""Compiler multi-tab support: tab_open/tab_switch markers get inserted at tab-boundary
crossings, every compiled step's identity-relevant target key stays distinct across tabs even
when DOM signals coincidentally match, and _build_tab_context carries a step's tab forward from
its recorded event. See conxa_compile/compiler/build.py and compiler/step_anchors.py.
"""
from __future__ import annotations

from conxa_compile.compiler.build import (
    _build_tab_context,
    _insert_start_navigate_step,
    _insert_tab_markers,
    _insert_user_tab_navigate_steps,
)
from conxa_compile.compiler.step_anchors import _tab_signature, _target_key
from conxa_core.models.skill_spec import SkillStep


def _ev(tab_id: str, action: str = "click", url: str = "") -> dict:
    return {"action": {"action": action}, "tab": {"id": tab_id, "index": 0}, "page": {"url": url}}


def _step(action: str, tab: dict) -> SkillStep:
    return SkillStep(action=action, tab=tab)


def test_no_marker_for_the_recording_s_starting_tab() -> None:
    events = [_ev("tab_0"), _ev("tab_0"), _ev("tab_0")]
    out = _insert_tab_markers(events)
    assert [e["action"]["action"] for e in out] == ["click", "click", "click"]


def test_tab_open_marker_on_first_visit_tab_switch_on_return() -> None:
    events = [_ev("tab_0"), _ev("tab_1"), _ev("tab_1"), _ev("tab_0")]
    out = _insert_tab_markers(events)
    kinds = [(e["action"]["action"], e.get("tab", {}).get("id")) for e in out]
    assert kinds == [
        ("click", "tab_0"),
        ("tab_open", "tab_1"),
        ("click", "tab_1"),
        ("click", "tab_1"),
        ("tab_switch", "tab_0"),
        ("click", "tab_0"),
    ]


def test_no_events_returns_empty_list_unchanged() -> None:
    assert _insert_tab_markers([]) == []


def test_single_tab_recording_gets_no_markers_at_all() -> None:
    events = [_ev("tab_0")] * 5
    out = _insert_tab_markers(events)
    assert len(out) == 5
    assert all(e["action"]["action"] == "click" for e in out)


def test_build_tab_context_empty_for_tab_0_and_missing_tab() -> None:
    assert _build_tab_context({"tab": {"id": "tab_0"}}) == {}
    assert _build_tab_context({}) == {}


def test_build_tab_context_carries_real_tab_forward() -> None:
    ctx = _build_tab_context({"tab": {"id": "tab_1", "index": 1, "opened_by": "site", "opener_tab": "tab_0", "url": "https://b.test/"}})
    assert ctx["id"] == "tab_1"
    assert ctx["opened_by"] == "site"
    assert ctx["opener_tab"] == "tab_0"
    assert ctx["url"] == "https://b.test/"


def test_target_key_differs_across_tabs_for_identical_dom_signals() -> None:
    """Two tabs on the same site can render an identical-looking element (same empty selectors,
    same tag/name) — the dedup/merge logic in clean_steps must never conflate them."""
    step_tab0 = {"tab": {"id": "tab_0"}, "target": {"tag": "input"}, "selectors": {}}
    step_tab1 = {"tab": {"id": "tab_1"}, "target": {"tag": "input"}, "selectors": {}}
    assert _target_key(step_tab0) != _target_key(step_tab1)


def test_target_key_identical_for_same_tab_and_signals() -> None:
    step_a = {"tab": {"id": "tab_1"}, "target": {"tag": "input", "name": "q"}, "selectors": {}}
    step_b = {"tab": {"id": "tab_1"}, "target": {"tag": "input", "name": "q"}, "selectors": {}}
    assert _target_key(step_a) == _target_key(step_b)


def test_tab_signature_defaults_to_tab_0_when_absent() -> None:
    assert _tab_signature({}) == "tab_0"
    assert _tab_signature({"tab": {}}) == "tab_0"


def test_user_opened_tab_gets_synthesized_navigate_step() -> None:
    """runtime/tabs.js creates a blank page for opened_by="user" tabs and expects the first
    action on it to be a navigate — the compiler must actually produce one."""
    tab = {"id": "tab_1", "index": 1, "opened_by": "user", "opener_tab": None}
    steps = [_step("click", {}), _step("tab_open", tab), _step("click", tab)]
    events = [
        {"page": {"url": "https://a.test/"}},
        {"page": {"url": "https://b.test/dashboard"}},
        {"page": {"url": "https://b.test/dashboard"}},
    ]
    out = _insert_user_tab_navigate_steps(steps, events)
    assert [s.action for s in out] == ["click", "tab_open", "navigate", "click"]
    nav = out[2]
    assert nav.url == "https://b.test/dashboard"
    assert nav.tab == tab
    assert nav.recovery.strategies == []
    assert nav.validation.success_conditions == {"url": "https://b.test/dashboard"}


def test_site_opened_tab_gets_no_synthesized_navigate_step() -> None:
    """opened_by="site" tabs (a link/window.open) are navigated by the click that's already
    replayed as a normal step — no synthetic navigate should be inserted."""
    tab = {"id": "tab_1", "index": 1, "opened_by": "site", "opener_tab": "tab_0"}
    steps = [_step("click", {}), _step("tab_open", tab), _step("click", tab)]
    events = [
        {"page": {"url": "https://a.test/"}},
        {"page": {"url": "https://b.test/"}},
        {"page": {"url": "https://b.test/"}},
    ]
    out = _insert_user_tab_navigate_steps(steps, events)
    assert [s.action for s in out] == ["click", "tab_open", "click"]


def test_tab_switch_gets_no_synthesized_navigate_step() -> None:
    """Only tab_open (first visit) should ever get a synthesized navigate — tab_switch means
    the tab is already live and resolveStepPage reuses the existing page."""
    tab = {"id": "tab_0", "index": 0, "opened_by": "user", "opener_tab": None}
    steps = [_step("click", {}), _step("tab_switch", tab), _step("click", tab)]
    events = [
        {"page": {"url": "https://a.test/"}},
        {"page": {"url": "https://a.test/"}},
        {"page": {"url": "https://a.test/"}},
    ]
    out = _insert_user_tab_navigate_steps(steps, events)
    assert [s.action for s in out] == ["click", "tab_switch", "click"]


def test_user_opened_tab_with_no_recorded_url_gets_no_navigate_step() -> None:
    """Never synthesize a navigate to an empty URL — no worse than the pre-fix behavior."""
    tab = {"id": "tab_1", "index": 1, "opened_by": "user", "opener_tab": None}
    steps = [_step("tab_open", tab), _step("click", tab)]
    events = [{"page": {"url": ""}}, {"page": {"url": ""}}]
    out = _insert_user_tab_navigate_steps(steps, events)
    assert [s.action for s in out] == ["tab_open", "click"]


def test_recording_gets_a_leading_navigate_to_where_it_started() -> None:
    """The recording's own starting tab (tab_0) gets no tab_open marker from
    _insert_tab_markers, so nothing else in the compiled skill records where step 1 is
    supposed to run — the runtime used to guess wrong (see FIX.md). This gives tab_0 the
    same leading navigate every other tab already gets."""
    steps = [_step("click", {}), _step("click", {})]
    events = [{"page": {"url": "https://filebin.net/wn8n9o7mlzkvpvcl"}}, {"page": {"url": "https://filebin.net/wn8n9o7mlzkvpvcl"}}]
    out = _insert_start_navigate_step(steps, events)
    assert [s.action for s in out] == ["navigate", "click", "click"]
    nav = out[0]
    assert nav.url == "https://filebin.net/wn8n9o7mlzkvpvcl"
    assert nav.tab == {}
    assert nav.intent == "navigate_to_page"


def test_recording_already_starting_with_a_navigate_gets_no_second_one() -> None:
    steps = [_step("navigate", {}), _step("click", {})]
    events = [{"page": {"url": "https://a.test/"}}, {"page": {"url": "https://a.test/"}}]
    out = _insert_start_navigate_step(steps, events)
    assert out is steps


def test_blank_starting_url_gets_no_leading_navigate() -> None:
    steps = [_step("click", {})]
    events = [{"page": {"url": "about:blank"}}]
    assert _insert_start_navigate_step(steps, events) == steps


def test_empty_steps_or_events_is_a_no_op() -> None:
    assert _insert_start_navigate_step([], [{"page": {"url": "https://a.test/"}}]) == []
    steps = [_step("click", {})]
    assert _insert_start_navigate_step(steps, []) == steps
