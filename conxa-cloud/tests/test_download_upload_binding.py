"""EXEC-10/W-2: a file downloaded in one tab can be uploaded in another inside a single
compiled skill, with no LLM round-trip. See
conxa_compile/skill_package_builder_saved_skill.py::_bind_downloads_to_uploads and
_merge_saved_inputs_with_execution_placeholders (the runtime-only-placeholder exclusion).
"""
from __future__ import annotations

import json

from conxa_compile.skill_package_builder_saved_skill import (
    _bind_downloads_to_uploads,
    _merge_saved_inputs_with_execution_placeholders,
)


def _download_step(suggested_filename: str) -> dict:
    return {"action": "download_observed", "value": json.dumps({"url": "https://x.test/f", "suggested_filename": suggested_filename})}


def _upload_step(recorded_name: str) -> dict:
    return {"action": "upload", "value": json.dumps([{"name": recorded_name, "size": 1, "type": "application/octet-stream"}])}


def test_single_matching_download_binds_to_plain_downloaded_file_placeholder() -> None:
    steps = [_download_step("report.pdf"), {"action": "click", "value": None}, _upload_step("report.pdf")]
    _bind_downloads_to_uploads(steps)
    assert steps[2]["value"] == "{{downloaded_file}}"


def test_unmatched_upload_is_left_completely_untouched() -> None:
    original_value = json.dumps([{"name": "unrelated.pdf"}])
    steps = [_download_step("report.pdf"), {"action": "upload", "value": original_value}]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == original_value


def test_no_downloads_at_all_leaves_uploads_untouched() -> None:
    original_value = json.dumps([{"name": "whatever.pdf"}])
    steps = [{"action": "upload", "value": original_value}]
    _bind_downloads_to_uploads(steps)
    assert steps[0]["value"] == original_value


def test_multiple_same_name_downloads_bind_fifo_to_indexed_placeholders() -> None:
    """Two downloads that share a filename must not both collapse onto {{downloaded_file}}
    (the latest one) — each matching upload gets its own instance, in recorded order."""
    steps = [
        _download_step("x.csv"),
        _download_step("x.csv"),
        _upload_step("x.csv"),
        _upload_step("x.csv"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[2]["value"] == "{{downloaded_file_1}}"
    assert steps[3]["value"] == "{{downloaded_file_2}}"


def test_upload_before_its_matching_download_is_not_bound() -> None:
    """FIFO queue only pairs an upload with a download that already happened — an upload
    recorded earlier in the workflow than any matching download must stay untouched."""
    original_value = json.dumps([{"name": "report.pdf"}])
    steps = [{"action": "upload", "value": original_value}, _download_step("report.pdf")]
    _bind_downloads_to_uploads(steps)
    assert steps[0]["value"] == original_value


def test_downloaded_file_placeholders_are_never_auto_declared_as_runtime_inputs() -> None:
    execution_steps = [
        {"type": "download_observed"},
        {"type": "upload", "value": "{{downloaded_file}}"},
        {"type": "upload", "value": "{{downloaded_file_2}}"},
    ]
    inputs = _merge_saved_inputs_with_execution_placeholders([], execution_steps)
    names = {item["name"] for item in inputs}
    assert "downloaded_file" not in names
    assert "downloaded_file_2" not in names


def test_a_genuinely_user_supplied_placeholder_is_still_auto_declared() -> None:
    execution_steps = [{"type": "fill", "value": "{{customer_email}}"}]
    inputs = _merge_saved_inputs_with_execution_placeholders([], execution_steps)
    names = {item["name"] for item in inputs}
    assert "customer_email" in names
