"""Native JS dialog (alert/confirm/prompt) marker value survives compile.

Root cause (see FIX.md): the recorder used to auto-accept every native dialog the instant it
opened, so a human recording a workflow never saw the alert/confirm/prompt box at all, and a
prompt's typed text was always empty. session.py now holds the dialog open and asks the Studio;
session.py::_drain_js_dialog_sync resolves it with the human's real answer and records
{"type", "message", "value"} as the dialog_accept/dialog_dismiss step's value.

This test covers the next hop only: build.py's MARKER_ACTIONS branch used to discard that
payload for every marker except download_observed, so even a correctly-recorded answer was
lost at compile time and runtime/app/handlers.js always replayed an empty string. Covers:
- confirm/dismiss: the recorded {"type","message"} value survives, no input created.
- prompt with typed text: the value's "value" field becomes {{dialog_answer}} and the step
  gets input_binding="dialog_answer" so the agent can supply it at replay time.
- a second prompt in the same workflow: _deduplicate_input_bindings renames it to
  dialog_answer_2 in both the step's value and its input_binding, matching every other
  input-bearing action type.
"""
from __future__ import annotations

import json
from pathlib import Path

from conxa_compile.compiler.build import _build_step, _deduplicate_input_bindings


def _dialog_event(kind: str, dialog_type: str, message: str, value: str) -> dict:
    return {
        "action": {
            "action": kind,
            "timestamp": "2026-08-26T00:00:00Z",
            "value": json.dumps({"type": dialog_type, "message": message, "value": value}),
        },
        "tab": {"id": "tab_0", "index": 0},
        "page": {"url": "https://the-internet.herokuapp.com/javascript_alerts", "title": ""},
    }


def test_confirm_dismiss_keeps_recorded_value_with_no_input(tmp_path: Path) -> None:
    from conxa_compile.policy.bundle import get_policy_bundle

    ev = _dialog_event("dialog_dismiss", "confirm", "I am a JS Confirm", "")
    step = _build_step(ev, get_policy_bundle(), session_root=tmp_path, step_index=0)
    assert step.action == "dialog_dismiss"
    assert step.input_binding is None
    payload = json.loads(step.value)
    assert payload == {"type": "confirm", "message": "I am a JS Confirm", "value": ""}
    # Marker steps get zero recovery — nothing to re-locate.
    assert step.recovery.strategies == []


def test_prompt_answer_becomes_a_named_input(tmp_path: Path) -> None:
    from conxa_compile.policy.bundle import get_policy_bundle

    ev = _dialog_event("dialog_accept", "prompt", "I am a JS Prompt", "Conxa prompt")
    step = _build_step(ev, get_policy_bundle(), session_root=tmp_path, step_index=0)
    assert step.action == "dialog_accept"
    assert step.input_binding == "dialog_answer"
    payload = json.loads(step.value)
    assert payload["type"] == "prompt"
    assert payload["message"] == "I am a JS Prompt"
    assert payload["value"] == "{{dialog_answer}}"


def test_prompt_with_empty_answer_stays_literal() -> None:
    """An accepted prompt with nothing typed has no free text worth parameterizing."""
    from conxa_compile.policy.bundle import get_policy_bundle

    ev = _dialog_event("dialog_accept", "prompt", "I am a JS Prompt", "")
    step = _build_step(ev, get_policy_bundle(), session_root=Path("."), step_index=0)
    assert step.input_binding is None
    assert json.loads(step.value)["value"] == ""


def test_two_prompts_deduplicate_binding_in_both_places() -> None:
    """Two dialog_accept prompt steps both resolving to {{dialog_answer}} must not collide —
    the second becomes dialog_answer_2 in its input_binding AND inside its JSON-string value,
    exactly like _deduplicate_input_bindings already does for fill/type steps (build.py)."""
    from conxa_compile.policy.bundle import get_policy_bundle

    bundle = get_policy_bundle()
    ev1 = _dialog_event("dialog_accept", "prompt", "First prompt", "first answer")
    ev2 = _dialog_event("dialog_accept", "prompt", "Second prompt", "second answer")
    step1 = _build_step(ev1, bundle, session_root=Path("."), step_index=0)
    step2 = _build_step(ev2, bundle, session_root=Path("."), step_index=1)
    assert step1.input_binding == "dialog_answer"
    assert step2.input_binding == "dialog_answer"

    _deduplicate_input_bindings([step1, step2])

    assert step1.input_binding == "dialog_answer"
    assert step2.input_binding == "dialog_answer_2"
    assert json.loads(step1.value)["value"] == "{{dialog_answer}}"
    assert json.loads(step2.value)["value"] == "{{dialog_answer_2}}"


if __name__ == "__main__":
    # ponytail: smallest runnable self-check, per repo convention — assert-based, no
    # pytest fixtures required to run this file directly.
    test_confirm_dismiss_keeps_recorded_value_with_no_input(Path("."))
    test_prompt_answer_becomes_a_named_input(Path("."))
    test_prompt_with_empty_answer_stays_literal()
    test_two_prompts_deduplicate_binding_in_both_places()
    print("ok")
