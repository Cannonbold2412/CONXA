"""BUILD-26 stage g: the bounded `need[]` retrieval loop. `copilot_turn` should resolve every
`need` entry the model asks for via `copilot_retrieval.resolve_need`, feed the results back as one
more round, and stop after `MAX_RETRIEVAL_ROUNDS` extra rounds even if the model keeps asking.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import patch

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))

from conxa_compile.llm.copilot import copilot_turn  # noqa: E402


def test_a_need_is_resolved_and_fed_back_as_a_second_round():
    calls: list[dict] = []

    def _fake_call_llm(task, payload, timeout_ms, error_detail=None):
        calls.append(dict(payload))
        if len(calls) == 1:
            return {"reply": "", "need": [{"tool": "expand_step", "args": {"step_key": "abc#1"}}], "proposals": []}
        return {"reply": "final answer", "proposals": []}

    with (
        patch("conxa_compile.llm.copilot.call_llm", side_effect=_fake_call_llm),
        patch(
            "conxa_compile.llm.copilot.resolve_need",
            return_value={"step_key": "abc#1", "target": {"primary_selector": "#x"}},
        ) as mock_resolve,
    ):
        result = copilot_turn(skill_id="skill1", evidence={"steps": []}, transcript=[], message="why?")

    assert result["reply"] == "final answer"
    assert len(calls) == 2
    assert "Fetched" in calls[1]["user_text"]
    assert "#x" in calls[1]["user_text"]
    mock_resolve.assert_called_once()
    assert mock_resolve.call_args[0][0] == "skill1"


def test_the_loop_stops_after_max_rounds_even_if_need_never_stops():
    from conxa_compile.editor.copilot_retrieval import MAX_RETRIEVAL_ROUNDS

    calls: list[dict] = []

    def _fake_call_llm(task, payload, timeout_ms, error_detail=None):
        calls.append(dict(payload))
        # Always asks for more — the loop must not spin forever.
        return {"reply": "still thinking", "need": [{"tool": "list_workflows", "args": {}}], "proposals": []}

    with (
        patch("conxa_compile.llm.copilot.call_llm", side_effect=_fake_call_llm),
        patch("conxa_compile.llm.copilot.resolve_need", return_value={"workflows": []}),
    ):
        result = copilot_turn(skill_id="skill1", evidence={"steps": []}, transcript=[], message="why?")

    assert result["reply"] == "still thinking"
    assert len(calls) == MAX_RETRIEVAL_ROUNDS + 1


def test_no_need_means_a_single_call():
    def _fake_call_llm(task, payload, timeout_ms, error_detail=None):
        return {"reply": "done", "proposals": []}

    with patch("conxa_compile.llm.copilot.call_llm", side_effect=_fake_call_llm) as mock_call:
        result = copilot_turn(skill_id="skill1", evidence={"steps": []}, transcript=[], message="hi")

    assert result["reply"] == "done"
    assert mock_call.call_count == 1
