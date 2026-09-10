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
from conxa_core.llm.client import _copilot_modality, _is_openai_compatible_endpoint, _is_vision_task


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
    # Kept in sync with conxa_core.llm.client._is_vision_task and the cloud router's copy —
    # see that function's docstring for why this triplication exists and its BUILD-26 note.
    # Copilot's own two tasks are payload-conditional (text vs. multimodal per turn, depending
    # on whether a screenshot is attached) rather than fixed by task name — see
    # _copilot_modality's docstring.
    modality = _copilot_modality(task, payload)
    is_vision = (modality == "multimodal") if modality is not None else _is_vision_task(task)
    if is_vision:
        return router.route_vision(task, payload, timeout_ms, error_detail=error_detail)
    return router.route_text(task, payload, timeout_ms, error_detail=error_detail)


def stream_llm(
    task: str,
    payload: dict[str, Any],
    timeout_ms: int,
    *,
    on_delta: Any,
    error_detail: list[str] | None = None,
) -> dict[str, Any] | None:
    """Same routing as call_llm(), but for a task whose reply should stream to the caller as it
    generates — `on_delta(text_chunk)` fires for each piece of text as it arrives. Only
    `copilot_reply` uses this today; every other task keeps the blocking call_llm() path."""
    from conxa_core.llm import get_router
    router = get_router()
    modality = _copilot_modality(task, payload)
    is_vision = (modality == "multimodal") if modality is not None else _is_vision_task(task)
    if is_vision:
        return router.route_vision(task, payload, timeout_ms, error_detail=error_detail, on_delta=on_delta)
    return router.route_text(task, payload, timeout_ms, error_detail=error_detail, on_delta=on_delta)
