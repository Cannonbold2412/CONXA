"""bridge.js's optional observations must survive event finalization.

Regression: `_finalize_payload_sync` builds its `body` dict as an explicit allow-list of fields
and never copied `branch_hint`, `date_context`, `choice_context`, `optionality` or
`post_condition` out of the bridge payload. `RecordedEvent` declares all five as optional with a
`None` default, so `model_validate` filled in None and nothing complained — every recording ever
made had them null in every event.

The consequence was that two shipped, unit-tested features were dead end-to-end:

- the date-picker collapse (`compiler/date_picker.py`) never saw a `date_context`, so a
  year/month/day run never became one parameterized `date_pick` step;
- the multiple-choice compile (`compiler/choice.py::derive_choice`) never saw a
  `choice_context`, so `handler_hints.choice` stayed `{}` — no option list to validate a
  caller's value against, and (once popup openers were recorded) no `opener_selector` for the
  runtime to click, leaving `select_option` on a custom dropdown unable to resolve at all.

Both sides of the boundary were correct and tested in isolation. Only the hand-off was broken,
which is exactly the seam these tests cover.
"""
from __future__ import annotations

from conxa_compile.recorder.session import RecordingSession


def _bridge_payload(**observations) -> dict:
    """A minimal but schema-complete bridge payload, plus whatever observations a test adds."""
    payload = {
        "action": {"action": "select_option", "timestamp": "2026-01-01T00:00:00Z", "value": "NCR"},
        "target": {
            "tag": "div", "id": None, "classes": ["css-d7l1ni-option"], "inner_text": "NCR",
            "role": "option", "aria_label": None, "name": None,
        },
        "selectors": {"css": "", "xpath": "//div[1]/select[1]", "text_based": 'text="NCR"', "aria": ""},
        "context": {"parent": "div", "siblings": [], "index_in_parent": 0, "form_context": "form#userForm"},
        "semantic": {"normalized_text": "ncr", "role": "option", "input_type": None, "intent_hint": "select_option"},
        "anchors": [],
        "visual_placeholder": {"bbox": {"x": 1, "y": 1, "w": 20, "h": 10}, "viewport": "1280x720", "scroll_position": "0,0"},
        "page": {"url": "https://demoqa.com/automation-practice-form", "title": "demosite"},
        "state_change": {"before": "", "after": ""},
        "ancestors": [],
        "surrounding_text": "",
    }
    payload.update(observations)
    return payload


CHOICE_CONTEXT = {
    "kind": "aria_listbox",
    "multi": False,
    "group_key": "react-select-3-listbox",
    "group_label": "",
    "group_selector": "#react-select-3-listbox",
    "opener_selector": "#react-select-3-input",
    "options": [
        {"value": "NCR", "label": "NCR", "selector": "#react-select-3-option-0", "checked": False},
        {"value": "Haryana", "label": "Haryana", "selector": "#react-select-3-option-1", "checked": False},
    ],
}

DATE_CONTEXT = {
    "role": "year_select",
    "grid": ".react-datepicker",
    "cell_attr": "",
    "header": ".react-datepicker__header",
}


def _finalize(payload: dict):
    sess = RecordingSession(session_id="observation-passthrough")
    # Non-auth sessions timestamp events against the video start; seed it so finalization
    # produces the int the model requires.
    sess._video_session_start_wall_ms = 1_767_225_600_000
    return sess._finalize_payload_sync(None, None, payload)


def test_choice_context_survives_finalization() -> None:
    event = _finalize(_bridge_payload(choice_context=CHOICE_CONTEXT))

    assert event.choice_context is not None, "choice_context was dropped at finalization"
    assert event.choice_context.kind == "aria_listbox"
    assert [o.value for o in event.choice_context.options] == ["NCR", "Haryana"]


def test_opener_selector_survives_finalization() -> None:
    # Declared on the model too — an undeclared field is dropped just as silently.
    event = _finalize(_bridge_payload(choice_context=CHOICE_CONTEXT))

    assert event.choice_context.opener_selector == "#react-select-3-input"


def test_date_context_survives_finalization() -> None:
    event = _finalize(_bridge_payload(date_context=DATE_CONTEXT))

    assert event.date_context is not None, "date_context was dropped at finalization"
    assert event.date_context.role == "year_select"
    assert event.date_context.grid == ".react-datepicker"


def test_branch_hint_and_optionality_survive_finalization() -> None:
    event = _finalize(_bridge_payload(
        branch_hint={"container": "div.cookie-banner", "kind": "dialog"},
        optionality="stochastic",
    ))

    assert event.branch_hint == {"container": "div.cookie-banner", "kind": "dialog"}
    assert event.optionality == "stochastic"


def test_absent_observations_stay_none() -> None:
    # An older bridge sends none of these; that must still validate rather than blow up.
    event = _finalize(_bridge_payload())

    assert event.choice_context is None
    assert event.date_context is None
    assert event.branch_hint is None
    assert event.optionality is None
    assert event.post_condition is None
