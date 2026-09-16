"""Provider loop with model fallback, replacing routes_proxy.py's old inline
loop that ignored ProviderConfig.fallback_text_model entirely.

Ports the fallback mechanic from conxa-cloud/backend/app/llm/router.py
(_call_provider, ~line 468: use the fallback model once the primary has
failed on this provider), simplified — no cooldown/quarantine registry,
this proxy's call volume doesn't need it.
"""
from __future__ import annotations

import logging

import httpx

from .llm_config import ProviderConfig, enabled_providers

logger = logging.getLogger(__name__)


def call_chat_completions(body: dict) -> dict:
    providers = enabled_providers()
    if not providers:
        raise RuntimeError("no_llm_providers_configured")

    last_error = ""
    for provider in providers:
        for model in _models_to_try(provider):
            upstream_body = {**body, "model": model}
            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(
                        f"{provider.endpoint}/chat/completions",
                        headers={"Authorization": f"Bearer {provider.api_key}"},
                        json=upstream_body,
                    )
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                logger.warning("execute_proxy_provider_failed provider=%s model=%s error=%s", provider.provider, model, last_error[:300])
                continue
            if resp.status_code >= 400:
                last_error = resp.text
                logger.warning(
                    "execute_proxy_provider_failed provider=%s model=%s status=%d error=%s",
                    provider.provider, model, resp.status_code, last_error[:300],
                )
                if resp.status_code == 401:
                    # This key is bad — the fallback model on the SAME provider
                    # would fail with the identical 401, so move straight to
                    # the next provider instead of burning a second call here.
                    break
                continue
            return resp.json()

    logger.error("execute_proxy_all_providers_failed error=%s", last_error[:500])
    raise RuntimeError("all_llm_providers_failed")


def _models_to_try(provider: ProviderConfig) -> list[str]:
    models = [provider.text_model]
    if provider.fallback_text_model:
        models.append(provider.fallback_text_model)
    return models
