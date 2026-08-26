"""_is_openai_compatible_endpoint gate.

Was an exact-match check (path == "/v1"), which rejected every pooled
provider's real default endpoint — Groq's ".../openai/v1" and Google AI
Studio's ".../v1beta/openai" both carry a vendor prefix and never equal
"/v1" literally — so every compile silently fell back to per-step intent
resolution (llm_all_providers_failed: "endpoint not openai-compatible").
"""

from __future__ import annotations

from conxa_core.llm.client import _is_openai_compatible_endpoint


def test_pooled_provider_endpoints_are_recognized() -> None:
    assert _is_openai_compatible_endpoint("https://api.groq.com/openai/v1")
    assert _is_openai_compatible_endpoint(
        "https://generativelanguage.googleapis.com/v1beta/openai"
    )
    assert _is_openai_compatible_endpoint("https://integrate.api.nvidia.com/v1")
    assert _is_openai_compatible_endpoint("https://api.openai.com/v1")


def test_prebuilt_chat_completions_url_is_recognized() -> None:
    assert _is_openai_compatible_endpoint(
        "https://acme.openai.azure.com/openai/deployments/gpt4/chat/completions"
    )


def test_unrecognized_shape_is_rejected() -> None:
    assert not _is_openai_compatible_endpoint("https://api.anthropic.com")
