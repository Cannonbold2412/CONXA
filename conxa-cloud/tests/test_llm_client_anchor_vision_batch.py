"""Shared prompt-building engine: anchor_vision_frameset. One step's 5 time-offset
frames go into one call — asserts the multi-image message shape and the fixed
token budget (one label + one short sentence, not the old per-item-scaled batch)."""

from __future__ import annotations

from conxa_core.llm.client import _is_vision_task, _openai_body_dict, _openai_messages_for_task


def test_anchor_vision_frameset_is_a_vision_task():
    assert _is_vision_task("anchor_vision_frameset")


def test_anchor_vision_batch_is_no_longer_a_vision_task():
    assert not _is_vision_task("anchor_vision_batch")


def test_anchor_vision_frameset_builds_one_labeled_image_block_per_frame():
    payload = {
        "frames": [
            {"label": "before_far", "image_base64": "AAA", "image_mime": "image/jpeg"},
            {"label": "before_near", "image_base64": "BBB", "image_mime": "image/jpeg"},
        ],
        "user_text": "target bbox etc",
    }
    messages = _openai_messages_for_task("anchor_vision_frameset", payload)

    assert messages[0]["role"] == "system"
    assert "chosen_frame" in messages[0]["content"]
    assert "anchor_sentence" in messages[0]["content"]

    user_content = messages[1]["content"]
    # 2 frames -> 2 (text, image_url) pairs -> 4 content blocks, plus the trailing
    # user_text block -> 5 total.
    assert len(user_content) == 5
    assert user_content[0] == {"type": "text", "text": "--- Frame: before_far ---"}
    assert user_content[1] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAA"}}
    assert user_content[2] == {"type": "text", "text": "--- Frame: before_near ---"}
    assert user_content[3] == {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,BBB"}}
    assert user_content[4] == {"type": "text", "text": "target bbox etc"}


def test_anchor_vision_frameset_skips_non_dict_frames():
    payload = {"frames": [{"label": "at", "image_base64": "AAA"}, "not a dict", None], "user_text": ""}
    messages = _openai_messages_for_task("anchor_vision_frameset", payload)
    user_content = messages[1]["content"]
    # 1 valid frame -> 2 blocks, plus the trailing (empty) user_text block -> 3.
    assert len(user_content) == 3


def test_anchor_vision_frameset_max_tokens_is_fixed():
    body = _openai_body_dict("anchor_vision_frameset", {"frames": [{}, {}, {}, {}, {}]}, json_mode=True)
    assert body["max_tokens"] == 300
