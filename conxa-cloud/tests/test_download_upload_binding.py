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


def _bulk_upload_step(*recorded_names: str) -> dict:
    return {"action": "upload", "value": json.dumps(
        [{"name": n, "size": 1, "type": "application/octet-stream"} for n in recorded_names]
    )}


def _zip_download_step(suggested_filename: str, *zip_members: str) -> dict:
    return {"action": "download_observed", "value": json.dumps(
        {"url": "https://x.test/f", "suggested_filename": suggested_filename, "zip_members": list(zip_members)}
    )}


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


def test_bulk_multiselect_upload_with_all_files_matched_binds_to_downloaded_files_dir() -> None:
    """'Upload all 20 files' recorded as one <input multiple> pick — every recorded filename
    matches an earlier download, so the whole run's own download folder is a safe bind."""
    steps = [
        _download_step("a.pdf"),
        _download_step("b.pdf"),
        _download_step("c.pdf"),
        _bulk_upload_step("a.pdf", "b.pdf", "c.pdf"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[3]["value"] == "{{downloaded_files_dir}}"


def test_bulk_multiselect_upload_with_a_partial_match_is_left_untouched() -> None:
    """One file in the bulk selection has no matching earlier download — binding to the whole
    folder would hand the upload control a file it was never meant to see, so refuse."""
    original_value = json.dumps([{"name": "a.pdf"}, {"name": "unrelated.pdf"}])
    steps = [_download_step("a.pdf"), {"action": "upload", "value": original_value}]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == original_value


def test_bulk_upload_consumes_its_matched_downloads_so_a_later_step_cant_reclaim_them() -> None:
    steps = [
        _download_step("a.pdf"),
        _download_step("b.pdf"),
        _bulk_upload_step("a.pdf", "b.pdf"),
        _upload_step("a.pdf"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[2]["value"] == "{{downloaded_files_dir}}"
    # "a.pdf" was already consumed by the bulk upload above — nothing left to bind to.
    assert steps[3]["value"] == json.dumps([{"name": "a.pdf", "size": 1, "type": "application/octet-stream"}])


def test_zip_own_filename_still_binds_to_plain_downloaded_file_placeholder() -> None:
    """Recording picked the zip itself (not its contents) — replay must upload the zip
    verbatim, so this still binds to {{downloaded_file}}, not a _dir placeholder."""
    steps = [_zip_download_step("archive.zip", "a.pdf", "b.pdf"), _upload_step("archive.zip")]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == "{{downloaded_file}}"


def test_single_file_picked_from_inside_a_zip_binds_to_that_exact_extracted_file() -> None:
    steps = [_zip_download_step("archive.zip", "a.pdf", "b.pdf"), _upload_step("a.pdf")]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == "{{downloaded_file_dir}}/a.pdf"


def test_single_file_from_a_zip_uses_indexed_dir_placeholder_when_workflow_has_other_downloads() -> None:
    steps = [
        _download_step("cover.pdf"),
        _zip_download_step("archive.zip", "a.pdf", "b.pdf"),
        _upload_step("a.pdf"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[2]["value"] == "{{downloaded_file_2_dir}}/a.pdf"


def test_bulk_upload_matching_the_entire_zip_binds_to_the_whole_extracted_folder() -> None:
    steps = [
        _zip_download_step("archive.zip", "a.pdf", "b.pdf", "c.pdf"),
        _bulk_upload_step("a.pdf", "b.pdf", "c.pdf"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == "{{downloaded_file_dir}}"


def test_bulk_upload_matching_only_part_of_a_zip_binds_to_explicit_path_list() -> None:
    """Picking 2 of a zip's 3 files binds to an explicit path list, not the whole folder."""
    original_value = json.dumps([{"name": "a.pdf"}, {"name": "b.pdf"}])
    steps = [_zip_download_step("archive.zip", "a.pdf", "b.pdf", "c.pdf"), {"action": "upload", "value": original_value}]
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == json.dumps(
        ["{{downloaded_file_dir}}/a.pdf", "{{downloaded_file_dir}}/b.pdf"]
    )


def test_upload_intent_action_is_bound_like_upload() -> None:
    steps = [_zip_download_step("archive.zip", "a.pdf", "b.pdf"), _upload_step("a.pdf")]
    steps[1]["action"] = "upload_intent"
    _bind_downloads_to_uploads(steps)
    assert steps[1]["value"] == "{{downloaded_file_dir}}/a.pdf"


def test_zip_member_matching_does_not_steal_a_name_that_matches_a_real_top_level_download() -> None:
    """A top-level suggested_filename match always wins over a same-named zip member."""
    steps = [
        _zip_download_step("archive.zip", "report.pdf"),
        _download_step("report.pdf"),
        _upload_step("report.pdf"),
    ]
    _bind_downloads_to_uploads(steps)
    assert steps[2]["value"] == "{{downloaded_file_2}}"


def test_downloaded_file_dir_placeholder_is_never_auto_declared_as_runtime_input() -> None:
    execution_steps = [
        {"type": "download_observed"},
        {"type": "upload", "value": "{{downloaded_file_dir}}/a.pdf"},
        {"type": "upload", "value": "{{downloaded_file_2_dir}}"},
    ]
    inputs = _merge_saved_inputs_with_execution_placeholders([], execution_steps)
    names = {item["name"] for item in inputs}
    assert "downloaded_file_dir" not in names
    assert "downloaded_file_2_dir" not in names


def test_downloaded_files_dir_placeholder_is_never_auto_declared_as_runtime_input() -> None:
    execution_steps = [
        {"type": "download_observed"},
        {"type": "upload", "value": "{{downloaded_files_dir}}"},
    ]
    inputs = _merge_saved_inputs_with_execution_placeholders([], execution_steps)
    names = {item["name"] for item in inputs}
    assert "downloaded_files_dir" not in names


def test_a_genuinely_user_supplied_placeholder_is_still_auto_declared() -> None:
    execution_steps = [{"type": "fill", "value": "{{customer_email}}"}]
    inputs = _merge_saved_inputs_with_execution_placeholders([], execution_steps)
    names = {item["name"] for item in inputs}
    assert "customer_email" in names
