"""Typed-date format replay: a date the user TYPED into a text field ("25/09/2026") compiles to a
`date_pick` step that remembers the field's format, so the runtime can turn whatever date the
caller supplies into the format THIS application accepted (runtime/app/date_picker.js).
"""
from __future__ import annotations

import shutil
from contextlib import ExitStack

import pytest

from conxa_compile.compiler.date_format import detect_date_format
from conxa_compile.compiler.input_binding import _classify_value_pattern
from tests.test_phases import _compile_with_vision_mocks, _minimal_click_event


@pytest.mark.parametrize(
    "value, placeholder, locale, expected",
    [
        ("25/09/2026", "", "", ("DD/MM/YYYY", "2026-09-25")),          # day > 12 decides it
        ("09/25/2026", "", "", ("MM/DD/YYYY", "2026-09-25")),          # month-first, day > 12
        ("25-09-2026", "", "", ("DD-MM-YYYY", "2026-09-25")),
        ("25.09.2026", "", "", ("DD.MM.YYYY", "2026-09-25")),
        ("2026-09-25", "", "", ("YYYY-MM-DD", "2026-09-25")),
        ("2026/9/5", "", "", ("YYYY/M/D", "2026-09-05")),
        ("5/9/2026", "d/m/yyyy", "", ("D/M/YYYY", "2026-09-05")),      # padding preserved
        ("03/04/2026", "dd/mm/yyyy", "", ("DD/MM/YYYY", "2026-04-03")),  # placeholder tie-break
        ("03/04/2026", "MM/DD/YYYY", "", ("MM/DD/YYYY", "2026-03-04")),
        ("03/04/2026", "Select a date (MM/DD/YYYY)", "", ("MM/DD/YYYY", "2026-03-04")),
        ("03/04/2026", "", "31/01/2026", ("DD/MM/YYYY", "2026-04-03")),  # browser-locale tie-break
        ("03/04/2026", "", "1/31/2026", ("MM/DD/YYYY", "2026-03-04")),
        ("Sep 25, 2026", "", "", ("MMM DD, YYYY", "2026-09-25")),
        ("September 5, 2026", "", "", ("MMMM D, YYYY", "2026-09-05")),
        ("25 September 2026", "", "", ("DD MMMM YYYY", "2026-09-25")),
        ("25-Sep-2026", "", "", ("DD-MMM-YYYY", "2026-09-25")),
    ],
)
def test_detect_date_format(value, placeholder, locale, expected):
    assert detect_date_format(value, placeholder, locale) == expected


@pytest.mark.parametrize(
    "value",
    [
        "03/04/2026",        # ambiguous and nothing to break the tie -> never guessed
        "31/02/2026",        # not a real date
        "13/13/2026",
        "2026-13-01",
        "555-123-4567",      # a phone number
        "12345",
        "hello",
        "",
        "2026-09-25T14:30",  # datetime: left to the existing path
    ],
)
def test_detect_date_format_rejects(value):
    assert detect_date_format(value) is None


def test_typed_numeric_date_is_not_classified_as_a_phone_number():
    assert _classify_value_pattern("25-09-2026") == "date"
    assert _classify_value_pattern("25/09/2026") == "date"
    assert _classify_value_pattern("555-123-4567") == "phone"


def _typed_date_event(value: str, *, placeholder: str = "dd/mm/yyyy", input_type: str = "text") -> dict:
    ev = _minimal_click_event()
    ev["action"] = {"action": "type", "timestamp": "2026-01-01T00:00:01Z", "value": value}
    ev["target"].update({
        "tag": "input", "id": "start", "inner_text": "", "role": "textbox",
        "label_text": "Start date", "placeholder": placeholder,
    })
    ev["semantic"].update({"input_type": input_type, "normalized_text": "start date", "role": "textbox"})
    ev["selectors"]["css"] = "#start"
    return ev


def _compile_steps(events: list[dict], sid: str):
    from conxa_compile.compiler.build import compile_skill_package
    from conxa_compile.pipeline.run import run_pipeline

    evs = run_pipeline(events)
    data_dir, *patchers = _compile_with_vision_mocks(sid, evs)
    try:
        with ExitStack() as stack:
            for p in patchers:
                stack.enter_context(p)
            pkg = compile_skill_package(evs, skill_id="s", source_session_id=sid, title="t", version=1)
    finally:
        shutil.rmtree(data_dir, ignore_errors=True)
    return pkg


def test_recorded_typed_date_compiles_to_format_aware_date_pick():
    pkg = _compile_steps([_typed_date_event("25/09/2026")], "sess-date-dmy")
    step = next(s for s in pkg.skills[0].steps if s.action == "date_pick")
    assert step.value == "{{start_date}}"            # semantic input, not the recorded literal
    assert step.input_binding == "start_date"
    hints = step.handler_hints.date_picker
    assert hints["display_format"] == "DD/MM/YYYY"
    assert hints["recorded_value"] == "2026-09-25"
    assert hints["kind"] == "text_field"
    assert step.handler_hints.control_kind != "date_picker"   # no calendar grid to fall back to
    assert not any(a.type == "value_equals" for a in step.validation.assertions)
    assert "25/09/2026" not in pkg.model_dump_json()          # the recorded value is not hardcoded


def test_other_application_format_is_learned_the_same_way():
    pkg = _compile_steps([_typed_date_event("09/25/2026", placeholder="MM/DD/YYYY")], "sess-date-mdy")
    step = next(s for s in pkg.skills[0].steps if s.action == "date_pick")
    assert step.handler_hints.date_picker["display_format"] == "MM/DD/YYYY"


def test_recorded_typed_date_is_declared_as_a_date_input():
    from conxa_compile.editor.workflow_mutations import reconcile_inputs_with_step_values

    pkg = _compile_steps([_typed_date_event("25/09/2026")], "sess-date-input")
    doc, added = reconcile_inputs_with_step_values(pkg.model_dump(mode="json"))
    assert added is True
    row = next(i for i in doc["inputs"] if i["id"] == "start_date")
    assert row["type"] == "date"
    assert row["default"] == "2026-09-25"


def test_ambiguous_typed_date_is_left_as_plain_text():
    pkg = _compile_steps([_typed_date_event("03/04/2026", placeholder="")], "sess-date-ambiguous")
    assert not any(s.action == "date_pick" for s in pkg.skills[0].steps)


def test_native_date_input_is_unchanged():
    ev = _typed_date_event("2026-09-25", input_type="date")
    ev["action"]["action"] = "date_pick"
    pkg = _compile_steps([ev], "sess-date-native")
    step = next(s for s in pkg.skills[0].steps if s.action == "date_pick")
    assert step.handler_hints.date_picker is None or "kind" not in step.handler_hints.date_picker
