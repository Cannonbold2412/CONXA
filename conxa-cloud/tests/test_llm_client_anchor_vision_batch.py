"""Shared prompt-building engine: anchor_vision_batch (Stage 4, mega-workflow
502 fix). A batched vision-anchor request packs several steps' screenshots
into one call instead of one request per step — asserts the multi-image
message shape and the token budget that scales with batch size.
"""

from __future__ import annotations

from conxa_core.llm.client import _is_vision_task, _openai_body_dict, _openai_messages_for_task


def test_anchor_vision_batch_is_a_vision_task():
    assert _is_vision_task("anchor_vision_batch")


def test_anchor_vision_batch_builds_one_labeled_image_block_per_item():
    payload = {
        "items": [
            {"image_base64": "AAA", "image_mime": "image/jpeg", "user_text": "first prompt"},
            {"image_base64": "BBB", "image_mime": "image/jpeg", "user_text": "second prompt"},
        ]
    }
    messages = _openai_messages_for_task("anchor_vision_batch", payload)

    assert messages[0]["role"] == "system"
    assert "results" in messages[0]["content"]

    user_content = messages[1]["content"]
    # 2 items -> 2 (text, image_url) pairs -> 4 content blocks.
    assert len(user_content) == 4
    assert user_content[0] == {"type": "text", "text": "--- Image 0 ---\nfirst prompt"}
    assert user_content[1] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAA"}}
    assert user_content[2] == {"type": "text", "text": "--- Image 1 ---\nsecond prompt"}
    assert user_content[3] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,BBB"}}


def test_anchor_vision_batch_skips_non_dict_items():
    payload = {"items": [{"image_base64": "AAA", "user_text": "x"}, "not a dict", None]}
    messages = _openai_messages_for_task("anchor_vision_batch", payload)
    user_content = messages[1]["content"]
    assert len(user_content) == 2  # only the one valid item


def test_anchor_vision_batch_max_tokens_scales_with_item_count():
    body_one = _openai_body_dict("anchor_vision_batch", {"items": [{}]}, json_mode=True)
    body_four = _openai_body_dict("anchor_vision_batch", {"items": [{}, {}, {}, {}]}, json_mode=True)
    body_empty = _openai_body_dict("anchor_vision_batch", {"items": []}, json_mode=True)

    assert body_one["max_tokens"] == 1024
    assert body_four["max_tokens"] == 4096
    assert body_empty["max_tokens"] == 1024  # floored at 1 item's worth, never zero
