"""BUILD-33: a routed reasoning model can spend its whole completion budget on hidden
chain-of-thought and stream zero content deltas — a real, paid-for generation, not a dead
provider. Before this fix the router treated that identically to a genuinely empty/dead
stream: three retries (the max_retries sweep) against a request shaped to fail identically
every time, reported to the caller as `llm_all_providers_failed`.

These tests exercise LLMRouter.route_text(..., on_delta=...) against a fake streaming urlopen,
matching the pattern in test_llm_router_backoff.py."""

from __future__ import annotations

from threading import Lock as _Lock

from app.llm.router import LLMRouter, PoolEntry


def _entry(**overrides) -> PoolEntry:
    base = dict(
        provider="fake",
        endpoint="https://fake.example/v1",
        api_key="key",
        text_model="fake-text",
        vision_model="fake-vision",
        pool="free",
    )
    base.update(overrides)
    return PoolEntry(**base)


def _fresh_router(entries: list[PoolEntry], *, max_retries: int = 3) -> LLMRouter:
    router = LLMRouter.__new__(LLMRouter)
    router.pool = entries
    router.cooldown_secs = 60
    router.max_retries = max_retries
    router.wait_ceiling_secs = 8.0
    router.total_budget_secs = 75.0
    router._request_counter = 0
    router._last_lru_index = -1
    router._lru_lock = _Lock()
    return router


class _FakeStreamResponse:
    """Iterating this yields raw SSE chunk-lines, matching what urlopen's response object
    yields when read line by line — see conxa_core.llm.client._iter_sse_text_deltas."""

    def __init__(self, lines: list[bytes]):
        self._lines = lines
        self.status = 200

    def __iter__(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _sse_lines(*raw: str) -> list[bytes]:
    return [line.encode("utf-8") for line in raw]


_REASONING_ONLY_BODY = _sse_lines(
    'data: {"choices":[{"delta":{"reasoning":"thinking really hard..."}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    "data: [DONE]",
)

_GENUINELY_EMPTY_BODY = _sse_lines(
    'data: {"choices":[{"delta":{"role":"assistant"}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "data: [DONE]",
)


def test_reasoning_only_stream_stops_after_one_attempt_and_does_not_cool(monkeypatch):
    router = _fresh_router([_entry(), _entry(provider="fake2")], max_retries=3)
    calls: list[str] = []

    def fake_urlopen(req, timeout=None):
        calls.append("called")
        return _FakeStreamResponse(_REASONING_ONLY_BODY)

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    error_detail: list[str] = []
    deltas: list[str] = []
    result = router.route_text(
        "copilot_reply", {}, 5_000, error_detail=error_detail, on_delta=deltas.append
    )

    assert result is None
    assert deltas == []
    assert len(calls) == 1, "a reasoning-only response must not be retried against another provider"
    assert router.pool[0].cooled_until_text == 0.0
    assert any(line.startswith("reasoning_only_no_content") for line in error_detail)


def test_reasoning_only_via_finish_reason_length_with_no_reasoning_delta(monkeypatch):
    """A provider that doesn't echo reasoning deltas but reports finish_reason=length with
    no content is the same shape — length-limited before writing anything."""
    router = _fresh_router([_entry()], max_retries=3)
    calls: list[str] = []

    def fake_urlopen(req, timeout=None):
        calls.append("called")
        return _FakeStreamResponse(
            _sse_lines('data: {"choices":[{"delta":{},"finish_reason":"length"}]}', "data: [DONE]")
        )

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    error_detail: list[str] = []
    result = router.route_text("copilot_reply", {}, 5_000, error_detail=error_detail, on_delta=lambda c: None)

    assert result is None
    assert len(calls) == 1
    assert any(line.startswith("reasoning_only_no_content") for line in error_detail)


def test_genuinely_empty_stream_still_fails_over_and_is_not_labelled_reasoning(monkeypatch):
    """Regression: an ordinary empty stream (no reasoning, no finish_reason=length) keeps
    today's behaviour — return None, let _route retry against the next entry."""
    router = _fresh_router([_entry(), _entry(provider="fake2")], max_retries=3)
    calls: list[str] = []

    def fake_urlopen(req, timeout=None):
        calls.append("called")
        return _FakeStreamResponse(_GENUINELY_EMPTY_BODY)

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    error_detail: list[str] = []
    result = router.route_text("copilot_reply", {}, 5_000, error_detail=error_detail, on_delta=lambda c: None)

    assert result is None
    assert len(calls) > 1, "a genuinely empty stream should still fail over across entries"
    assert not any(line.startswith("reasoning_only_no_content") for line in error_detail)
    assert any(line == "stream produced no content" for line in error_detail)


def test_no_task_or_endpoint_ever_gets_a_reasoning_key(monkeypatch):
    """Reasoning is always left on — the router used to send OpenRouter entries
    reasoning={"enabled": False} to save tokens, but one deployment (z-ai/glm-5.3-flash)
    hard-rejected that with a 400 ("Reasoning is mandatory..."), so the lever was removed
    entirely rather than special-cased per entry. No task, on any endpoint, sends a
    "reasoning" body key any more."""
    router = _fresh_router([_entry(endpoint="https://openrouter.ai/api/v1")], max_retries=1)
    seen_bodies: list[dict] = []

    def fake_urlopen(req, timeout=None):
        import json as _json

        seen_bodies.append(_json.loads(req.data.decode("utf-8")))
        return _FakeStreamResponse(_sse_lines('data: {"choices":[{"delta":{"content":"hi"}}]}', "data: [DONE]"))

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    for task in ("copilot_reply", "copilot_diagnose", "anchor_vision", "execute_chat"):
        router.route_text(task, {}, 5_000, on_delta=lambda c: None)

    assert all("reasoning" not in body for body in seen_bodies)


def test_non_openrouter_endpoint_does_not_get_reasoning_key(monkeypatch):
    router = _fresh_router([_entry(endpoint="https://api.groq.com/openai/v1")], max_retries=1)
    seen_bodies: list[dict] = []

    def fake_urlopen(req, timeout=None):
        import json as _json

        seen_bodies.append(_json.loads(req.data.decode("utf-8")))
        return _FakeStreamResponse(_sse_lines('data: {"choices":[{"delta":{"content":"hi"}}]}', "data: [DONE]"))

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    router.route_text("copilot_reply", {}, 5_000, on_delta=lambda c: None)

    assert "reasoning" not in seen_bodies[0]


def test_non_streaming_reasoning_only_response_stops_after_one_attempt_and_does_not_cool(monkeypatch):
    """Non-streaming twin of test_reasoning_only_stream_stops_after_one_attempt_and_does_not_cool:
    a JSON response with empty message content and finish_reason="length" must fail fast (no
    cooldown, no failover) instead of returning a silently empty answer."""
    router = _fresh_router([_entry(), _entry(provider="fake2")], max_retries=3)
    calls: list[str] = []

    class _FakeJsonResponse:
        status = 200

        def read(self):
            import json as _json

            return _json.dumps(
                {"choices": [{"message": {"content": ""}, "finish_reason": "length"}]}
            ).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def fake_urlopen(req, timeout=None):
        calls.append("called")
        return _FakeJsonResponse()

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    error_detail: list[str] = []
    result = router.route_text("copilot_diagnose", {}, 5_000, error_detail=error_detail)

    assert result is None
    assert len(calls) == 1, "a reasoning-only response must not be retried against another provider"
    assert router.pool[0].cooled_until_text == 0.0
    assert any(line.startswith("reasoning_only_no_content") for line in error_detail)
