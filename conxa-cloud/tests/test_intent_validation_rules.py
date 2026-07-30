"""Unit tests for conxa_compile/compiler/intent_validation_rules.py.

Regression coverage for a crash hit every time a user drew a new bbox in the Human Edit
"Pick Element" wizard and clicked Continue: try_open_select_wait_rule assumed step["action"]
was always a dict shaped like a recorded event's {"action": {"action": "click"}}, but a step's
own action field is a plain string (e.g. "click") — a shape action_semantics.action_name()
already handles safely and that this module already uses correctly everywhere else.
"""

from __future__ import annotations

import os
import sys
from unittest import TestCase

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))


def _step(action: str = "click") -> dict:
    return {
        "action": action,
        "target": {"tag": "button", "role": ""},
        "semantic": {},
        "selectors": {},
    }


def _policy() -> dict:
    return {
        "decision_layer": {"intent_primary_validation": True},
        "validation": {"infer_element_appear_for_disclosure_roles": True},
    }


class TryOpenSelectWaitRuleTests(TestCase):
    def test_string_action_step_does_not_raise(self) -> None:
        from conxa_compile.compiler.intent_validation_rules import try_open_select_wait_rule

        result = try_open_select_wait_rule(
            _step("click"), _policy(), is_commit=False, timeout=5000, nav_min=8000
        )
        self.assertIsNone(result)

    def test_dict_action_step_still_works(self) -> None:
        from conxa_compile.compiler.intent_validation_rules import try_open_select_wait_rule

        step = _step()
        step["action"] = {"action": "click"}
        result = try_open_select_wait_rule(
            step, _policy(), is_commit=False, timeout=5000, nav_min=8000
        )
        self.assertIsNone(result)

    def test_non_click_string_action_short_circuits(self) -> None:
        from conxa_compile.compiler.intent_validation_rules import try_open_select_wait_rule

        result = try_open_select_wait_rule(
            _step("fill"), _policy(), is_commit=False, timeout=5000, nav_min=8000
        )
        self.assertIsNone(result)
