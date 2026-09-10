"""End-to-end Human Review Copilot command handlers (BUILD-26 stages b-d), exercised through the
real Backend.dispatch() so the edit-log attribution (backend.py) is covered along with the
handlers themselves.
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
    spec = importlib.util.spec_from_file_location("cbackend_copilot", os.path.join(_PY_DIR, "backend.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: list[dict] = []
    from handlers import protocol as _protocol

    mod._write = lambda obj: out.append(obj)
    _protocol._write = lambda obj: out.append(obj)
    return mod.Backend(), out


def _last(out):
    return out[-1]


def _write_click_skill(skill_id: str, *, value: str = "old value") -> None:
    from conxa_core.storage.json_store import write_skill

    write_skill(
        skill_id,
        {
            "meta": {"id": skill_id, "title": "Copilot test skill", "version": 1},
            "skills": [{"id": skill_id, "steps": [
                {
                    "action": {"action": "click"},
                    "url": "https://x",
                    "identity_bundle": {"stable_hash": "h1"},
                    "intent": "click_submit",
                    "value": value,
                    "target": {"primary_selector": "#submit", "fallback_selectors": []},
                },
            ]}],
        },
    )


def test_copilot_turn_gates_proposals_before_returning_them(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    _write_click_skill("skill_turn_1")

    with patch(
        "conxa_compile.llm.copilot.copilot_turn",
        return_value={
            "reply": "Step 1 failed because the button moved.",
            "proposals": [
                {"step_key": "h1#1", "field": "value", "patch": "new value", "why": "matches the page"},
                {"step_key": "h1#1", "field": "target", "patch": "#never"},  # must be dropped
                {"step_key": "nope#1", "field": "value", "patch": "x"},      # must be dropped
            ],
        },
    ):
        b.dispatch({"id": "1", "type": "copilot_turn", "payload": {"skill_id": "skill_turn_1", "message": "why did step 1 fail?"}})

    result = _last(out)
    assert result["type"] == "result"
    assert result["result"]["reply"] == "Step 1 failed because the button moved."
    proposals = result["result"]["proposals"]
    assert len(proposals) == 1
    assert proposals[0]["step_key"] == "h1#1"
    assert proposals[0]["patch"] == {"value": "new value"}


def test_copilot_turn_requires_a_message(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    b, out = backend
    _write_click_skill("skill_turn_2")
    b.dispatch({"id": "1", "type": "copilot_turn", "payload": {"skill_id": "skill_turn_2", "message": "  "}})
    assert _last(out)["type"] == "error"
    assert _last(out)["code"] == "invalid_input"


def test_accept_copilot_proposal_patches_the_step_and_logs_source_copilot(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import read_skill
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    _write_click_skill("skill_accept_1", value="old value")

    b.dispatch({
        "id": "1", "type": "accept_copilot_proposal",
        "payload": {
            "skill_id": "skill_accept_1", "step_key": "h1#1",
            "patch": {"value": "new value"}, "proposal_id": "p1",
        },
    })

    assert _last(out)["type"] == "result"
    updated = read_skill("skill_accept_1")
    assert updated["skills"][0]["steps"][0]["value"] == "new value"

    edits = read_edits("skill_accept_1")
    value_edits = [e for e in edits if e["field"] == "value"]
    assert len(value_edits) == 1
    assert value_edits[0]["source"] == "copilot"
    assert value_edits[0]["proposal_id"] == "p1"
    assert value_edits[0]["decision"] == "accepted"
    assert value_edits[0]["command"] == "accept_copilot_proposal"


def test_accept_copilot_proposal_refuses_a_stale_step_key(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    _write_click_skill("skill_accept_2")

    b.dispatch({
        "id": "1", "type": "accept_copilot_proposal",
        "payload": {"skill_id": "skill_accept_2", "step_key": "does-not-exist#1", "patch": {"value": "x"}},
    })
    assert _last(out)["type"] == "error"
    assert _last(out)["code"] == "proposal_stale"


def test_reject_copilot_proposal_changes_no_document_but_logs_the_rejection(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import read_skill
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    _write_click_skill("skill_reject_1", value="untouched")

    before = read_skill("skill_reject_1")
    b.dispatch({
        "id": "1", "type": "reject_copilot_proposal",
        "payload": {
            "skill_id": "skill_reject_1", "step_key": "h1#1", "proposal_id": "p2",
            "field": "value", "why": "the value looked wrong",
        },
    })
    assert _last(out)["type"] == "result"
    after = read_skill("skill_reject_1")
    assert after == before, "a rejection must never change the compiled skill (byte-identical guarantee)"

    edits = read_edits("skill_reject_1")
    assert len(edits) == 1
    assert edits[0]["decision"] == "rejected"
    assert edits[0]["source"] == "copilot"
    assert edits[0]["proposal_id"] == "p2"
