"""Multi-provider LLM router with cool-down, failover, and per-key rate-limit handling."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from conxa_core.config import settings
from conxa_core.llm.client import (
    _chat_completions_url,
    _debug_log,
    _is_openai_compatible_endpoint,
    _normalize_openai_response,
    _openai_body_dict,
    _provider_top_level_error,
    _safe_error_snippet,
)
from conxa_core.progress import append_current_job_event


@dataclass
class PoolEntry:
    """Single (provider, endpoint, key, model) tuple in the router pool."""
    provider: str
    endpoint: str
    api_key: str
    text_model: str
    vision_model: str
    pool: str = "free"  # "free" | "premium" — see Settings.llm_premium_providers
    # "bearer" (Authorization: Bearer <key>, every pooled provider) or
    # "api_key_header" (api-key: <key> — Azure OpenAI's REST auth, used only
    # by BYOK entries; see app/services/byok.py).
    auth_style: str = "bearer"
    requests_sent: int = 0
    requests_429: int = 0
    last_used_at: float = 0.0
    cooled_until: float = 0.0


def _parse_retry_after_secs(headers: Any) -> float | None:
    """Parse a numeric Retry-After header into seconds, or None if absent/invalid.

    Providers send this in seconds (not HTTP-date form) for rate-limit responses.
    """
    raw = headers.get("Retry-After") if headers is not None else None
    if not raw:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value <= 0 or value > 3600:
        return None
    return value


_SECRET_KEYS = {
    "authorization",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "cookie",
    "cookies",
    "storage_state",
    "storage_state_path",
}


def _redact_url(value: str) -> str:
    if "?" not in value:
        return value
    base, _, query = value.partition("?")
    if not query:
        return base
    return f"{base}?[redacted_query]"


def _redact_value(value: Any) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            lowered = key_text.lower()
            if lowered in _SECRET_KEYS:
                out[key_text] = "[redacted]"
            elif lowered in {"image_base64", "base64"} and isinstance(item, str):
                out[key_text] = _redacted_blob(item)
            elif lowered == "url" and isinstance(item, str) and item.startswith("data:"):
                out[key_text] = _redacted_data_url(item)
            else:
                out[key_text] = _redact_value(item)
        return out
    if isinstance(value, list):
        return [_redact_value(item) for item in value[:20]]
    if isinstance(value, str):
        if value.startswith("data:") and ";base64," in value[:80]:
            return _redacted_data_url(value)
        if len(value) > 1600:
            return f"{value[:1600]}... [truncated {len(value) - 1600} chars]"
    return value


def _redacted_blob(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()[:16]
    return f"[redacted_base64 chars={len(value)} sha256={digest}]"


def _redacted_data_url(value: str) -> str:
    prefix, _, payload = value.partition(",")
    return f"{prefix},[redacted chars={len(payload)} sha256={hashlib.sha256(payload.encode('utf-8', errors='ignore')).hexdigest()[:16]}]"


def _redacted_preview(value: Any) -> str:
    try:
        text = json.dumps(_redact_value(value), ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        text = str(value)
    return text if len(text) <= 2400 else f"{text[:2400]}... [truncated {len(text) - 2400} chars]"


def _log_llm_exception(
    req_id: int,
    entry: PoolEntry,
    endpoint: str,
    model: Any,
    task: str,
    attempt: int,
    status_code: int | None,
    duration_ms: float,
    message: str,
) -> None:
    append_current_job_event(
        "api_call",
        f"LLM request failed: {task}.",
        {
            "phase": "llm_request_failed",
            "request_id": req_id,
            "provider": entry.provider,
            "endpoint": _redact_url(endpoint),
            "model": model,
            "task": task,
            "attempt": attempt,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "error": message,
        },
    )


class LLMRouter:
    """Multi-provider LLM router with per-key cool-down and automatic failover."""

    def __init__(self):
        """Build the initial provider pool from enabled providers in settings."""
        self.pool: list[PoolEntry] = []
        self.cooldown_secs: int = settings.llm_router_cooldown_secs
        self.max_retries: int = settings.llm_router_max_retries
        self.request_timeout_ms: int = settings.llm_router_request_timeout_ms
        # Bound on how long a single route_text/route_vision call will block waiting for a
        # cooled-down key to clear, instead of failing the request outright. Keeps a transient
        # 429 from costing a full compile step while never blocking past a caller's patience.
        self.wait_ceiling_secs: float = settings.llm_router_wait_ceiling_secs
        self.prefer_fast_for_text: bool = settings.llm_router_prefer_fast_for_text
        self._request_counter: int = 0
        self._last_lru_index: int = 0

        # Build pool from enabled providers
        for provider_cfg in settings.enabled_llm_providers():
            entry = PoolEntry(
                provider=provider_cfg.provider,
                endpoint=provider_cfg.endpoint,
                api_key=provider_cfg.api_key,
                text_model=provider_cfg.text_model,
                vision_model=provider_cfg.vision_model,
                pool=provider_cfg.pool,
            )
            self.pool.append(entry)

    def _next_available_entry(self, *, for_vision: bool = False, pool: str | None = None) -> PoolEntry | None:
        """Pick next available entry from pool using LRU, skipping cooled entries.

        ``pool`` (None = no filter) restricts to "free" or "premium" entries —
        the caller passes the requesting workspace's compile_pool capability
        (docs/PRD.md §11). A pool with no matching entries falls through to
        None just like an exhausted pool, rather than silently mixing tiers."""
        if not self.pool:
            return None

        now = time.monotonic()
        attempts = 0
        max_attempts = len(self.pool) * 2

        while attempts < max_attempts:
            self._last_lru_index = (self._last_lru_index + 1) % len(self.pool)
            entry = self.pool[self._last_lru_index]
            attempts += 1

            # Skip cooled entries
            if entry.cooled_until > now:
                continue

            # For vision tasks, skip entries without vision_model
            if for_vision and not entry.vision_model:
                continue

            if pool is not None and entry.pool != pool:
                continue

            return entry

        return None

    def _soonest_cooldown(self, *, for_vision: bool) -> float | None:
        """Earliest ``cooled_until`` (monotonic) among entries matching ``for_vision``,
        or None if no such entries exist at all (a config gap, not a cooldown)."""
        candidates = [e for e in self.pool if not for_vision or e.vision_model]
        if not candidates:
            return None
        return min(e.cooled_until for e in candidates)

    def _route(
        self,
        task: str,
        payload: dict[str, Any],
        timeout_ms: int,
        *,
        for_vision: bool,
        error_detail: list[str] | None,
        pool: str | None,
    ) -> dict[str, Any] | None:
        """Shared route_text/route_vision body: pick an entry, fall back across pools,
        and wait for cooled-down keys to clear (bounded by a total ``wait_ceiling_secs``
        budget across the whole call) instead of instantly failing on a transient 429."""
        wait_budget = self.wait_ceiling_secs

        for attempt in range(self.max_retries):
            entry = self._next_available_entry(for_vision=for_vision, pool=pool)
            if entry is None and pool is not None:
                _debug_log(f"router: pool={pool} exhausted{' for vision' if for_vision else ''}, falling back to any pool")
                entry = self._next_available_entry(for_vision=for_vision)

            if entry is None and wait_budget > 0:
                soonest = self._soonest_cooldown(for_vision=for_vision)
                if soonest is not None:
                    wait_s = soonest - time.monotonic()
                    if 0 < wait_s <= wait_budget:
                        _debug_log(f"router: all entries cooled, waiting {wait_s:.1f}s for soonest to clear")
                        time.sleep(wait_s)
                        wait_budget -= wait_s
                        entry = self._next_available_entry(for_vision=for_vision, pool=pool)
                        if entry is None and pool is not None:
                            entry = self._next_available_entry(for_vision=for_vision)
                    else:
                        wait_budget = 0

            if entry is None:
                _debug_log("router: all providers cooled or exhausted")
                if error_detail is not None:
                    error_detail.append("router: all providers cooled or exhausted")
                break

            result = self._call_provider(
                entry,
                task,
                payload,
                timeout_ms,
                error_detail=error_detail,
                attempt=attempt,
            )

            if result is not None:
                return result

            # Continue to next provider on failure
            _debug_log(f"router: retry {attempt + 1}/{self.max_retries} for task {task}")

        return None

    def route_text(
        self,
        task: str,
        payload: dict[str, Any],
        timeout_ms: int,
        *,
        error_detail: list[str] | None = None,
        pool: str | None = None,
    ) -> dict[str, Any] | None:
        """Route a text-only LLM call to an available provider.

        ``pool`` restricts to "free" or "premium" providers; if the requested
        pool has no available entry, falls back to any pool rather than
        failing a paying customer's compile over a provider misconfiguration."""
        if not self.pool:
            raise RuntimeError(
                "No LLM providers enabled. Set at least one *_API_KEYS and "
                "*_ENABLED=true in .env (e.g. GROQ_API_KEYS=gsk_... + GROQ_ENABLED=true)."
            )
        return self._route(task, payload, timeout_ms, for_vision=False, error_detail=error_detail, pool=pool)

    def route_vision(
        self,
        task: str,
        payload: dict[str, Any],
        timeout_ms: int,
        *,
        error_detail: list[str] | None = None,
        pool: str | None = None,
    ) -> dict[str, Any] | None:
        """Route a vision-capable LLM call to an available provider. See
        route_text for the ``pool`` fallback behavior."""
        if not self.pool:
            raise RuntimeError(
                "No LLM providers enabled. Set at least one *_API_KEYS and "
                "*_ENABLED=true in .env. Note: vision tasks require providers with a vision_model."
            )
        return self._route(task, payload, timeout_ms, for_vision=True, error_detail=error_detail, pool=pool)

    def call_entry_directly(
        self,
        entry: PoolEntry,
        task: str,
        payload: dict[str, Any],
        timeout_ms: int,
        *,
        error_detail: list[str] | None = None,
    ) -> dict[str, Any] | None:
        """Single-attempt call against a caller-supplied entry, bypassing pool
        selection and cross-provider failover entirely. Used for BYOK — there's
        exactly one deployment to call, so the shared pool's rotate/cool-down/
        drop-on-401 machinery (which assumes many interchangeable keys) doesn't
        apply; the entry is never added to self.pool, so it's never dropped
        from anything. One retry mirrors the pooled paths' minimum useful
        resilience against a single transient failure."""
        for attempt in range(min(2, self.max_retries)):
            result = self._call_provider(entry, task, payload, timeout_ms, error_detail=error_detail, attempt=attempt)
            if result is not None:
                return result
        return None

    def _call_provider(
        self,
        entry: PoolEntry,
        task: str,
        payload: dict[str, Any],
        timeout_ms: int,
        *,
        error_detail: list[str] | None = None,
        attempt: int = 0,
    ) -> dict[str, Any] | None:
        """Make a single HTTP request to a provider."""
        self._request_counter += 1
        req_id = self._request_counter
        now = time.monotonic()

        # Use provider-specific model, falling back to payload model
        model = payload.get("model")
        if not model:
            if task in {"anchor_vision", "vision_reasoning", "region_selector"}:
                model = entry.vision_model
            else:
                model = entry.text_model

        # Prepare payload with the selected model
        payload_with_model = dict(payload)
        payload_with_model["model"] = model

        _debug_log(
            f"router: request_start req_id={req_id} provider={entry.provider} "
            f"endpoint={entry.endpoint} model={model} task={task} attempt={attempt}"
        )

        # Build OpenAI-compatible request
        if not _is_openai_compatible_endpoint(entry.endpoint):
            _debug_log(f"router: endpoint not openai-compatible {entry.endpoint}")
            if error_detail is not None:
                error_detail.append(f"endpoint not openai-compatible: {entry.endpoint}")
            return None

        ep = _chat_completions_url(entry.endpoint)
        headers = {"Content-Type": "application/json"}
        if entry.auth_style == "api_key_header":
            headers["api-key"] = entry.api_key
        else:
            headers["Authorization"] = f"Bearer {entry.api_key}"

        timeout_s = max(0.2, timeout_ms / 1000.0)

        started = time.perf_counter()

        try:
            body_dict = _openai_body_dict(task, payload_with_model, json_mode=True)
            raw_body = json.dumps(body_dict).encode("utf-8")
            append_current_job_event(
                "api_call",
                f"LLM request started: {task}.",
                {
                    "phase": "llm_request_start",
                    "request_id": req_id,
                    "provider": entry.provider,
                    "endpoint": _redact_url(ep),
                    "model": model,
                    "task": task,
                    "attempt": attempt,
                    "request_bytes": len(raw_body),
                    "request_preview": _redacted_preview(body_dict),
                },
            )
            req = request.Request(ep, data=raw_body, headers=headers, method="POST")

            with request.urlopen(req, timeout=timeout_s) as res:
                status_code = getattr(res, "status", None) or getattr(res, "code", None)
                raw = res.read().decode("utf-8")

            entry.requests_sent += 1
            entry.last_used_at = now
            duration_ms = round((time.perf_counter() - started) * 1000, 2)

            data_raw = json.loads(raw)
            if not isinstance(data_raw, dict):
                msg = f"unexpected_json_root: {type(data_raw).__name__}"
                _debug_log(f"router: {msg}")
                _log_llm_exception(req_id, entry, ep, model, task, attempt, status_code, duration_ms, msg)
                if error_detail is not None:
                    error_detail.append(msg)
                return None

            prov_msg = _provider_top_level_error(data_raw)
            if prov_msg:
                _debug_log(f"router: provider_error {prov_msg}")
                append_current_job_event(
                    "api_call",
                    f"LLM provider returned an error: {task}.",
                    {
                        "phase": "llm_provider_error",
                        "request_id": req_id,
                        "provider": entry.provider,
                        "endpoint": _redact_url(ep),
                        "model": model,
                        "task": task,
                        "attempt": attempt,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "response_bytes": len(raw.encode("utf-8")),
                        "error": prov_msg,
                        "response_preview": _redacted_preview(data_raw),
                    },
                )
                if error_detail is not None:
                    error_detail.append(f"provider_error: {prov_msg}")
                return None

            data = _normalize_openai_response(data_raw)
            _debug_log(f"router: response_ok req_id={req_id} provider={entry.provider}")
            append_current_job_event(
                "api_call",
                f"LLM request completed: {task}.",
                {
                    "phase": "llm_request_done",
                    "request_id": req_id,
                    "provider": entry.provider,
                    "endpoint": _redact_url(ep),
                    "model": model,
                    "task": task,
                    "attempt": attempt,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "request_bytes": len(raw_body),
                    "response_bytes": len(raw.encode("utf-8")),
                    "response_preview": _redacted_preview(data_raw),
                    "normalized_preview": _redacted_preview(data),
                },
            )
            return data if isinstance(data, dict) else None

        except error.HTTPError as exc:
            bod = _decode_http_error_body(exc)
            snippet = _safe_error_snippet(bod or str(exc.reason or exc))
            duration_ms = round((time.perf_counter() - started) * 1000, 2)

            # Handle 429 rate limit: cool this key. Honour the provider's own Retry-After
            # when present — a provider asking for 2s shouldn't cost the pool 60s.
            if exc.code == 429:
                entry.requests_429 += 1
                retry_after = _parse_retry_after_secs(exc.headers)
                cooldown = retry_after if retry_after is not None else self.cooldown_secs
                entry.cooled_until = now + cooldown
                msg = f"HTTPError 429 rate_limited (cooled {cooldown:g}s): {snippet}"
                _debug_log(f"router: {msg}")
                _log_llm_exception(req_id, entry, ep, model, task, attempt, exc.code, duration_ms, msg)
                if error_detail is not None:
                    error_detail.append(msg)
                return None

            # Handle 401/403 auth errors: drop this key permanently
            if exc.code in {401, 403}:
                msg = f"HTTPError {exc.code} auth_failed (dropping key): {snippet}"
                _debug_log(f"router: {msg}")
                _log_llm_exception(req_id, entry, ep, model, task, attempt, exc.code, duration_ms, msg)
                if error_detail is not None:
                    error_detail.append(msg)
                # Remove this entry from pool
                if entry in self.pool:
                    self.pool.remove(entry)
                return None

            # Other HTTP errors: transient, cool down and retry
            msg = f"HTTPError {exc.code}: {snippet}"
            entry.cooled_until = now + self.cooldown_secs
            _debug_log(f"router: {msg} (cooled {self.cooldown_secs}s)")
            _log_llm_exception(req_id, entry, ep, model, task, attempt, exc.code, duration_ms, msg)
            if error_detail is not None:
                error_detail.append(msg)
            return None

        except (error.URLError, TimeoutError, OSError) as exc:
            msg = f"{type(exc).__name__}: {exc}"
            entry.cooled_until = now + self.cooldown_secs
            _debug_log(f"router: transient_error (cooled {self.cooldown_secs}s) {msg}")
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            _log_llm_exception(req_id, entry, ep, model, task, attempt, None, duration_ms, msg)
            if error_detail is not None:
                error_detail.append(msg)
            return None

        except (json.JSONDecodeError, ValueError) as exc:
            msg = f"{type(exc).__name__}: {exc}"
            entry.cooled_until = now + self.cooldown_secs
            _debug_log(f"router: parse_error (cooled {self.cooldown_secs}s) {msg}")
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            _log_llm_exception(req_id, entry, ep, model, task, attempt, None, duration_ms, msg)
            if error_detail is not None:
                error_detail.append(msg)
            return None

    def stats(self) -> dict[str, Any]:
        """Return pool statistics for compile reports."""
        return {
            "pool_size": len(self.pool),
            "entries": [
                {
                    "provider": entry.provider,
                    "endpoint": entry.endpoint,
                    "pool": entry.pool,
                    "requests_sent": entry.requests_sent,
                    "requests_429": entry.requests_429,
                    "cooled": entry.cooled_until > time.monotonic(),
                }
                for entry in self.pool
            ],
        }


def _decode_http_error_body(exc: error.HTTPError) -> str:
    """Decode error response body from HTTP exception."""
    try:
        return exc.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


# Global router instance
_router: LLMRouter | None = None


def get_router() -> LLMRouter:
    """Get or initialize the global router."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
