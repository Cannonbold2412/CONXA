"""compiler/build.py::_build_assertions must keep a value_equals assertion's `expected`
templated ({{binding}}) when the step's own value is templated, instead of overwriting it
with the literal recorded DOM readback. runtime/app/assertions.js interpolates `expected`
against the CURRENT run's inputs — a literal recorded string never expands, so it would
compare a freshly-typed (correct, different) value against this recording's stale answer
and fail every run whose inputs differ from the recording (mega-workflow investigation).
"""

from __future__ import annotations

from conxa_compile.compiler.build import _build_assertions
from conxa_core.models.skill_spec import ValidationBlock


def _type_event(*, value_readback: str) -> dict:
    return {
        "action": {"action": "type", "value": '"Mega Test Run"'},
        "post_condition": {"classified_effect": "value_set", "value_readback": value_readback},
    }


def test_bound_value_keeps_placeholder_expected_over_readback():
    ev = _type_event(value_readback="Mega Test Run")
    assertions = _build_assertions(
        ev,
        ValidationBlock(),
        policy={},
        target={"primary_selector": "role=textbox[name=\"name\"]"},
        value="{{shapeshifter}}",
    )
    value_equals = [a for a in assertions if a.type == "value_equals"]
    assert len(value_equals) == 1
    assert value_equals[0].expected == "{{shapeshifter}}"


def test_unbound_literal_value_still_uses_readback():
    ev = _type_event(value_readback="hello (normalized)")
    assertions = _build_assertions(
        ev,
        ValidationBlock(),
        policy={},
        target={"primary_selector": "#field"},
        value="hello",
    )
    value_equals = [a for a in assertions if a.type == "value_equals"]
    assert len(value_equals) == 1
    assert value_equals[0].expected == "hello (normalized)"


if __name__ == "__main__":
    test_bound_value_keeps_placeholder_expected_over_readback()
    test_unbound_literal_value_still_uses_readback()
    print("ok")
