"""LLMRouter's 429 handling: honour Retry-After, and wait briefly for a cooled
pool to clear instead of instantly failing a compile step over a transient
rate limit.

Before this behaviour existed, every 429 cooled its key for a flat
llm_router_cooldown_secs (60s) with no regard for what the provider actually
asked for, and route_text/route_vision gave up the instant no entry was
immediately available — even when every entry was seconds from clearing.
"""

from __future__ import annotations

import io
import json
import urllib.error
from email.message import Message

from app.llm.router import LLMRouter, PoolEntry, _parse_retry_after_secs


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


def _http_429(retry_after: str | None) -> urllib.error.HTTPError:
    hdrs = Message()
    if retry_after is not None:
        hdrs["Retry-After"] = retry_after
    return urllib.error.HTTPError(
        url="https://fake.example/openai/v1/chat/completions",
        code=429,
        msg="rate limited",
        hdrs=hdrs,
        fp=io.BytesIO(b'{"error": "rate_limited"}'),
    )


def _http_200(body: dict) -> bytes:
    return json.dumps(body).encode("utf-8")


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body
        self.status = 200

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_retry_after_header_sets_cooldown_not_flat_default(monkeypatch):
    router = LLMRouter.__new__(LLMRouter)
    router.pool = [_entry()]
    router.cooldown_secs = 60
    router.max_retries = 1
    router.wait_ceiling_secs = 8.0
    router._request_counter = 0
    router._last_lru_index = -1

    def fake_urlopen(req, timeout=None):
        raise _http_429("2")

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    result = router.route_text("intent", {}, 5_000)

    assert result is None
    entry = router.pool[0]
    import time as time_mod
    remaining = entry.cooled_until - time_mod.monotonic()
    assert 0 < remaining <= 3, f"expected ~2s cooldown from Retry-After, got {remaining:.2f}s"


def test_missing_retry_after_falls_back_to_flat_cooldown(monkeypatch):
    router = LLMRouter.__new__(LLMRouter)
    router.pool = [_entry()]
    router.cooldown_secs = 60
    router.max_retries = 1
    router.wait_ceiling_secs = 8.0
    router._request_counter = 0
    router._last_lru_index = -1

    def fake_urlopen(req, timeout=None):
        raise _http_429(None)

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    router.route_text("intent", {}, 5_000)

    import time as time_mod
    remaining = router.pool[0].cooled_until - time_mod.monotonic()
    assert 55 < remaining <= 60


def test_waits_for_soonest_cooldown_then_succeeds(monkeypatch):
    import time as time_mod

    router = LLMRouter.__new__(LLMRouter)
    router.pool = [_entry(provider="a"), _entry(provider="b")]
    router.cooldown_secs = 60
    router.max_retries = 2
    router.wait_ceiling_secs = 8.0
    router._request_counter = 0
    router._last_lru_index = -1

    now = time_mod.monotonic()
    for e in router.pool:
        e.cooled_until = now + 0.3  # both cooled, but clear well within wait_ceiling_secs

    slept: list[float] = []
    # app.llm.router imports the same `time` module object as this test, so patching
    # its `.sleep` attribute patches the module globally — grab the real function first
    # or the wrapper below recurses into itself.
    real_sleep = time_mod.sleep

    def fake_sleep(s: float) -> None:
        # Record the wait but actually pause — the router re-checks cooled_until
        # against real monotonic time after waking, so a no-op mock would leave
        # every entry still cooled and defeat the point of this test.
        slept.append(s)
        real_sleep(s)

    monkeypatch.setattr("app.llm.router.time.sleep", fake_sleep)

    def fake_urlopen(req, timeout=None):
        return _FakeResponse(_http_200({"choices": [{"message": {"content": "{}"}}]}))

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    result = router.route_text("intent", {}, 5_000)

    assert result is not None
    assert len(slept) == 1
    assert 0 < slept[0] <= 0.31


def test_cooldown_beyond_ceiling_fails_fast_without_sleeping(monkeypatch):
    import time as time_mod

    router = LLMRouter.__new__(LLMRouter)
    router.pool = [_entry()]
    router.cooldown_secs = 60
    router.max_retries = 2
    router.wait_ceiling_secs = 8.0
    router._request_counter = 0
    router._last_lru_index = -1
    router.pool[0].cooled_until = time_mod.monotonic() + 60  # far beyond the ceiling

    slept: list[float] = []
    monkeypatch.setattr("app.llm.router.time.sleep", lambda s: slept.append(s))

    def fake_urlopen(req, timeout=None):
        raise AssertionError("should never call the provider while cooled beyond the ceiling")

    monkeypatch.setattr("app.llm.router.request.urlopen", fake_urlopen)

    error_detail: list[str] = []
    result = router.route_text("intent", {}, 5_000, error_detail=error_detail)

    assert result is None
    assert slept == []
    assert "all providers cooled or exhausted" in error_detail[0]


def test_parse_retry_after_secs_rejects_garbage_and_out_of_range():
    assert _parse_retry_after_secs(Message()) is None
    hdrs = Message()
    hdrs["Retry-After"] = "not-a-number"
    assert _parse_retry_after_secs(hdrs) is None
    hdrs = Message()
    hdrs["Retry-After"] = "5000"
    assert _parse_retry_after_secs(hdrs) is None
    hdrs = Message()
    hdrs["Retry-After"] = "3"
    assert _parse_retry_after_secs(hdrs) == 3.0
