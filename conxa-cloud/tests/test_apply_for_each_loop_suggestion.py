"""apply_for_each_loop_suggestion: the one atomic mutation an accepted "generalize this to a
loop" suggestion applies (see conxa_compile/editor/workflow_mutations.py and
handlers/copilot.py::cmd_accept_for_each_suggestion)."""

from __future__ import annotations

import json

import pytest
from conxa_core.models.skill_spec import SkillStep

from conxa_compile.compiler.loop_suggestion import detect_download_upload_loop_candidates
from conxa_compile.editor.workflow_mutations import apply_for_each_loop_suggestion


def _step(**kw) -> SkillStep:
    base = dict(action="click", intent="x", url="", value=None, input_binding=None)
    base.update(kw)
    return SkillStep(**base)


def _download_value(filename: str) -> str:
    return f'{{"url": "blob:x", "suggested_filename": "{filename}"}}'


def _document() -> tuple[dict, dict]:
    steps = [
        _step(action="navigate", url="https://example.com/repo"),
        _step(action="navigate", url="https://example.com/blob/main/Actionscript.gitignore"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("Actionscript.gitignore")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
    ]
    suggestions = detect_download_upload_loop_candidates(steps)
    doc = {
        "meta": {"id": "skill_x", "version": 1},
        "skills": [{"steps": [json.loads(s.model_dump_json()) for s in steps]}],
        "inputs": [],
        "compile_report": {"for_each_suggestions": suggestions},
    }
    return doc, suggestions[0]


def test_wraps_the_range_into_one_for_each_step():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    steps = out["skills"][0]["steps"]
    assert len(steps) == 4  # 6 - (3 wrapped range - 1 wrapper) = 4
    wrapper = steps[1]
    assert wrapper["action"]["action"] == "for_each"
    assert wrapper["for_each"]["items"] == "files"
    assert wrapper["for_each"]["as"] == "file"
    assert len(wrapper["for_each"]["steps"]) == 3


def test_templates_the_literal_only_inside_the_wrapped_url():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    body = out["skills"][0]["steps"][1]["for_each"]["steps"]
    urls = [s.get("url") for s in body]
    assert "https://example.com/blob/main/{{file_id}}" in urls
    assert not any("Actionscript.gitignore" in (u or "") for u in urls)


def test_rebinds_the_upload_step():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    upload_step = out["skills"][0]["steps"][-1]
    assert upload_step["value"] == "{{downloaded_files_dir}}"
    assert upload_step["input_binding"] is None


def test_declares_the_new_input_exactly_once():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    files_inputs = [i for i in out["inputs"] if i["id"] == "files"]
    assert len(files_inputs) == 1


def test_two_independent_pairs_applied_in_turn_do_not_duplicate_the_input():
    steps = [
        _step(action="navigate", url="https://example.com/repo"),
        _step(action="navigate", url="https://example.com/blob/main/A.txt"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("A.txt")),
        _step(action="navigate", url="https://example.com/blob/main/B.txt"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("B.txt")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
        _step(action="upload_intent", value="{{downloaded_file_2}}", input_binding=None),
    ]
    # Only the {{downloaded_file}} (singular) upload is a v1 candidate — hand-build a second
    # suggestion for the other pair to exercise "two applies, one input" without depending on
    # the detector matching a shape it deliberately excludes ({{downloaded_file_2}}).
    doc = {
        "meta": {"id": "skill_x", "version": 1},
        "skills": [{"steps": [json.loads(s.model_dump_json()) for s in steps]}],
        "inputs": [],
        "compile_report": {"for_each_suggestions": []},
    }
    from conxa_compile.compiler.step_key import step_keys

    keys = step_keys(steps)
    suggestion_a = {
        "id": "a", "kind": "download_upload_loop",
        "wrap_start_key": keys[1], "wrap_end_key": keys[3], "upload_step_key": keys[8],
        "template_literal": "A.txt", "suggested_input_name": "files", "as_name": "file",
        "why": "", "preview": {},
    }
    out = apply_for_each_loop_suggestion(doc, suggestion_a)
    files_inputs = [i for i in out["inputs"] if i["id"] == "files"]
    assert len(files_inputs) == 1
    # The applied suggestion invalidated the whole pending list — see the mutation's own
    # docstring comment on why (download_observed's step_key ordinal shifts for a sibling still
    # at top level once one occurrence moves into a nested body).
    assert out["compile_report"]["for_each_suggestions"] == []

    # A second suggestion, for the OTHER pair, keyed fresh against the POST-apply document —
    # exactly what a real recompile would hand the caller, not stale pre-wrap keys.
    keys2 = step_keys(out["skills"][0]["steps"])
    suggestion_b = {
        "id": "b", "kind": "download_upload_loop",
        "wrap_start_key": keys2[2], "wrap_end_key": keys2[4], "upload_step_key": keys2[6],
        "template_literal": "B.txt", "suggested_input_name": "files", "as_name": "file",
        "why": "", "preview": {},
    }
    out2 = apply_for_each_loop_suggestion(out, suggestion_b)
    files_inputs2 = [i for i in out2["inputs"] if i["id"] == "files"]
    assert len(files_inputs2) == 1


def test_removes_the_applied_suggestion_from_compile_report():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    assert out["compile_report"]["for_each_suggestions"] == []


def test_bumps_meta_version():
    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    assert out["meta"]["version"] == 2


def test_stale_wrap_start_key_raises():
    doc, suggestion = _document()
    bad = dict(suggestion)
    bad["wrap_start_key"] = "does-not-exist#1"
    with pytest.raises(ValueError, match="suggestion_stale"):
        apply_for_each_loop_suggestion(doc, bad)


def test_stale_upload_step_key_raises():
    doc, suggestion = _document()
    bad = dict(suggestion)
    bad["upload_step_key"] = "does-not-exist#1"
    with pytest.raises(ValueError, match="suggestion_stale"):
        apply_for_each_loop_suggestion(doc, bad)


def test_refuses_when_literal_no_longer_present_in_the_navigate_url():
    doc, suggestion = _document()
    steps = doc["skills"][0]["steps"]
    steps[1]["url"] = "https://example.com/blob/main/SomethingElse.txt"
    with pytest.raises(ValueError, match="suggestion_stale"):
        apply_for_each_loop_suggestion(doc, suggestion)


def _document_with_redundant_click() -> tuple[dict, dict]:
    steps = [
        _step(action="navigate", url="https://example.com/repo"),
        _step(
            action="click", intent="click_the_file_link",
            tab={"id": "tab_0"},
            identity_bundle={"fingerprint": {"inner_text": "Actionscript.gitignore"}},
        ),
        _step(action="navigate", url="https://example.com/blob/main/Actionscript.gitignore", tab={"id": "tab_0"}),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("Actionscript.gitignore")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
    ]
    suggestions = detect_download_upload_loop_candidates(steps)
    doc = {
        "meta": {"id": "skill_x", "version": 1},
        "skills": [{"steps": [json.loads(s.model_dump_json()) for s in steps]}],
        "inputs": [],
        "compile_report": {"for_each_suggestions": suggestions},
    }
    return doc, suggestions[0]


def test_redundant_click_is_dropped_from_steps_and_archived():
    doc, suggestion = _document_with_redundant_click()
    assert "redundant_click_key" in suggestion
    out = apply_for_each_loop_suggestion(doc, suggestion)
    steps = out["skills"][0]["steps"]
    # navigate(repo), for_each, navigate(drive), upload — the pinned click is gone entirely,
    # not merely moved into the loop body.
    assert [s["action"]["action"] if isinstance(s["action"], dict) else s["action"] for s in steps] == [
        "navigate", "for_each", "navigate", "upload_intent",
    ]
    archived = out["compile_report"]["archived_steps"]
    assert len(archived) == 1
    assert archived[0]["step_key"] == suggestion["redundant_click_key"]
    assert archived[0]["category"] == "superseded_by_loop_navigate"


def test_redundant_click_is_not_present_in_the_loop_body():
    doc, suggestion = _document_with_redundant_click()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    body = out["skills"][0]["steps"][1]["for_each"]["steps"]
    # navigate + the download-triggering click + download_observed — NOT the redundant click
    # that was pinned to one file's name (that one is archived, see the test above).
    assert [s["action"]["action"] if isinstance(s["action"], dict) else s["action"] for s in body] == [
        "navigate", "click", "download_observed",
    ]
    assert all(s.get("intent") != "click_the_file_link" for s in body)


def test_stale_redundant_click_key_raises():
    doc, suggestion = _document_with_redundant_click()
    bad = dict(suggestion)
    bad["redundant_click_key"] = "does-not-exist#1"
    with pytest.raises(ValueError, match="suggestion_stale"):
        apply_for_each_loop_suggestion(doc, bad)


def _document_with_percent_encoded_filename() -> tuple[dict, dict]:
    # The exact real-world regression: "C++.gitignore" is percent-encoded by the browser as
    # "C%2B%2B.gitignore" in the recorded navigate URL.
    steps = [
        _step(action="navigate", url="https://example.com/repo"),
        _step(action="navigate", url="https://example.com/blob/main/C%2B%2B.gitignore"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("C++.gitignore")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
    ]
    suggestions = detect_download_upload_loop_candidates(steps)
    doc = {
        "meta": {"id": "skill_x", "version": 1},
        "skills": [{"steps": [json.loads(s.model_dump_json()) for s in steps]}],
        "inputs": [],
        "compile_report": {"for_each_suggestions": suggestions},
    }
    return doc, suggestions[0]


def test_templates_a_percent_encoded_filename_correctly():
    doc, suggestion = _document_with_percent_encoded_filename()
    assert suggestion["template_literal"] == "C++.gitignore"
    out = apply_for_each_loop_suggestion(doc, suggestion)
    body = out["skills"][0]["steps"][1]["for_each"]["steps"]
    urls = [s.get("url") for s in body]
    assert "https://example.com/blob/main/{{file_id}}" in urls
    # Neither the raw filename nor its percent-encoded form should survive anywhere.
    assert not any("C++" in (u or "") or "C%2B%2B" in (u or "") for u in urls)


def test_exports_to_a_valid_execution_json(tmp_path):
    from conxa_compile.skill_package_builder_saved_skill import _build_workflow_from_saved_skill

    doc, suggestion = _document()
    out = apply_for_each_loop_suggestion(doc, suggestion)
    warnings: list[str] = []
    _build_workflow_from_saved_skill(
        bundle_root=tmp_path, workflow_slug="test-loop", saved_skill=out, on_warning=warnings.append,
    )
    assert warnings == []
    execution = json.loads((tmp_path / "skills" / "test-loop" / "execution.json").read_text())
    types = [s["type"] for s in execution]
    assert types == ["navigate", "for_each", "navigate", "upload"]
    for_each_step = execution[1]
    assert for_each_step["items"] == "files"
    assert "rows" not in for_each_step
