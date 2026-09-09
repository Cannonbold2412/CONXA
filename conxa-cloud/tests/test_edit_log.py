"""Reviewer edit log (BUILD-25 stage a) — must key on step_key, not step_index,
so a reorder/insert/delete elsewhere in the workflow never misattributes a
change to the wrong step (BUILD-22/BUILD-23). Also exercises the eval
harness's join logic (stage a2) against a scripted edit sequence.
"""

from __future__ import annotations

from conxa_compile.editor.edit_log import append_edit, diff_steps, edits_path, read_edits
from conxa_compile.editor.workflow_mutations import delete_step_at, reorder_steps


def _doc(steps: list[dict]) -> dict:
    return {"meta": {"version": 1}, "skills": [{"steps": steps}]}


def _click(stable_hash: str, **overrides) -> dict:
    step = {
        "action": {"action": "click"},
        "url": "https://x",
        "identity_bundle": {"stable_hash": stable_hash},
        "input_binding": "email_2",
        "value": "{{email_2}}",
    }
    step.update(overrides)
    return step


def test_diff_steps_reports_changed_field_keyed_on_step_key():
    before = _doc([_click("h1")])
    after = _doc([_click("h1", input_binding="sender_email", value="{{sender_email}}")])
    changes = diff_steps(before, after)
    fields_changed = {c["field"] for c in changes}
    assert "input_binding" in fields_changed
    assert "value" in fields_changed
    assert all(c["step_key"] == "h1#1" for c in changes)


def test_diff_steps_survives_a_reorder_elsewhere():
    # A binding rename on step h1, plus an unrelated reorder that moves it to
    # a different position — the edit must still key on h1, not on position 0/1.
    before = _doc([_click("h1"), _click("h2")])
    after = reorder_steps(before, [1, 0])
    after["skills"][0]["steps"][1]["input_binding"] = "sender_email"
    after["skills"][0]["steps"][1]["value"] = "{{sender_email}}"

    changes = diff_steps(before, after)
    binding_changes = [c for c in changes if c["field"] == "input_binding"]
    assert len(binding_changes) == 1
    assert binding_changes[0]["step_key"] == "h1#1"
    assert binding_changes[0]["before"] == "email_2"
    assert binding_changes[0]["after"] == "sender_email"


def test_diff_steps_reports_deleted_step():
    before = _doc([_click("h1"), _click("h2")])
    after = delete_step_at(before, 0)
    changes = diff_steps(before, after)
    removed = [c for c in changes if c["field"] == "_step" and c["before"] == "removed"]
    assert len(removed) == 1
    assert removed[0]["step_key"] == "h1#1"


def test_append_edit_writes_jsonl_and_read_edits_round_trips(tmp_path, monkeypatch):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    skill_id = "skill_test_1"
    before = _doc([_click("h1")])
    after = _doc([_click("h1", input_binding="sender_email", value="{{sender_email}}")])

    append_edit(skill_id, "patch_step", before, after)

    assert edits_path(skill_id).is_file()
    records = read_edits(skill_id)
    assert any(r["field"] == "input_binding" and r["after"] == "sender_email" for r in records)
    assert all(r["skill_id"] == skill_id and r["command"] == "patch_step" for r in records)


def test_append_edit_is_a_noop_when_nothing_changed(tmp_path, monkeypatch):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    skill_id = "skill_test_2"
    doc = _doc([_click("h1")])
    append_edit(skill_id, "patch_step", doc, doc)
    assert read_edits(skill_id) == []


def test_append_edit_never_raises_on_malformed_input():
    # Must degrade silently — an edit must never fail because logging it failed.
    append_edit("skill_x", "patch_step", None, {"skills": []})
    append_edit("skill_x", "patch_step", {"skills": []}, "not a dict")
