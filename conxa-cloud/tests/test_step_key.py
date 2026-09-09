"""step_key() must give every step a stable, position-independent identity —
BUILD-25 stage a. See CLAUDE.md's step_index renumbering hazard (BUILD-22/23).
"""

from __future__ import annotations

from conxa_compile.compiler.step_key import step_key, step_keys
from collections import Counter


def _click(url: str, stable_hash: str) -> dict:
    return {"action": {"action": "click"}, "url": url, "identity_bundle": {"stable_hash": stable_hash}}


def _scroll(url: str = "https://x") -> dict:
    return {"action": {"action": "scroll"}, "url": url}


def test_same_element_acted_on_twice_gets_distinct_keys():
    steps = [_click("https://x", "h1"), _click("https://x", "h1")]
    keys = step_keys(steps)
    assert keys[0] != keys[1]
    assert keys == ["h1#1", "h1#2"]


def test_inserting_a_step_ahead_does_not_change_a_later_steps_key():
    before = step_keys([_click("https://x", "h1"), _scroll()])
    after_insert = step_keys([_scroll(), _click("https://x", "h1"), _scroll()])
    assert before[0] == after_insert[1] == "h1#1"


def test_element_less_step_still_gets_a_key():
    key = step_keys([_scroll("https://x")])[0]
    assert key  # non-empty
    # Two element-less steps with the same action+url still disambiguate.
    keys = step_keys([_scroll("https://x"), _scroll("https://x")])
    assert keys[0] != keys[1]


def test_pydantic_shaped_step_matches_equivalent_dict():
    class _Bundle:
        stable_hash = "abc"

    class _Step:
        action = {"action": "click"}
        url = "https://y"
        identity_bundle = _Bundle()

    obj_key = step_key(_Step(), Counter())
    dict_key = step_key(_click("https://y", "abc"), Counter())
    assert obj_key == dict_key
