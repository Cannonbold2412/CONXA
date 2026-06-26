"""Regression test: Selectors must accept null/None from the bridge without dropping events.

Before the fix, bridge-sent ``aria: null`` caused:
  event_capture_error:click: 1 validation error for RecordedEvent
  selectors.aria – Input should be a valid string [input_value=None]

This caused *every* click/scroll on non-semantic elements to be silently dropped,
leaving only typed-input steps in events.jsonl.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from conxa_core.models.events import Selectors


# ---------------------------------------------------------------------------
# Selectors.model_validate with null/None fields
# ---------------------------------------------------------------------------

def test_selectors_aria_none_coerced_to_empty():
    """aria=None from the bridge must coerce to '' rather than raising."""
    s = Selectors.model_validate({"css": "button", "xpath": "/button[1]", "text_based": "", "aria": None})
    assert s.aria == ""


def test_selectors_all_none_coerced():
    """All four selector fields may legitimately be None from the bridge."""
    s = Selectors.model_validate({"css": None, "xpath": None, "text_based": None, "aria": None})
    assert s.css == ""
    assert s.xpath == ""
    assert s.text_based == ""
    assert s.aria == ""


def test_selectors_partial_none_preserves_valid():
    """Only None fields are coerced; valid strings are kept as-is."""
    s = Selectors.model_validate({"css": "div.foo", "xpath": None, "text_based": 'text="OK"', "aria": None})
    assert s.css == "div.foo"
    assert s.xpath == ""
    assert s.text_based == 'text="OK"'
    assert s.aria == ""


def test_selectors_missing_fields_use_default():
    """Completely absent selector fields default to '' (already optional in model)."""
    s = Selectors.model_validate({})
    assert s.aria == ""
    assert s.css == ""


def test_selectors_valid_aria_unchanged():
    """A valid aria selector is never touched by the coercion."""
    s = Selectors.model_validate({
        "css": "button", "xpath": "/button", "text_based": "",
        "aria": '[role="button"][name="Save"]',
    })
    assert s.aria == '[role="button"][name="Save"]'


# ---------------------------------------------------------------------------
# RecordedEvent round-trip with null aria
# ---------------------------------------------------------------------------

def _make_payload(aria_value=None) -> dict:
    """Minimal valid RecordedEvent payload with configurable aria."""
    return {
        "action": {"action": "click", "timestamp": "2026-01-01T00:00:00Z", "value": None},
        "target": {"tag": "button", "id": None, "classes": [], "inner_text": "Submit", "role": "button"},
        "selectors": {
            "css": "button.submit",
            "xpath": "//button",
            "text_based": "",
            "aria": aria_value,
        },
        "context": {"parent": "form", "siblings": [], "index_in_parent": 0},
        "semantic": {"normalized_text": "submit", "role": "button", "input_type": None, "intent_hint": "activate_control"},
        "anchors": [],
        "visual": {"bbox": {"x": 0, "y": 0, "w": 80, "h": 24}, "viewport": "1280x720", "scroll_position": "0,0", "timestamp_ms": 0},
        "page": {"url": "https://example.com", "title": "Example"},
        "state_change": {"before": "", "after": ""},
        "timing": {"wait_for": "load", "timeout": 5000},
        "ancestors": [],
        "surrounding_text": "",
        "snapshot": {"ref": "", "dom_hash": ""},
    }


def test_recorded_event_with_null_aria_validates():
    """RecordedEvent.model_validate must succeed when aria is null.

    This is the exact scenario that caused the silent recording loss.
    """
    from conxa_core.models.events import RecordedEvent
    event = RecordedEvent.model_validate(_make_payload(aria_value=None))
    assert event.selectors.aria == ""


def test_recorded_event_with_valid_aria_validates():
    """Sanity: RecordedEvent with a real aria selector still validates."""
    from conxa_core.models.events import RecordedEvent
    event = RecordedEvent.model_validate(_make_payload(aria_value='[aria-label="Submit"]'))
    assert event.selectors.aria == '[aria-label="Submit"]'
