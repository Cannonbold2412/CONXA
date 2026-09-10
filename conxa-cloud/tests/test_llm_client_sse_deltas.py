"""_iter_sse_text_deltas (BUILD-26 stage c) — parses an OpenAI-compatible `stream: true`
response into content deltas for the copilot's streamed reply. Feeds it a fake file-like
iterable of raw HTTP chunk-lines, matching what urlopen's response object yields."""

from __future__ import annotations

from conxa_core.llm.client import _iter_sse_text_deltas


def _lines(*raw: str) -> list[bytes]:
    return [line.encode("utf-8") for line in raw]


def test_yields_each_content_delta_in_order():
    response = _lines(
        'data: {"choices":[{"delta":{"content":"Step "}}]}',
        'data: {"choices":[{"delta":{"content":"3 failed."}}]}',
        "data: [DONE]",
    )
    assert list(_iter_sse_text_deltas(response)) == ["Step ", "3 failed."]


def test_stops_at_done_sentinel_and_ignores_trailing_lines():
    response = _lines(
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        "data: [DONE]",
        'data: {"choices":[{"delta":{"content":"should not appear"}}]}',
    )
    assert list(_iter_sse_text_deltas(response)) == ["hi"]


def test_skips_blank_lines_and_non_data_lines():
    response = _lines(
        "",
        ": keep-alive comment",
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
    )
    assert list(_iter_sse_text_deltas(response)) == ["ok"]


def test_yields_text_from_multimodal_content_parts():
    response = _lines(
        'data: {"choices":[{"delta":{"content":[{"type":"text","text":"Hello"}]}}]}',
    )
    assert list(_iter_sse_text_deltas(response)) == ["Hello"]


def test_yields_message_content_when_provider_omits_delta():
    response = _lines(
        'data: {"choices":[{"message":{"content":"done"},"finish_reason":"stop"}]}',
    )
    assert list(_iter_sse_text_deltas(response)) == ["done"]


def test_skips_role_only_deltas_and_malformed_json():
    response = _lines(
        'data: {"choices":[{"delta":{"role":"assistant"}}]}',
        "data: not json",
        'data: {"choices":[]}',
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
    )
    assert list(_iter_sse_text_deltas(response)) == ["ok"]
