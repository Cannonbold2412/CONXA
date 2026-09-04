"""Regression test for BUILD-22: a compiled step's selector must never be silently
overwritten with an unrelated preceding step's input placeholder.

Root cause was two blind-rewrite passes in skill_package_builder_saved_skill.py
(_repair_parameterized_search_result_selectors for execution.json,
_repair_saved_step_click_selectors for recovery.json) that armed on any `type`/`fill`
step whose value was a lone placeholder and unconditionally rewrote the NEXT click's
`text=` selector with it, with no check that the two steps were related. On the
mega-workflow recording this turned a Login button's selector into
`text="{{user_password}}"` — a credential shape baked into a text matcher, and a
selector that could never match at replay. Both passes have been deleted; this test
pins the fix.
"""

from __future__ import annotations

import json

from conxa_compile.skill_package_builder_saved_skill import _build_workflow_from_saved_skill


def test_login_click_selector_is_not_overwritten_by_the_preceding_password_type(tmp_path):
    saved_skill = {
        "meta": {"id": "skill_login", "title": "Login"},
        "inputs": [],
        "skills": [
            {
                "steps": [
                    {
                        "action": {"action": "navigate", "url": "https://the-internet.herokuapp.com/login"},
                        "intent": "navigate_to_page",
                    },
                    {
                        "action": "type",
                        "intent": "enter_password",
                        "target": {"primary_selector": "#password"},
                        "value": "{{user_password}}",
                    },
                    {
                        "action": "click",
                        "intent": "click_login_button",
                        "target": {"primary_selector": "text=Login"},
                    },
                ],
            }
        ],
    }

    _build_workflow_from_saved_skill(
        bundle_root=tmp_path,
        workflow_slug="login_skill",
        saved_skill=saved_skill,
    )

    skill_dir = tmp_path / "skills" / "login_skill"
    execution = json.loads((skill_dir / "execution.json").read_text(encoding="utf-8"))
    click_step = next(step for step in execution if step["type"] == "click")
    assert click_step["selector"] == "text=Login"
    assert "{{" not in click_step["selector"]

    recovery = json.loads((skill_dir / "recovery.json").read_text(encoding="utf-8"))
    click_entry = next(entry for entry in recovery["steps"] if entry["intent"] == "click_login_button")
    assert click_entry["selector_context"]["primary"] == "text=Login"
    assert click_entry["target"]["text"] == "Login"
