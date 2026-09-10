"""Verified retest RPC (BUILD-26 stage e) — cmd_copilot_verify. Covers the irreversible-step
pre-flight count, the fixed/still_failing/progressed verdict derivation, the cancelled-run
no-op, and that every verdict lands in the same edits.jsonl append_edit/append_decision already
write into (see edit_log.py::append_verification).
"""

from __future__ import annotations

import importlib.util
import os
import sys
from unittest.mock import patch

import pytest

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))


@pytest.fixture()
def backend():
    spec = importlib.util.spec_from_file_location("cbackend_copilot_verify", os.path.join(_PY_DIR, "backend.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: list[dict] = []
    from handlers import protocol as _protocol

    mod._write = lambda obj: out.append(obj)
    _protocol._write = lambda obj: out.append(obj)
    return mod.Backend(), out


def _write_skill(skill_id: str, steps: list[dict]) -> None:
    from conxa_core.storage.json_store import write_skill

    write_skill(skill_id, {"meta": {"id": skill_id, "title": "Verify test skill", "version": 1}, "skills": [{"id": skill_id, "steps": steps}]})


def _click(stable_hash: str, *, consequence: str = "reversible") -> dict:
    return {
        "action": {"action": "click"},
        "url": "https://x",
        "identity_bundle": {"stable_hash": stable_hash},
        "intent": "click_submit",
        "consequence": consequence,
        "target": {"primary_selector": f"#{stable_hash}", "fallback_selectors": []},
    }


def _save_workflow(skill_id: str, **overrides):
    from conxa_core.models.workflow import Workflow
    from conxa_core.storage.workflow_store import save_workflow

    wf = Workflow(
        id="wf_verify_1", slug="wf-verify-1", name="Verify WF", target_url="https://x",
        skill_id=skill_id, last_test_inputs={}, **overrides,
    )
    save_workflow(wf)
    return wf


def test_preflight_counts_only_irreversible_steps(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_preflight"
    _write_skill(skill_id, [_click("h1"), _click("h2", consequence="irreversible")])
    _save_workflow(skill_id)

    result = b.cmd_copilot_verify(
        {"skill_id": skill_id, "step_key": "h2#1", "confirmed": False}, "rid1",
    )
    assert result["status"] == "confirm_required"
    assert result["irreversible_count"] == 1
    assert result["irreversible_steps"][0]["step_key"] == "h2#1"


def test_preflight_never_builds_or_runs_anything(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_no_run"
    _write_skill(skill_id, [_click("h1")])
    _save_workflow(skill_id)

    with patch.object(b, "cmd_build_skill_package") as build_mock, patch.object(b, "cmd_test_workflow") as test_mock:
        b.cmd_copilot_verify({"skill_id": skill_id, "step_key": "h1#1", "confirmed": False}, "rid1")
    build_mock.assert_not_called()
    test_mock.assert_not_called()


def test_confirmed_verify_passed_writes_fixed_verdict(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_fixed"
    _write_skill(skill_id, [_click("h1")])
    _save_workflow(skill_id)

    with patch.object(b, "cmd_build_skill_package", return_value={}), \
         patch.object(b, "cmd_test_workflow", return_value={"status": "passed", "message": "Done.", "run_id": "run_ok"}):
        result = b.cmd_copilot_verify(
            {"skill_id": skill_id, "step_key": "h1#1", "proposal_id": "p1", "confirmed": True}, "rid1",
        )

    assert result["status"] == "verified"
    assert result["verdict"] == "fixed"
    assert result["run_id"] == "run_ok"

    verifications = [e for e in read_edits(skill_id) if e.get("command") == "copilot_verify"]
    assert len(verifications) == 1
    assert verifications[0]["decision"] == "fixed"
    assert verifications[0]["proposal_id"] == "p1"
    assert verifications[0]["run_id"] == "run_ok"


def test_confirmed_verify_same_step_still_failing(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from handlers.protocol import _CommandError
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_still_failing"
    _write_skill(skill_id, [_click("h1")])
    _save_workflow(skill_id)

    with patch.object(b, "cmd_build_skill_package", return_value={}), \
         patch.object(b, "cmd_test_workflow", side_effect=_CommandError("workflow_test_failed", "still broken", run_id="run_fail")), \
         patch("conxa_compile.editor.evidence.build_evidence_bundle", return_value={"failed_step_key": "h1#1"}):
        result = b.cmd_copilot_verify(
            {"skill_id": skill_id, "step_key": "h1#1", "proposal_id": "p2", "confirmed": True}, "rid1",
        )

    assert result["verdict"] == "still_failing"
    verifications = [e for e in read_edits(skill_id) if e.get("command") == "copilot_verify"]
    assert verifications[0]["decision"] == "still_failing"


def test_confirmed_verify_different_step_now_fails_is_progressed(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from handlers.protocol import _CommandError

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_progressed"
    _write_skill(skill_id, [_click("h1"), _click("h2")])
    _save_workflow(skill_id)

    with patch.object(b, "cmd_build_skill_package", return_value={}), \
         patch.object(b, "cmd_test_workflow", side_effect=_CommandError("workflow_test_failed", "new break", run_id="run_fail2")), \
         patch("conxa_compile.editor.evidence.build_evidence_bundle", return_value={"failed_step_key": "h2#1"}):
        result = b.cmd_copilot_verify(
            {"skill_id": skill_id, "step_key": "h1#1", "confirmed": True}, "rid1",
        )

    assert result["verdict"] == "progressed"


def test_cancelled_run_writes_no_verdict(backend, monkeypatch, tmp_path):
    """A user-initiated cancel must never be recorded as fixed/still_failing/progressed — it
    would poison the correction dataset with a false label."""
    from conxa_core.config import settings
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, _out = backend
    skill_id = "skill_verify_cancelled"
    _write_skill(skill_id, [_click("h1")])
    _save_workflow(skill_id)

    with patch.object(b, "cmd_build_skill_package", return_value={}), \
         patch.object(b, "cmd_test_workflow", return_value={"status": "cancelled", "message": "Execution cancelled", "run_id": "run_c"}):
        result = b.cmd_copilot_verify(
            {"skill_id": skill_id, "step_key": "h1#1", "proposal_id": "p3", "confirmed": True}, "rid1",
        )

    assert result["status"] == "cancelled"
    verifications = [e for e in read_edits(skill_id) if e.get("command") == "copilot_verify"]
    assert verifications == []
