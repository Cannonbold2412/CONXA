"""PROD-3-DRYRUN layer 4: stage-then-commit ordering lint — advisory only, never blocks."""

from __future__ import annotations

from conxa_compile.compiler.commit_ordering import lint_commit_ordering
from conxa_core.models.skill_spec import SkillStep


def _step(action: str = "click", intent: str = "", consequence: str = "reversible") -> SkillStep:
    return SkillStep(action=action, intent=intent, consequence=consequence)


def test_no_irreversible_step_produces_no_warnings() -> None:
    steps = [_step(intent="open_page", consequence="read_only"), _step(intent="fill_form")]
    assert lint_commit_ordering(steps) == []


def test_irreversible_step_as_the_last_step_produces_no_warning() -> None:
    steps = [_step(intent="fill_form"), _step(intent="delete_invoice", consequence="irreversible")]
    assert lint_commit_ordering(steps) == []


def test_irreversible_step_followed_by_a_writing_step_warns() -> None:
    steps = [
        _step(intent="delete_invoice", consequence="irreversible"),
        _step(intent="confirm_toast", consequence="reversible"),
    ]
    warnings = lint_commit_ordering(steps)
    assert len(warnings) == 1
    w = warnings[0]
    assert w["step_index"] == 0
    assert w["followed_by_index"] == 1
    assert "delete_invoice" in w["message"]
    assert "confirm_toast" in w["message"]


def test_irreversible_step_followed_only_by_a_read_only_step_does_not_warn() -> None:
    # A final assertion/screenshot checking the result is harmless by definition.
    steps = [
        _step(intent="delete_invoice", consequence="irreversible"),
        _step(action="assert", intent="confirm_gone", consequence="read_only"),
    ]
    assert lint_commit_ordering(steps) == []


def test_irreversible_step_followed_only_by_marker_steps_does_not_warn() -> None:
    steps = [
        _step(intent="delete_invoice", consequence="irreversible"),
        _step(action="tab_open", intent="", consequence=""),
        _step(action="frame_exit", intent="", consequence=""),
    ]
    assert lint_commit_ordering(steps) == []


def test_marker_step_between_irreversible_and_a_later_write_does_not_hide_the_warning() -> None:
    steps = [
        _step(intent="delete_invoice", consequence="irreversible"),
        _step(action="tab_switch", intent="", consequence=""),
        _step(intent="update_totals", consequence="reversible"),
    ]
    warnings = lint_commit_ordering(steps)
    assert len(warnings) == 1
    assert warnings[0]["followed_by_index"] == 2


def test_only_the_nearest_offender_is_reported_per_irreversible_step() -> None:
    steps = [
        _step(intent="delete_invoice", consequence="irreversible"),
        _step(intent="write_a", consequence="reversible"),
        _step(intent="write_b", consequence="reversible"),
    ]
    warnings = lint_commit_ordering(steps)
    assert len(warnings) == 1
    assert warnings[0]["followed_by_index"] == 1


def test_multiple_irreversible_steps_each_get_their_own_warning() -> None:
    steps = [
        _step(intent="delete_a", consequence="irreversible"),
        _step(intent="write_between", consequence="reversible"),
        _step(intent="delete_b", consequence="irreversible"),
    ]
    warnings = lint_commit_ordering(steps)
    assert len(warnings) == 1  # only the first irreversible step has anything AFTER it
    assert warnings[0]["step_index"] == 0
