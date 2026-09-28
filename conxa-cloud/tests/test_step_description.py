"""compiler/step_description.py::describe_step — generic, selector-free plain-language
step facts. Reusable by any future "explain this compiled step to an LLM/reviewer" need,
not specific to any one caller."""

from __future__ import annotations

import sys

sys.path.insert(0, "../conxa-builder/python")

from conxa_core.models.skill_spec import SkillStep  # noqa: E402

from conxa_compile.compiler.step_description import describe_step  # noqa: E402


def _step(**kw) -> SkillStep:
    base = dict(action="click", intent="x", url="", value=None, input_binding=None)
    base.update(kw)
    return SkillStep(**base)


def test_role_included_when_given():
    step = _step(action={"action": "upload_intent"}, intent="Upload the file to Drive")
    facts = describe_step(step, role="upload")
    assert facts == {"role": "upload", "action": "upload_intent", "description": "Upload the file to Drive"}


def test_role_omitted_when_not_given():
    step = _step(action="click", intent="click_download")
    facts = describe_step(step)
    assert "role" not in facts
    assert facts == {"action": "click", "description": "click_download"}


def test_prefers_semantic_description_over_intent():
    step = _step(action="click", intent="click_download", semantic_description="Download button")
    facts = describe_step(step)
    assert facts["description"] == "Download button"


def test_never_leaks_target_or_identity_bundle():
    step = _step(
        action="click",
        intent="x",
        target={"primary_selector": "#secret"},
        identity_bundle={"fingerprint": {"inner_text": "leak"}},
    )
    facts = describe_step(step, role="acquire")
    assert set(facts.keys()) == {"role", "action", "description"}
    assert "secret" not in str(facts) and "leak" not in str(facts)
