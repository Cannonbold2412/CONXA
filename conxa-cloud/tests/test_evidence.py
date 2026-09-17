"""Evidence bundle assembler (BUILD-26 stage a) — merges runtime failure evidence with the
compiled skill document, keyed on step_key throughout. Covers the stale-compile-report
degradation (the trap `editor/workflow_mutations.py::_invalidate_compile_report` sets up) and
the runtime evidence file's absence/presence.
"""

from __future__ import annotations

import json

from conxa_compile.editor.evidence import EvidenceError, build_evidence_bundle


def _doc(steps: list[dict], *, compile_report: dict | None = None) -> dict:
    doc = {"meta": {"version": 1}, "skills": [{"steps": steps}]}
    if compile_report is not None:
        doc["compile_report"] = compile_report
    return doc


def _click(stable_hash: str, **overrides) -> dict:
    step = {
        "action": {"action": "click"},
        "url": "https://x",
        "identity_bundle": {"stable_hash": stable_hash},
        "intent": "click_submit",
    }
    step.update(overrides)
    return step


def test_missing_skill_raises_evidence_error(tmp_path, monkeypatch):
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    try:
        build_evidence_bundle("does_not_exist")
        assert False, "expected EvidenceError"
    except EvidenceError as exc:
        assert exc.code == "skill_not_found"


def test_bundle_merges_steps_keyed_on_step_key_and_degrades_stale_report(tmp_path, monkeypatch):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)

    skill_id = "skill_evidence_1"
    doc = _doc(
        [_click("h1"), _click("h2")],
        compile_report={"status": "stale", "steps": []},  # the _invalidate_compile_report trap
    )
    write_skill(skill_id, doc)

    bundle = build_evidence_bundle(skill_id)
    assert bundle["skill_id"] == skill_id
    assert len(bundle["steps"]) == 2
    assert {s["step_key"] for s in bundle["steps"]} == {"h1#1", "h2#1"}
    for step_entry in bundle["steps"]:
        assert step_entry["compile_report"]["available"] is False
        assert "edited since last compile" in step_entry["compile_report"]["reason"]


def test_bundle_reports_fresh_compile_report_confidence(tmp_path, monkeypatch):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    skill_id = "skill_evidence_2"
    doc = _doc(
        [_click("h1"), _click("h2")],
        compile_report={
            "status": "ok",
            "steps": [
                {"confidence": 0.95, "warnings": [], "source": "heuristic", "reasoning": ""},
                {"confidence": 0.4, "warnings": [{"code": "low_selector_confidence"}], "source": "llm", "reasoning": "r"},
            ],
        },
    )
    write_skill(skill_id, doc)

    bundle = build_evidence_bundle(skill_id)
    by_key = {s["step_key"]: s for s in bundle["steps"]}
    assert by_key["h1#1"]["compile_report"] == {
        "available": True, "confidence": 0.95, "warnings": [], "source": "heuristic", "reasoning": "",
    }
    assert by_key["h2#1"]["compile_report"]["confidence"] == 0.4


def test_bundle_reads_runtime_evidence_and_resolves_failed_step_key(tmp_path, monkeypatch):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_3"
    doc = _doc([_click("h1"), _click("h2")], compile_report={"status": "ok", "steps": [
        {"confidence": 0.9, "warnings": []}, {"confidence": 0.9, "warnings": []},
    ]})
    write_skill(skill_id, doc)

    run_id = "run_abc123"
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(json.dumps({
        "run_id": run_id, "slug": skill_id, "failed_at": 1, "message": "element not found",
        "inventory": [{"tag": "button"}], "recovery_trail": [{"event": "layer1_ladder"}],
    }), encoding="utf-8")
    (evidence_dir / "failure.jpg").write_bytes(b"jpeg-bytes")

    bundle = build_evidence_bundle(skill_id, run_id=run_id)
    assert bundle["run_id"] == run_id
    assert bundle["failed_step_key"] == "h2#1"  # failed_at=1 → second step
    assert bundle["runtime_evidence"]["message"] == "element not found"
    assert bundle["runtime_evidence"]["failure_screenshot_path"].endswith("failure.jpg")
    assert bundle["runtime_evidence"]["pre_step_screenshot_path"] is None


def test_failed_step_key_nulled_when_a_step_was_inserted_before_the_failing_index(tmp_path, monkeypatch):
    """BUILD-31: failed_at is a raw index frozen at run time. Inserting a step before it shifts
    every later position — the old, purely-positional resolution silently returned the WRONG
    step's key instead of nulling out. failed_stable_hash (the failing step's own identity_bundle
    hash at write time) lets this be caught instead of trusted blindly."""
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_mismatch"
    # At run time: [h1, h2] — h2 (index 1) is the one that actually failed.
    # Since then, a new step was inserted at the front: [hNEW, h1, h2] — index 1 is now h1.
    doc = _doc([_click("hNEW"), _click("h1"), _click("h2")], compile_report={"status": "ok", "steps": [
        {"confidence": 0.9, "warnings": []}, {"confidence": 0.9, "warnings": []}, {"confidence": 0.9, "warnings": []},
    ]})
    write_skill(skill_id, doc)

    run_id = "run_mismatch1"
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(json.dumps({
        "run_id": run_id, "slug": skill_id, "failed_at": 1, "failed_stable_hash": "h2",
        "message": "element not found",
    }), encoding="utf-8")

    bundle = build_evidence_bundle(skill_id, run_id=run_id)
    assert bundle["failed_step_key"] is None
    assert bundle["runtime_evidence_absent"] is not None
    assert "no longer matches its recorded position" in bundle["runtime_evidence_absent"]


