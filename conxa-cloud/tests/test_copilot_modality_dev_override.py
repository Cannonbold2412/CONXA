"""_copilot_modality's dev-mode override.

In dev (settings.environment == "dev"), Copilot always resolves to the
text_model slot — even for screenshot-bearing turns. The screenshot itself is
still attached to the request body regardless (see _openai_body_dict); only
the model slot changes. Prod keeps the original payload-conditional routing
to the dedicated multimodal_model slot.
"""

from __future__ import annotations

from conxa_core.llm import client as llm_client
from conxa_core.llm.client import _copilot_modality


def test_dev_forces_text_even_with_screenshot(monkeypatch) -> None:
    monkeypatch.setattr(llm_client.settings, "environment", "dev")
    assert _copilot_modality("copilot_diagnose", {"image_base64": "x"}) == "text"


def test_prod_with_screenshot_is_multimodal(monkeypatch) -> None:
    monkeypatch.setattr(llm_client.settings, "environment", "prod")
    assert _copilot_modality("copilot_reply", {"image_base64": "x"}) == "multimodal"


def test_prod_without_screenshot_is_text(monkeypatch) -> None:
    monkeypatch.setattr(llm_client.settings, "environment", "prod")
    assert _copilot_modality("copilot_diagnose", {}) == "text"


def test_non_copilot_task_is_unaffected(monkeypatch) -> None:
    monkeypatch.setattr(llm_client.settings, "environment", "dev")
    assert _copilot_modality("anchor_vision", {"image_base64": "x"}) is None


def test_execute_chat_always_multimodal() -> None:
    """Execute chat has no dedicated deployment (it shares the workspace's tier
    pool — see docs/cost_model.md "LLM Provider Strategy") but still always
    takes the multimodal_model slot, screenshot or not."""
    img_messages = [{"role": "user", "content": [
        {"type": "text", "text": "what is this"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
    ]}]
    assert _copilot_modality("execute_chat", {"messages": img_messages}) == "multimodal"
    assert _copilot_modality("execute_chat", {"messages": [{"role": "user", "content": "hi"}]}) == "multimodal"
