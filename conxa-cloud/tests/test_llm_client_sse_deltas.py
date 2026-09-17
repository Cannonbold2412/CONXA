"""_iter_sse_text_deltas (BUILD-26 stage c) — parses an OpenAI-compatible `stream: true`
response into content deltas for the copilot's streamed reply. Feeds it a fake file-like
iterable of raw HTTP chunk-lines, matching what urlopen's response object yields."""

from __future__ import annotations

from conxa_core.llm.client import _iter_sse_deltas, _iter_sse_text_deltas


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


# BUILD-33: a reasoning-capable routed model can spend its whole completion budget on hidden
# chain-of-thought and emit zero content deltas — `observed` is how a caller tells that apart
# from a genuinely empty/dead stream.


def test_observed_reports_reasoning_chars_and_finish_reason_openrouter_spelling():
    response = _lines(
        'data: {"choices":[{"delta":{"reasoning":"thinking..."}}]}',
        'data: {"choices":[{"delta":{"reasoning":"more thoughts"}}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
        "data: [DONE]",
    )
    observed: dict = {}
    assert list(_iter_sse_text_deltas(response, observed=observed)) == []
    assert observed["reasoning_chars"] == len("thinking...") + len("more thoughts")
    assert observed["finish_reason"] == "length"


def test_observed_reports_reasoning_content_glm_spelling():
    response = _lines(
        'data: {"choices":[{"delta":{"reasoning_content":"pondering"}}]}',
        "data: [DONE]",
    )
    observed: dict = {}
    assert list(_iter_sse_text_deltas(response, observed=observed)) == []
    assert observed["reasoning_chars"] == len("pondering")


def test_observed_stays_empty_for_a_genuinely_empty_stream():
    response = _lines(
        'data: {"choices":[{"delta":{"role":"assistant"}}]}',
        "data: [DONE]",
    )
    observed: dict = {}
    assert list(_iter_sse_text_deltas(response, observed=observed)) == []
    assert observed == {}


def test_observed_still_collects_content_alongside_reasoning():
    response = _lines(
        'data: {"choices":[{"delta":{"reasoning":"thinking"}}]}',
        'data: {"choices":[{"delta":{"content":"answer"}}]}',
        "data: [DONE]",
    )
    observed: dict = {}
    assert list(_iter_sse_text_deltas(response, observed=observed)) == ["answer"]
    assert observed["reasoning_chars"] == len("thinking")


def test_iter_sse_deltas_tags_reasoning_chunks_for_execute_chat():
    """_iter_sse_deltas (the tool-call-aware sibling, execute_chat only) surfaces reasoning as a
    tagged {"type": "reasoning", ...} chunk instead of only counting it — Conxa Execute streams
    these live as "thinking" in its chat UI."""
    response = _lines(
        'data: {"choices":[{"delta":{"reasoning":"pondering "}}]}',
        'data: {"choices":[{"delta":{"content":"answer"}}]}',
        "data: [DONE]",
    )
    observed: dict = {}
    assert list(_iter_sse_deltas(response, observed=observed)) == [
        {"type": "reasoning", "text": "pondering "},
        {"type": "text", "text": "answer"},
    ]
    assert observed["reasoning_chars"] == len("pondering ")
