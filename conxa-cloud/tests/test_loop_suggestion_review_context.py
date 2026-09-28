"""build.py::_rewrite_loop_suggestions_for_review builds role-tagged, selector-free step
context from the actual compiled steps — regression guard for the bug where the LLM copy
call got only a bare filename + boolean and hallucinated a wrong mechanism (e.g. a delete)
for what is always a download-then-upload pattern."""

from __future__ import annotations

import sys

sys.path.insert(0, "../conxa-builder/python")

from conxa_core.models.skill_spec import SkillStep  # noqa: E402

from conxa_compile.compiler.build import _rewrite_loop_suggestions_for_review  # noqa: E402
from conxa_compile.compiler.loop_suggestion import detect_download_upload_loop_candidates  # noqa: E402


def _step(**kw) -> SkillStep:
    base = dict(action="click", intent="x", url="", value=None, input_binding=None)
    base.update(kw)
    return SkillStep(**base)


def _download_value(filename: str) -> str:
    return f'{{"url": "blob:x", "suggested_filename": "{filename}"}}'


def _matching_steps() -> list[SkillStep]:
    return [
        _step(action="navigate", url="https://example.com/repo"),
        _step(
            action="navigate",
            url="https://example.com/blob/main/Actionscript.gitignore",
            intent="Open the Actionscript.gitignore page",
        ),
        _step(action="click", intent="click_download"),
        _step(
            action="download_observed",
            value=_download_value("Actionscript.gitignore"),
            intent="Download Actionscript.gitignore",
        ),
        _step(action="navigate", url="https://drive.example.com"),
        _step(
            action="upload_intent",
            value="{{downloaded_file}}",
            input_binding=None,
            intent="Upload the file to Drive",
        ),
    ]


def test_rewrite_never_touches_structural_fields():
    steps = _matching_steps()
    suggestions = detect_download_upload_loop_candidates(steps)
    before = {k: v for k, v in suggestions[0].items() if k != "why"}

    _rewrite_loop_suggestions_for_review(suggestions, steps)

    after = {k: v for k, v in suggestions[0].items() if k != "why"}
    assert before == after  # only `why` may ever change


def test_rewrite_excludes_the_redundant_click_from_the_loop_questions_own_context(monkeypatch):
    # The click removal is a SEPARATE Yes/No question (ReviewQuestionsDialog.tsx), asked only
    # after the loop question is answered Yes, with its own deterministic (no LLM) copy
    # (loop_suggestion.py's `redundant_click_why`) — the loop question's own LLM context must
    # never even see this step, let alone tag it with a role.
    from conxa_compile.compiler import build as build_module

    steps = _matching_steps()
    steps[1] = _step(
        action="navigate",
        url="https://example.com/blob/main/Actionscript.gitignore",
        tab={"id": "tab_0"},
    )
    redundant = _step(
        action="click",
        intent="click_the_file_link",
        tab={"id": "tab_0"},
        identity_bundle={"fingerprint": {"inner_text": "Actionscript.gitignore"}},
    )
    steps = steps[:1] + [redundant] + steps[1:]
    suggestions = detect_download_upload_loop_candidates(steps)
    assert "redundant_click_key" in suggestions[0]
    assert "leftover click" in suggestions[0]["redundant_click_why"]

    captured: list[list[dict]] = []

    def _fake_friendly(_filename, *, steps_context, fallback, error_detail=None):
        del error_detail
        captured.append(steps_context)
        return fallback

    monkeypatch.setattr(
        "conxa_compile.llm.loop_suggestion_copy.friendly_loop_suggestion_text", _fake_friendly
    )
    build_module._rewrite_loop_suggestions_for_review(suggestions, steps)

    roles = [s["role"] for s in captured[0]]
    assert "redundant_click" not in roles
    assert set(roles) == {"acquire", "upload"}
    assert not any(s.get("description") == "click_the_file_link" for s in captured[0])
