"""copilot_diagnose (BUILD-26 stage b1) — the Human Review copilot's LLM task.

Registered as a vision task in conxa_core.llm.client.VISION_TASKS, the single shared set the
cloud router imports directly (see that constant's docstring — BUILD-29 collapsed what used to
be three separately hand-maintained copies after the third one silently dropped a task and
degraded every compile with no error) — a task missing from it falls back to the
no-system-prompt default instead of failing loudly, so this asserts the registration directly
rather than only its behavior.
"""

from __future__ import annotations

from conxa_core.llm.client import _is_vision_task, _openai_body_dict, _openai_messages_for_task


def test_copilot_diagnose_is_a_vision_task():
    assert _is_vision_task("copilot_diagnose")


def test_copilot_reply_is_a_vision_task():
    assert _is_vision_task("copilot_reply")


def test_copilot_diagnose_never_falls_through_to_the_no_system_prompt_default():
    messages = _openai_messages_for_task("copilot_diagnose", {"user_text": "why did step 3 fail?"})
    assert messages[0]["role"] == "system"
    assert "proposals" in messages[0]["content"]
    assert "reply" in messages[0]["content"]


def test_copilot_diagnose_forbids_selector_fields_in_its_own_system_prompt():
    system = _openai_messages_for_task("copilot_diagnose", {})[0]["content"]
    assert "identity_bundle" in system
    assert "compiled_selectors" in system
    assert "never write or change a page selector" in system.lower()


def test_copilot_diagnose_with_image_puts_image_before_text():
    payload = {"user_text": "why did this fail?", "image_base64": "AAA", "image_mime": "image/jpeg"}
    messages = _openai_messages_for_task("copilot_diagnose", payload)
    user_content = messages[1]["content"]
    assert isinstance(user_content, list)
    assert user_content[0] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAA"}}
    assert user_content[1] == {"type": "text", "text": "why did this fail?"}


def test_copilot_diagnose_without_image_is_plain_text_content():
    messages = _openai_messages_for_task("copilot_diagnose", {"user_text": "why did this fail?"})
    assert messages[1]["content"] == "why did this fail?"


def test_copilot_diagnose_body_gets_its_own_token_budget():
    body = _openai_body_dict("copilot_diagnose", {"user_text": "x"}, json_mode=True)
    assert body["max_tokens"] == 900
    assert body["response_format"] == {"type": "json_object"}
