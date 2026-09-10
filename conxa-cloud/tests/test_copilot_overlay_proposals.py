"""Overlay-observed branch-insertion proposals (BUILD-26 stage f) — the second proposal kind,
gated by `copilot_proposals.py::gate_overlay_proposals` and accepted through
`cmd_accept_copilot_proposal`'s `insert_overlay_branch` branch. Exercised through the real
`Backend.dispatch()` so undo/edit-log attribution is covered along with the handlers.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from unittest.mock import patch

import pytest

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))


@pytest.fixture()
def backend():
    spec = importlib.util.spec_from_file_location("cbackend_copilot_overlay", os.path.join(_PY_DIR, "backend.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: list[dict] = []
    from handlers import protocol as _protocol

    mod._write = lambda obj: out.append(obj)
    _protocol._write = lambda obj: out.append(obj)
    return mod.Backend(), out


def _last(out):
    return out[-1]


def _write_click_skill(skill_id: str) -> None:
    from conxa_core.storage.json_store import write_skill

    write_skill(
        skill_id,
        {
            "meta": {"id": skill_id, "title": "Overlay test skill", "version": 1},
            "skills": [{"id": skill_id, "steps": [
                {
                    "action": {"action": "click"},
                    "url": "https://x",
                    "identity_bundle": {"stable_hash": "h1"},
                    "intent": "click_submit",
                    "target": {"primary_selector": "#submit", "fallback_selectors": []},
                },
            ]}],
        },
    )


def _stage_overlay_evidence(tmp_path, monkeypatch, run_id: str, skill_id: str) -> None:
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "overlays.jsonl").write_text(
        json.dumps({
            "overlay_id": "ov1", "run_id": run_id, "slug": skill_id, "step_index": 0,
            "dismissed": True,
            "container": {"tag": "div", "role": "dialog", "signal": "#cookie-banner"},
            "controls": [{
                "tag": "button", "role": "button", "name": "Accept", "text": "Accept",
                "testid": "accept-btn", "id": "accept-btn", "anchorNeighbors": [],
            }],
        }) + "\n",
        encoding="utf-8",
    )


def test_copilot_turn_surfaces_an_overlay_insertion_proposal(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    skill_id = "skill_overlay_turn_1"
    _write_click_skill(skill_id)
    _stage_overlay_evidence(tmp_path, monkeypatch, "run_ov1", skill_id)

    with patch(
        "conxa_compile.llm.copilot.copilot_turn",
        return_value={
            "reply": "I saw a cookie banner on the last run — want me to add a condition for it?",
            "proposals": [
                {"overlay_id": "ov1", "control_index": 0, "primitive": "try_dismiss", "why": "seen on run_ov1"},
                {"overlay_id": "does-not-exist", "control_index": 0, "primitive": "try_dismiss", "why": "must be dropped"},
            ],
        },
    ):
        b.dispatch({"id": "1", "type": "copilot_turn", "payload": {"skill_id": skill_id, "message": "add a condition for that popup", "run_id": "run_ov1"}})

    result = _last(out)
    assert result["type"] == "result"
    proposals = result["result"]["proposals"]
    assert len(proposals) == 1
    assert proposals[0]["command"] == "insert_overlay_branch"
    assert proposals[0]["primitive"] == "try_dismiss"
    assert proposals[0]["overlay_id"] == "ov1"
    assert "branch" in proposals[0]["patch"]
    assert proposals[0]["patch"]["branch"]["candidates"], "candidates must be non-empty selector strings"


def test_accept_overlay_branch_proposal_inserts_a_try_dismiss_step(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import read_skill
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    skill_id = "skill_overlay_accept_1"
    _write_click_skill(skill_id)

    b.dispatch({
        "id": "1", "type": "accept_copilot_proposal",
        "payload": {
            "skill_id": skill_id, "command": "insert_overlay_branch", "primitive": "try_dismiss",
            "overlay_id": "ov1", "after_step_key": None, "proposal_id": "p1",
            "patch": {
                "intent": "try_dismiss_interstitial",
                "branch": {"candidates": ["internal:testid=[data-testid=\"accept-btn\"]", "#cookie-banner"], "timeout_ms": 3000, "fallback_escape": True},
                "recovery": {"intent": "try_dismiss_interstitial", "final_intent": "try_dismiss_interstitial",
                             "anchors": [], "strategies": [], "confidence_threshold": 0.85,
                             "max_attempts": 0, "require_diverse_attempts": False},
            },
        },
    })

    assert _last(out)["type"] == "result", _last(out)
    updated = read_skill(skill_id)
    steps = updated["skills"][0]["steps"]
    assert len(steps) == 2
    assert steps[1]["action"]["action"] == "try_dismiss"
    assert steps[1]["branch"]["candidates"]

    edits = read_edits(skill_id)
    copilot_edits = [e for e in edits if e.get("source") == "copilot" and e.get("proposal_id") == "p1"]
    assert len(copilot_edits) >= 1, edits


def test_accept_overlay_branch_proposal_inserts_if_present_with_nested_click(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import read_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    skill_id = "skill_overlay_accept_2"
    _write_click_skill(skill_id)

    b.dispatch({
        "id": "1", "type": "accept_copilot_proposal",
        "payload": {
            "skill_id": skill_id, "command": "insert_overlay_branch", "primitive": "if_present",
            "overlay_id": "ov1", "after_step_key": None, "proposal_id": "p2",
            "patch": {
                "intent": "dismiss_if_present",
                "target": {"primary_selector": "#cookie-banner", "fallback_selectors": []},
            },
            "nested_step": {
                "target": {"primary_selector": "internal:testid=[data-testid=\"accept-btn\"]", "fallback_selectors": []},
                "identity_bundle": {
                    "signals": [{"engine": "testid", "selector": "internal:testid=[data-testid=\"accept-btn\"]",
                                 "durability": 0.99, "orthogonality_class": "test-contract",
                                 "unique_at_compile": False, "source": "runtime"}],
                    "fingerprint": {"role": "button", "tag": "button", "data_testid": "accept-btn", "name": "Accept"},
                    "stable_hash": "abc123",
                },
                "intent": "click_target",
                "semantic_description": "Dismiss the observed overlay (Accept)",
            },
        },
    })

    assert _last(out)["type"] == "result", _last(out)
    updated = read_skill(skill_id)
    steps = updated["skills"][0]["steps"]
    assert len(steps) == 2
    assert steps[1]["action"]["action"] == "if_present"
    assert steps[1]["target"]["primary_selector"] == "#cookie-banner"
    nested = steps[1]["branch"]["steps"]
    assert len(nested) == 1
    assert nested[0]["target"]["primary_selector"].startswith("internal:testid")
    assert nested[0]["identity_bundle"]["signals"][0]["engine"] == "testid"


def test_accept_overlay_branch_proposal_refuses_a_stale_after_step_key(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    skill_id = "skill_overlay_stale"
    _write_click_skill(skill_id)

    b.dispatch({
        "id": "1", "type": "accept_copilot_proposal",
        "payload": {
            "skill_id": skill_id, "command": "insert_overlay_branch", "primitive": "try_dismiss",
            "overlay_id": "ov1", "after_step_key": "does-not-exist#1",
            "patch": {"intent": "try_dismiss_interstitial", "branch": {"candidates": ["#x"], "timeout_ms": 3000}},
        },
    })
    assert _last(out)["type"] == "error"
    assert _last(out)["code"] == "proposal_stale"


def test_if_present_without_a_container_signal_downgrades_to_try_dismiss(monkeypatch, tmp_path):
    """The `if_present` silent-drop trap: `_saved_branch_step` returns None (the step vanishes
    from execution.json) when `target.primary_selector` is empty. gate_overlay_proposals must
    never emit an if_present proposal with no container signal — it downgrades instead."""
    from conxa_core.config import settings
    from conxa_compile.editor.copilot_proposals import gate_overlay_proposals

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    doc = {"meta": {"version": 1}, "skills": [{"steps": [
        {"action": {"action": "click"}, "url": "https://x", "identity_bundle": {"stable_hash": "h1"},
         "intent": "click_submit", "target": {"primary_selector": "#a", "fallback_selectors": []}},
    ]}]}
    overlays = [{
        "overlay_id": "ov2", "step_index": 0, "container": {"tag": "div"},  # no signal
        "controls": [{"tag": "button", "role": "button", "name": "Accept", "text": "Accept", "testid": "accept-btn", "id": "accept-btn"}],
    }]
    raw = [{"overlay_id": "ov2", "control_index": 0, "primitive": "if_present", "why": "x"}]
    out = gate_overlay_proposals(doc, overlays, raw)
    assert len(out) == 1
    assert out[0]["primitive"] == "try_dismiss"


def test_reject_overlay_branch_proposal_logs_against_overlay_id(backend, monkeypatch, tmp_path):
    from conxa_core.config import settings
    from conxa_compile.editor.edit_log import read_edits

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    b, out = backend
    skill_id = "skill_overlay_reject_1"
    _write_click_skill(skill_id)

    b.dispatch({
        "id": "1", "type": "reject_copilot_proposal",
        "payload": {"skill_id": skill_id, "overlay_id": "ov1", "proposal_id": "p3", "command": "insert_overlay_branch", "why": "not needed"},
    })
    assert _last(out)["type"] == "result"
    edits = read_edits(skill_id)
    assert len(edits) == 1
    assert edits[0]["decision"] == "rejected"
    assert edits[0]["step_key"] == "overlay:ov1"
