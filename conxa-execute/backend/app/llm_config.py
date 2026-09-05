"""Standalone LLM provider config for conxa-execute's own env vars.

Independent of conxa_core.config's ProviderConfig/enabled_llm_providers() —
that one is shaped for conxa-cloud's compile-time structured-JSON router.
conxa-execute is a separately deployed service with its own provider keys
(GROQ_API_KEYS etc. are already distinct Render secrets from conxa-cloud's,
see render.yaml) and a different call shape (multi-turn tool-calling chat),
so it gets its own resolution logic here instead of staying coupled to a
dataclass built for a different pipeline.

Same env var names and defaults as conxa-cloud's provider pool (endpoint,
text model) for continuity, plus new *_FALLBACK_TEXT_MODEL vars that
conxa-cloud's dataclass has but this proxy never read until now.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    endpoint: str
    api_key: str
    text_model: str
    fallback_text_model: str = ""


# provider -> (endpoint default, text model default)
_DEFAULTS: dict[str, tuple[str, str]] = {
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "google_ai_studio": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    "nvidia_nim": ("https://integrate.api.nvidia.com/v1", "meta/llama-4-maverick-17b-128e-instruct"),
}


def _split_keys(value: str) -> list[str]:
    return [k.strip() for k in value.split(",") if k.strip()]


def enabled_providers() -> list[ProviderConfig]:
    result: list[ProviderConfig] = []
    for provider, (default_endpoint, default_model) in _DEFAULTS.items():
        env_prefix = provider.upper()
        api_keys = os.environ.get(f"{env_prefix}_API_KEYS", "")
        if not api_keys:
            continue
        endpoint = os.environ.get(f"{env_prefix}_ENDPOINT", default_endpoint)
        text_model = os.environ.get(f"{env_prefix}_TEXT_MODEL", default_model)
        fallback_text_model = os.environ.get(f"{env_prefix}_FALLBACK_TEXT_MODEL", "")
        for key in _split_keys(api_keys):
            result.append(ProviderConfig(
                provider=provider,
                endpoint=endpoint,
                api_key=key,
                text_model=text_model,
                fallback_text_model=fallback_text_model,
            ))
    return result
