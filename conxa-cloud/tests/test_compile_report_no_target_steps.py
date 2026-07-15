"""compiler/build.py::_build_compile_report must not score steps with no element target
(scroll, navigate, frame markers, ...) — they have no selector to grade, so treating a
missing target as selector_confidence=0.0 would spuriously drag min_confidence to 0% and
flag the step as "below threshold" for having no selector it was never supposed to have.
"""

from __future__ import annotations

import pytest

from conxa_compile.compiler.build import _build_compile_report
from conxa_core.models.skill_spec import SkillStep


class _FakeRouter:
    pool = ["fake-provider"]

    def stats(self):
        return {"provider": "fake-provider"}


@pytest.fixture(autouse=True)
def _fake_llm_router(monkeypatch):
    import conxa_core.llm as core_llm

    monkeypatch.setattr(core_llm, "get_router", lambda: _FakeRouter())


def _click_step(confidence: float) -> SkillStep:
    return SkillStep(
        action={"action": "click"},
        intent="click_submit",
        target={"primary_selector": "#submit", "selector_confidence": confidence},
    )


def _scroll_step() -> SkillStep:
    return SkillStep(action={"action": "scroll"}, intent="scroll_viewport")


def test_scroll_step_excluded_from_confidence_and_warnings():
    report = _build_compile_report([_click_step(0.95), _scroll_step()])
    assert report["min_confidence"] == 0.95
    assert report["steps_with_warnings"] == 0
    scroll_report = report["steps"][1]
    assert scroll_report["confidence"] is None
    assert scroll_report["warnings"] == []


def test_low_confidence_click_step_still_flagged():
    report = _build_compile_report([_click_step(0.2), _scroll_step()])
    assert report["min_confidence"] == 0.2
    assert report["steps_with_warnings"] == 1
    assert report["steps"][0]["warnings"][0]["code"] == "low_selector_confidence"
    assert report["steps"][1]["warnings"] == []