def test_failed_step_key_still_resolves_when_stable_hash_agrees(tmp_path, monkeypatch):
    """The positive case for the same mechanism — no edit happened, the hash matches, resolution
    is unchanged (and slightly more confident than a bare index lookup)."""
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_match"
    doc = _doc([_click("h1"), _click("h2")], compile_report={"status": "ok", "steps": [
        {"confidence": 0.9, "warnings": []}, {"confidence": 0.9, "warnings": []},
    ]})
    write_skill(skill_id, doc)

    run_id = "run_match1"
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(json.dumps({
        "run_id": run_id, "slug": skill_id, "failed_at": 1, "failed_stable_hash": "h2",
    }), encoding="utf-8")

    bundle = build_evidence_bundle(skill_id, run_id=run_id)
    assert bundle["failed_step_key"] == "h2#1"
    assert bundle["runtime_evidence_absent"] is None


def test_bundle_falls_back_to_workflow_last_test_run_id_when_run_id_omitted(tmp_path, monkeypatch):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill
    from conxa_core.storage.workflow_store import save_workflow
    from conxa_core.models.workflow import Workflow

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_4"
    write_skill(skill_id, _doc([_click("h1")]))
    save_workflow(Workflow(
        id="wf1", slug="wf1", name="WF", target_url="https://x",
        skill_id=skill_id, last_test_run_id="run_from_workflow",
    ))

    run_id = "run_from_workflow"
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "evidence.json").write_text(json.dumps({"run_id": run_id, "failed_at": 0}), encoding="utf-8")

    bundle = build_evidence_bundle(skill_id)  # no run_id passed
    assert bundle["run_id"] == "run_from_workflow"
    assert bundle["failed_step_key"] == "h1#1"


def test_overlays_jsonl_read_even_when_evidence_json_is_missing(tmp_path, monkeypatch):
    """BUILD-26 stage f: overlays.jsonl is written on a PASSING run — evidence.json (failure-only)
    must never gate it out."""
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_overlay"
    write_skill(skill_id, _doc([_click("h1"), _click("h2")]))

    run_id = "run_overlay1"
    evidence_dir = tmp_path / "studio_home" / "sandbox" / "data" / "runs" / run_id / "_evidence"
    evidence_dir.mkdir(parents=True)
    # No evidence.json written — this run passed.
    (evidence_dir / "overlays.jsonl").write_text(
        json.dumps({
            "overlay_id": "ov1", "run_id": run_id, "slug": skill_id, "step_index": 1,
            "dismissed": True, "container": {"tag": "div", "signal": "#cookie-banner"},
            "controls": [{"tag": "button", "name": "Accept", "role": "button"}],
        }) + "\n",
        encoding="utf-8",
    )

    bundle = build_evidence_bundle(skill_id, run_id=run_id)
    overlays = bundle["runtime_evidence"]["observed_overlays"]
    assert len(overlays) == 1
    assert overlays[0]["overlay_id"] == "ov1"
    assert overlays[0]["step_key"] == "h2#1"  # step_index=1 resolves against this doc's steps


def test_no_run_id_and_no_workflow_gives_compile_side_only_bundle(tmp_path, monkeypatch):
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    skill_id = "skill_evidence_5"
    write_skill(skill_id, _doc([_click("h1")]))

    bundle = build_evidence_bundle(skill_id)
    assert bundle["run_id"] is None
    assert bundle["failed_step_key"] is None
    assert bundle["runtime_evidence"] == {}
    assert bundle["runtime_evidence_absent"] == "no test run recorded for this skill"
    assert bundle["last_test"] is None
    assert len(bundle["steps"]) == 1


def test_last_test_error_survives_when_run_evidence_left_none_on_disk(tmp_path, monkeypatch):
    """The exact bug this guards against: a Studio test run failed (last_test_error is set on
    the Workflow record) but the app layer that ran it predates BUILD-26's evidence.json writer,
    so nothing landed under runs/{run_id}/_evidence/. The copilot must be told evidence is
    missing AND still get the persisted failure text — not a bundle indistinguishable from a
    passing run."""
    from conxa_core.config import settings
    from conxa_core.storage.json_store import write_skill
    from conxa_core.storage.workflow_store import save_workflow
    from conxa_core.models.workflow import Workflow

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setenv("CONXA_STUDIO_HOME", str(tmp_path / "studio_home"))

    skill_id = "skill_evidence_6"
    write_skill(skill_id, _doc([_click("h1"), _click("h2")]))
    run_id = "run_no_evidence_written"
    save_workflow(Workflow(
        id="wf2", slug="wf2", name="WF2", target_url="https://x",
        skill_id=skill_id, last_test_run_id=run_id,
        last_test_status="failed", last_test_error="Execution failed at step 2: boom",
        last_test_at=123.0,
    ))
    # Deliberately no runs/{run_id}/_evidence/ on disk at all.

    bundle = build_evidence_bundle(skill_id)  # no run_id passed — falls back to the workflow's
    assert bundle["run_id"] == run_id
    assert bundle["failed_step_key"] is None
    assert bundle["runtime_evidence"] == {}
    assert bundle["runtime_evidence_absent"] is not None
    assert run_id in bundle["runtime_evidence_absent"]
    assert bundle["last_test"] == {
        "status": "failed", "error": "Execution failed at step 2: boom", "at": 123.0,
    }
