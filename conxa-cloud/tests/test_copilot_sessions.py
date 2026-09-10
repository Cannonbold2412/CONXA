"""Human Review Copilot session archive (BUILD-26) — written when a reviewer starts a new
session, so the outgoing conversation isn't silently lost."""

from __future__ import annotations

import json

from conxa_compile.editor.copilot_sessions import copilot_sessions_path, save_copilot_session


def test_save_copilot_session_appends_one_line_per_call(tmp_path, monkeypatch):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    skill_id = "skill_test_1"
    transcript = [{"role": "user", "text": "why did step 3 fail?"}, {"role": "assistant", "text": "..."}]

    save_copilot_session(skill_id, transcript)
    save_copilot_session(skill_id, transcript)

    lines = copilot_sessions_path(skill_id).read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    entry = json.loads(lines[0])
    assert entry["skill_id"] == skill_id
    assert entry["messages"] == transcript
    assert "ts" in entry


def test_save_copilot_session_is_a_noop_for_an_empty_transcript(tmp_path, monkeypatch):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    save_copilot_session("skill_test_2", [])
    assert not copilot_sessions_path("skill_test_2").exists() or (
        copilot_sessions_path("skill_test_2").read_text(encoding="utf-8") == ""
    )


def test_save_copilot_session_never_raises_when_the_log_file_cannot_be_written(monkeypatch):
    import conxa_compile.editor.copilot_sessions as copilot_sessions_mod

    def _boom(_skill_id: str):
        raise OSError("disk full")

    monkeypatch.setattr(copilot_sessions_mod, "copilot_sessions_path", _boom)
    save_copilot_session("skill_test_3", [{"role": "user", "text": "hi"}])
