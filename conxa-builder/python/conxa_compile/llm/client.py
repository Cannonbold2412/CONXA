"""Build Studio's LLM call dispatcher.

The compile pipeline (recorder/compiler/selector generators) calls call_llm()
for every LLM task. Build Studio has no provider keys of its own — it always
routes through whatever router is installed via conxa_core.llm.set_router()
(the cloud-proxy client, wired at startup by backend.py). The shared
conxa_core.llm.client module holds the OpenAI-compatible HTTP/prompt-building
engine that the cloud's concrete provider router uses to actually call LLM
providers on the pipeline's behalf.
"""

from __future__ import annotations

from typing import Any

from conxa_core.config import settings
from conxa_core.llm.client import _is_openai_compatible_endpoint, _is_vision_task


def _selected_endpoint_and_keys(task: str) -> tuple[str, list[str]]:
    """Select endpoint and API keys derived from the first enabled provider.

    Kept as an adapter for legacy callers (e.g. supports_multimodal_chat). All
    real LLM calls go through the router via call_llm().
    """
    if _is_vision_task(task):
        endpoint = settings.llm_vision_endpoint
        api_key_single = settings.llm_vision_api_key
    else:
        endpoint = settings.llm_text_endpoint
        api_key_single = settings.llm_text_api_key
    keys = [api_key_single] if api_key_single else []
    return endpoint, keys


def supports_multimodal_chat(task: str | None = None, endpoint: str | None = None) -> bool:
    """True when the configured endpoint uses OpenAI-style chat (vision images supported)."""
    if endpoint:
        ep = str(endpoint).strip()
    elif task:
        ep, _ = _selected_endpoint_and_keys(task)
    else:
        ep = str(settings.llm_vision_endpoint or "").strip()
    return bool(ep) and _is_openai_compatible_endpoint(ep)


def call_llm(
    task: str,
    payload: dict[str, Any],
    timeout_ms: int,
    *,
    error_detail: list[str] | None = None,
) -> dict[str, Any] | None:
    """Route all LLM calls through the multi-provider router. No legacy fallback.

    Raises RuntimeError if no providers are configured (via router).
    """
    from conxa_core.llm import get_router
    router = get_router()
    is_vision = task in {"anchor_vision", "vision_reasoning", "region_selector"}
    if is_vision:
        return router.route_vision(task, payload, timeout_ms, error_detail=error_detail)
    return router.route_text(task, payload, timeout_ms, error_detail=error_detail)
