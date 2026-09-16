"""One-click "generalize this to a loop" suggestion: detection is a pure, deterministic pattern
match over already-compiled steps — no LLM. See docs/TRD.md's for_each section and
conxa_compile/compiler/loop_suggestion.py's module docstring for the full design."""

from __future__ import annotations

from conxa_core.models.skill_spec import SkillStep

from conxa_compile.compiler.loop_suggestion import (
    detect_download_upload_loop_candidates,
    filter_rejected,
    replace_url_literal,
    url_contains_literal,
)
from conxa_compile.compiler.step_key import step_keys


def _step(**kw) -> SkillStep:
    base = dict(action="click", intent="x", url="", value=None, input_binding=None)
    base.update(kw)
    return SkillStep(**base)


def _download_value(filename: str) -> str:
    return f'{{"url": "blob:x", "suggested_filename": "{filename}"}}'


def _matching_steps() -> list[SkillStep]:
    return [
        _step(action="navigate", url="https://example.com/repo"),
        _step(action="navigate", url="https://example.com/blob/main/Actionscript.gitignore"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("Actionscript.gitignore")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
    ]




def test_fires_on_the_target_shape():
    suggestions = detect_download_upload_loop_candidates(_matching_steps())
    assert len(suggestions) == 1
    s = suggestions[0]
    assert s["kind"] == "download_upload_loop"
    assert s["template_literal"] == "Actionscript.gitignore"
    assert s["suggested_input_name"] == "files"
    assert s["as_name"] == "file"
    assert s["wrap_start_key"] and s["wrap_end_key"] and s["upload_step_key"]


def test_does_not_fire_without_a_matching_upload():
    steps = _matching_steps()
    steps[-1] = _step(action="upload_intent", value="{{file_path}}", input_binding="file_path")
    assert detect_download_upload_loop_candidates(steps) == []


def test_does_not_fire_on_a_bulk_n_variant():
    # {{downloaded_file_2}} means "more than one download already happened" — a different,
    # already-multi-file shape this feature isn't for.
    steps = _matching_steps()
    steps[-1] = _step(action="upload_intent", value="{{downloaded_file_2}}", input_binding=None)
    assert detect_download_upload_loop_candidates(steps) == []


def test_does_not_fire_on_the_bulk_folder_placeholder():
    steps = _matching_steps()
    steps[-1] = _step(action="upload_intent", value="{{downloaded_files_dir}}", input_binding=None)
    assert detect_download_upload_loop_candidates(steps) == []


def test_does_not_fire_when_the_upload_already_has_an_input_binding():
    steps = _matching_steps()
    steps[-1] = _step(
        action="upload_intent", value="{{downloaded_file}}", input_binding="something",
    )
    assert detect_download_upload_loop_candidates(steps) == []


def test_does_not_fire_when_filename_never_appears_in_a_navigate_url():
    # The file was picked some other way (a plain click, no URL change) — v1 is URL-only.
    steps = _matching_steps()
    steps[1] = _step(action="navigate", url="https://example.com/blob/main")  # no filename
    assert detect_download_upload_loop_candidates(steps) == []


def test_does_not_fire_without_a_preceding_download_observed():
    steps = [s for s in _matching_steps() if getattr(s, "action", None) != "download_observed"]
    assert detect_download_upload_loop_candidates(steps) == []


def test_multiple_independent_pairs_each_produce_their_own_suggestion():
    steps = _matching_steps() + _matching_steps()
    suggestions = detect_download_upload_loop_candidates(steps)
    assert len(suggestions) == 2
    assert suggestions[0]["upload_step_key"] != suggestions[1]["upload_step_key"]


def test_filter_rejected_drops_a_previously_dismissed_suggestion():
    suggestions = detect_download_upload_loop_candidates(_matching_steps())
    upload_key = suggestions[0]["upload_step_key"]
    edits = [
        {"decision": "rejected", "field": "for_each_suggestion", "step_key": upload_key},
    ]
    assert filter_rejected(suggestions, edits) == []


def test_filter_rejected_ignores_unrelated_log_entries():
    suggestions = detect_download_upload_loop_candidates(_matching_steps())
    edits = [
        {"decision": "rejected", "field": "value", "step_key": suggestions[0]["upload_step_key"]},
        {"decision": "accepted", "field": "for_each_suggestion", "step_key": "some_other_key"},
    ]
    assert filter_rejected(suggestions, edits) == suggestions


def test_filter_rejected_noop_on_empty_edits():
    suggestions = detect_download_upload_loop_candidates(_matching_steps())
    assert filter_rejected(suggestions, []) == suggestions


def _steps_with_redundant_click(**click_kw) -> list[SkillStep]:
    steps = _matching_steps()
    click_kw.setdefault("tab", {"id": "tab_0"})
    click_kw.setdefault("identity_bundle", {"fingerprint": {"inner_text": "Actionscript.gitignore"}})
    redundant = _step(action="click", intent="click_the_file_link", **click_kw)
    # navigate() at index 1 needs the same tab as the redundant click to be absorbed.
    steps[1] = _step(
        action="navigate",
        url="https://example.com/blob/main/Actionscript.gitignore",
        tab={"id": "tab_0"},
    )
    return steps[:1] + [redundant] + steps[1:]


def test_absorbs_a_redundant_click_pinned_to_the_recorded_file():
    steps = _steps_with_redundant_click()
    suggestions = detect_download_upload_loop_candidates(steps)
    assert len(suggestions) == 1
    s = suggestions[0]
    click_key = step_keys(steps)[1]
    assert s["redundant_click_key"] == click_key
    assert s["wrap_start_key"] == click_key
    assert "leftover click" in s["why"]


def test_does_not_absorb_when_the_click_fingerprint_lacks_the_filename():
    steps = _steps_with_redundant_click(identity_bundle={"fingerprint": {"inner_text": "Something else"}})
    s = detect_download_upload_loop_candidates(steps)[0]
    assert "redundant_click_key" not in s
    assert s["wrap_start_key"] != step_keys(steps)[1]


def test_does_not_absorb_when_the_click_is_on_a_different_tab():
    steps = _steps_with_redundant_click(tab={"id": "tab_1"})
    s = detect_download_upload_loop_candidates(steps)[0]
    assert "redundant_click_key" not in s


def test_does_not_absorb_when_the_preceding_step_is_not_a_click():
    steps = _matching_steps()
    steps.insert(1, _step(action="navigate", url="https://example.com/intermediate"))
    s = detect_download_upload_loop_candidates(steps)[0]
    assert "redundant_click_key" not in s


# --- Percent-encoded filenames (real bug: "C++.gitignore" -> ".../C%2B%2B.gitignore") -------

def test_url_contains_literal_sees_through_percent_encoding():
    url = "https://example.com/blob/main/C%2B%2B.gitignore"
    assert url_contains_literal(url, "C++.gitignore")


def test_url_contains_literal_still_works_on_a_plain_url():
    assert url_contains_literal("https://example.com/blob/main/Android.gitignore", "Android.gitignore")


def test_url_contains_literal_false_when_absent():
    assert not url_contains_literal("https://example.com/blob/main/Android.gitignore", "Other.gitignore")


def test_replace_url_literal_templates_through_percent_encoding():
    url = "https://example.com/blob/main/C%2B%2B.gitignore"
    out = replace_url_literal(url, "C++.gitignore", "{{file_id}}")
    assert out == "https://example.com/blob/main/{{file_id}}"


def test_replace_url_literal_returns_none_when_absent():
    url = "https://example.com/blob/main/Android.gitignore"
    assert replace_url_literal(url, "Other.gitignore", "{{file_id}}") is None


def test_fires_when_the_filename_is_percent_encoded_in_the_navigate_url():
    # The exact real-world regression: a filename containing a URL-reserved character ("+")
    # is percent-encoded by the browser in the recorded navigate URL, but the recorded
    # suggested_filename itself is decoded — a raw substring check misses this entirely.
    steps = [
        _step(action="navigate", url="https://example.com/repo"),
        _step(action="navigate", url="https://example.com/blob/main/C%2B%2B.gitignore"),
        _step(action="click", intent="click_download"),
        _step(action="download_observed", value=_download_value("C++.gitignore")),
        _step(action="navigate", url="https://drive.example.com"),
        _step(action="upload_intent", value="{{downloaded_file}}", input_binding=None),
    ]
    suggestions = detect_download_upload_loop_candidates(steps)
    assert len(suggestions) == 1
    assert suggestions[0]["template_literal"] == "C++.gitignore"
