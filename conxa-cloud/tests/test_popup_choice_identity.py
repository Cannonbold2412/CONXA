"""Tests for identifying elements that carry no name, no id and no testid.

demoqa.com/automation-practice-form regression: react-datepicker's year/month <select>
have no accessible name, no id and no testid. Every selector channel the recorder
produced for them was structurally unmatchable, so the compiled bundle shipped two
signals that could only ever miss and the step failed as "element not found (resolve
miss)" with nothing left to fall back on:

- text_based: `text="1900 1901 1902 … 1915 "` — built from the <select>'s innerText,
  which is its concatenated <option> list. Playwright's text engine never matches a
  <select> by its options, and `text="…"` is an EXACT match so the 80-char truncation
  made it unmatchable a second time over.
- xpath: `/div[2]/div[2]/…` — buildXPath stops at xpath_max_depth, so anything deeper
  than the cap got a relative path emitted with an absolute `/` prefix.
- css: a valid 8-deep chain ending in the unique, semantic
  `select.react-datepicker__year-select`, discarded wholesale by is_brittle_deep_chain.

The durable identity was in that discarded chain's last segment all along.

Covers:
- A deep CSS chain's identifying tail is salvaged rather than dropped.
- Salvage refuses positional / non-identifying tails.
- A <select>'s option-content text never becomes a text_based signal.
- A real visible-text element still gets one.
"""
from __future__ import annotations

from conxa_compile.compiler.identity_bundle import generate_deterministic_signals
from conxa_compile.compiler.selector_filters import (
    is_brittle_deep_chain,
    salvage_deep_css_tail,
    selector_passes_filters,
)

YEAR_SELECT_CSS = (
    "div > div > div.react-datepicker > div.react-datepicker__month-container > "
    "div.react-datepicker__header:nth-of-type(1) > "
    "div.react-datepicker__header__dropdown.react-datepicker__header__dropdown--select > "
    "div.react-datepicker__year-dropdown-container.react-datepicker__year-dropdown-container--select"
    ":nth-of-type(2) > select.react-datepicker__year-select"
)

YEAR_OPTIONS_TEXT = " ".join(str(y) for y in range(1900, 1948)) + " "


def _year_select_event(css: str = YEAR_SELECT_CSS) -> dict:
    return {
        "target": {
            "tag": "select",
            "role": "combobox",
            "inner_text": YEAR_OPTIONS_TEXT,
            "classes": ["react-datepicker__year-select"],
        },
        "semantic": {"role": "combobox"},
        "selectors": {
            "css": css,
            "xpath": "/div[2]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/select[1]",
            "text_based": f'text="{YEAR_OPTIONS_TEXT[:80]}"',
            "aria": "",
        },
        "anchors": [],
    }


# ── CSS tail salvage ────────────────────────────────────────────────────────


def test_deep_chain_is_still_rejected_on_its_own():
    assert is_brittle_deep_chain(YEAR_SELECT_CSS)
    assert not selector_passes_filters(YEAR_SELECT_CSS)


def test_deep_chain_keeps_its_identifying_tail():
    assert salvage_deep_css_tail(YEAR_SELECT_CSS) == "select.react-datepicker__year-select"


def test_shallow_chain_is_left_alone():
    # Not over-deep — nothing to salvage; the selector is used as recorded.
    assert salvage_deep_css_tail("div > span.thing") == ""


def test_positional_tail_is_not_salvaged():
    # `li:nth-of-type(3)` identifies by position, which is exactly the fragility the
    # depth gate exists to reject — salvaging it would smuggle that back in.
    deep = " > ".join(["div"] * 7) + " > li:nth-of-type(3)"
    assert salvage_deep_css_tail(deep) == ""


def test_bare_tag_tail_is_not_salvaged():
    deep = " > ".join(["div"] * 7) + " > span"
    assert salvage_deep_css_tail(deep) == ""


def test_positional_ancestor_stops_the_tail_from_growing():
    # The tail may grow leftwards only through non-positional segments.
    deep = " > ".join(["div"] * 6) + " > div:nth-of-type(2) > select.year"
    assert salvage_deep_css_tail(deep) == "select.year"


# ── Bundle generation ───────────────────────────────────────────────────────


def test_option_content_never_becomes_a_text_signal():
    engines = {s.engine for s in generate_deterministic_signals(_year_select_event())}
    assert "text_based" not in engines


def test_select_still_gets_a_usable_signal_from_its_class():
    signals = generate_deterministic_signals(_year_select_event())
    assert [s.selector for s in signals if s.engine.startswith("css")] == [
        "select.react-datepicker__year-select"
    ]


def test_bundle_is_never_left_with_only_unmatchable_signals():
    # The whole point: this element used to compile to text_based + xpath, both of which
    # resolve to nothing at replay. It must now carry at least one real signal.
    signals = generate_deterministic_signals(_year_select_event())
    assert signals, "select compiled to an empty bundle"
    assert any(not s.engine == "xpath" for s in signals)


def test_visible_text_element_still_gets_its_text_signal():
    ev = {
        "target": {"tag": "button", "role": "button", "inner_text": "Submit"},
        "semantic": {"role": "button"},
        "selectors": {"css": "#submit", "xpath": "/html/body/button[1]", "text_based": 'text="Submit"', "aria": ""},
        "anchors": [],
    }
    engines = {s.engine for s in generate_deterministic_signals(ev)}
    assert "text_based" in engines
