"""Regression test: a compiled step's post-action assertions (ValidationBlock.assertions) must
reach execution.json, not just the compiler's in-memory step model.

_copy_saved_common used to copy identity_bundle/confidence/handler_hints/compiled_selectors but
never `validation` — so runtime/app/assertions.js's stepAssertions() (which reads
step.validation.assertions) always saw an empty list, and Phase 8 post-action VERIFY was a
silent no-op on every published pack: it always returned "no-assertions" and passed, regardless
of what the compiler actually computed. This pins the fix.
"""

from __future__ import annotations

import json

from conxa_compile.skill_package_builder_saved_skill import _build_workflow_from_saved_skill


def _saved_skill_with_step(step: dict) -> dict:
    return {
        "meta": {"id": "skill_verify", "title": "Verify"},
        "inputs": [],
        "skills": [{"steps": [
            {"action": {"action": "navigate", "url": "https://example.test"}, "intent": "navigate_to_page"},
            step,
        ]}],
    }


def test_validation_assertions_reach_execution_json(tmp_path):
    saved_skill = _saved_skill_with_step({
        "action": "click",
        "intent": "click_submit",
        "target": {"primary_selector": "#submit"},
        "validation": {
            "wait_for": {"some": "executor-detail"},
            "success_conditions": {"other": "executor-detail"},
            "assertions": [
                {"type": "url_changed", "target": "/confirmed", "required": True, "timeout_ms": 5000},
            ],
        },
    })

    _build_workflow_from_saved_skill(bundle_root=tmp_path, workflow_slug="verify_skill", saved_skill=saved_skill)

    execution = json.loads((tmp_path / "skills" / "verify_skill" / "execution.json").read_text(encoding="utf-8"))
    click_step = next(step for step in execution if step["type"] == "click")

    assert click_step["validation"] == {
        "assertions": [
            {"type": "url_changed", "target": "/confirmed", "required": True, "timeout_ms": 5000},
        ],
    }


def test_a_step_with_no_assertions_carries_no_validation_key(tmp_path):
    saved_skill = _saved_skill_with_step({
        "action": "click",
        "intent": "click_submit",
        "target": {"primary_selector": "#submit"},
        "validation": {"wait_for": {}, "success_conditions": {}, "assertions": []},
    })

    _build_workflow_from_saved_skill(bundle_root=tmp_path, workflow_slug="verify_skill_empty", saved_skill=saved_skill)

    execution = json.loads((tmp_path / "skills" / "verify_skill_empty" / "execution.json").read_text(encoding="utf-8"))
    click_step = next(step for step in execution if step["type"] == "click")

    assert "validation" not in click_step


def test_snapshot_check_kind_is_dropped_with_a_warning_not_shipped(tmp_path):
    saved_skill = _saved_skill_with_step({
        "action": "check",
        "intent": "visual_check",
        "check_kind": "snapshot",
        "check_threshold": 0.9,
    })
    warnings: list[str] = []

    _build_workflow_from_saved_skill(
        bundle_root=tmp_path, workflow_slug="snapshot_skill", saved_skill=saved_skill,
        on_warning=warnings.append,
    )

    execution = json.loads((tmp_path / "skills" / "snapshot_skill" / "execution.json").read_text(encoding="utf-8"))
    assert all(step["type"] != "check" for step in execution)
    assert any("snapshot" in w for w in warnings)
