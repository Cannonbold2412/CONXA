"""Evidence bundle assembler for the Human Review Copilot (BUILD-26 stage a).

Merges everything the copilot's diagnosis call may look at, from sources that already have a
reader elsewhere in the pipeline:

  - runtime failure evidence written under runs/{run_id}/_evidence/ by the runtime's
    failure_response.js on a Studio test failure (evidence.json + failure.jpg/pre_step.jpg)
  - the compiled skill document (identity_bundle, compiled_selectors, validation.assertions,
    target, intent, semantic_description, phase, consequence) — conxa_core.storage.json_store
  - compile_report (per-step confidence, warnings, second_opinion, archived_steps)
  - the recorded event's post_condition.classified_effect / state_change.dom_diff, which live on
    the RECORDING, not on the compiled SkillStep — conxa_core.storage.session_events, correlated
    via editor/retarget.py::find_source_event (the same lookup the 1-click-fix path uses)
  - deterministic step prose — editor/describe.py::describe_step
  - prior reviewer edits on this step — editor/edit_log.py::read_edits

Everything is keyed on step_key (compiler/step_key.py), never step_index — an insert/delete/
reorder between when a failure happened and when the copilot is asked about it must not
misattribute evidence to the wrong step.

Returns a size-bounded dict: this goes straight into a paid LLM payload (llm/copilot.py).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from conxa_core.storage.json_store import read_skill
from conxa_core.storage.workflow_store import list_workflows

from conxa_compile.compiler.step_key import step_keys
from conxa_compile.conxa_runtime import resolve_test_sandbox_dir
from conxa_compile.editor.describe import describe_step
from conxa_compile.editor.edit_log import read_edits
from conxa_compile.editor.retarget import find_source_event

# Caps applied before anything reaches the LLM payload — the runtime evidence file and the
# recovery log are both effectively unbounded.
_INVENTORY_CAP = 40
_RECOVERY_TRAIL_CAP = 60
_EDIT_HISTORY_CAP = 20
_OVERLAY_CAP = 20


class EvidenceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _steps_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    skills = doc.get("skills") if isinstance(doc, dict) else None
    block0 = skills[0] if isinstance(skills, list) and skills and isinstance(skills[0], dict) else {}
    steps = block0.get("steps")
    return steps if isinstance(steps, list) else []


def find_workflow_for_skill(skill_id: str) -> Any | None:
    """Public (BUILD-26 stage e): cmd_copilot_verify needs the same lookup this module already
    does for the last_test_run_id fallback, below."""
    for wf in list_workflows():
        if wf.skill_id == skill_id:
            return wf
    return None


def _read_failure_evidence(evidence_dir: Path) -> dict[str, Any]:
    """The runtime's failure.json (failure_response.js::_writeStudioEvidence) — written only when
    a Studio test ultimately fails. Missing/unreadable degrades to {}."""
    evidence_path = evidence_dir / "evidence.json"
    if not evidence_path.is_file():
        return {}
    try:
        data = json.loads(evidence_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    if isinstance(data.get("inventory"), list):
        data["inventory"] = data["inventory"][:_INVENTORY_CAP]
    if isinstance(data.get("recovery_trail"), list):
        data["recovery_trail"] = data["recovery_trail"][-_RECOVERY_TRAIL_CAP:]
    failure_jpg = evidence_dir / "failure.jpg"
    pre_step_jpg = evidence_dir / "pre_step.jpg"
    data["failure_screenshot_path"] = str(failure_jpg) if failure_jpg.is_file() else None
    data["pre_step_screenshot_path"] = str(pre_step_jpg) if pre_step_jpg.is_file() else None
    return data


def _read_observed_overlays(evidence_dir: Path) -> list[dict[str, Any]]:
    """BUILD-26 stage f: runtime/app/overlay_capture.js's overlays.jsonl — written by
    cascade.js's dismiss-overlay remedy on ANY run that hit an intercepted target, including one
    that recovered and passed. `overlay_id` is what a copilot proposal references; never invented
    here, only read back. Missing/unreadable degrades to []."""
    overlays_path = evidence_dir / "overlays.jsonl"
    if not overlays_path.is_file():
        return []
    out: list[dict[str, Any]] = []
    try:
        for line in overlays_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and rec.get("overlay_id"):
                out.append(rec)
    except OSError:
        return []
    return out[-_OVERLAY_CAP:]


def _read_runtime_evidence(run_id: str | None) -> dict[str, Any]:
    """Read runs/{run_id}/_evidence/ from the Studio's own test sandbox — sandbox/data/ is the
    CONXA_DATA_DIR the runtime is given for every Test Skill run (conxa_runtime.ensure_test_sandbox).
    Missing/unreadable degrades to {}, never an error: the compile-side evidence below still
    stands on its own, and a run older than CONXA_RUN_RETENTION_DAYS is swept by the runtime.

    evidence.json and overlays.jsonl are read INDEPENDENTLY (BUILD-26 stage f) — evidence.json is
    failure-only, overlays.jsonl is written on a passing run too, so a missing evidence.json must
    not also hide a passing run's overlay captures."""
    if not run_id:
        return {}
    evidence_dir = resolve_test_sandbox_dir() / "data" / "runs" / run_id / "_evidence"
    data = _read_failure_evidence(evidence_dir)
    overlays = _read_observed_overlays(evidence_dir)
    if not data and not overlays:
        return {}
    data.setdefault("failure_screenshot_path", None)
    data.setdefault("pre_step_screenshot_path", None)
    data["observed_overlays"] = overlays
    return data


def _recorded_event_evidence(step: dict[str, Any], doc: dict[str, Any]) -> dict[str, Any]:
    """post_condition.classified_effect / state_change.dom_diff for this step's original
    recorded action — absent for a manually-inserted step (no snapshot_ref) or a re-recorded
    session no longer on disk, which is an ordinary state, not a failure."""
    event = find_source_event(step, doc)
    if not event:
        return {}
    return {
        "post_condition": event.get("post_condition"),
        "state_change": (event.get("state_change") or {}).get("dom_diff"),
    }


def _compile_report_for_step(compile_report: dict[str, Any], step_index: int, steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Per-step confidence/warnings — absent whenever compile_report is stale (any insert/
    delete/reorder since the last compile empties `steps`, see editor/workflow_mutations.py::
    _invalidate_compile_report) or was rebuilt with a different step count than what's live now.
    Degrading explicitly here means the copilot says "confidence unavailable" instead of a
    misleading 0%, which is what a bare index lookup into a mismatched report would produce."""
    report_steps = compile_report.get("steps")
    if compile_report.get("status") == "stale" or not isinstance(report_steps, list) or len(report_steps) != len(steps):
        return {"available": False, "reason": "workflow edited since last compile"}
    if step_index < 0 or step_index >= len(report_steps):
        return {"available": False, "reason": "step index out of range"}
    entry = report_steps[step_index]
    return {
        "available": True,
        "confidence": entry.get("confidence"),
        "warnings": entry.get("warnings"),
        "source": entry.get("source"),
        "reasoning": entry.get("reasoning"),
    }


def build_evidence_bundle(skill_id: str, *, run_id: str | None = None) -> dict[str, Any]:
    """Assemble the copilot's evidence bundle for one skill's failing step.

    `run_id` is optional — omitted, the bundle is compile-side only (still useful for the
    non-failure copilot cases: "give me a better assertion", "why is this step here"). When
    omitted, falls back to the owning Workflow's `last_test_run_id` (persisted by
    handlers/workflows.py::cmd_test_workflow, stage a2) so the copilot can still discuss the
    most recent failure without the caller having to know its run id.
    """
    doc = read_skill(skill_id)
    if doc is None:
        raise EvidenceError("skill_not_found", f"No skill {skill_id}")

    steps = _steps_of(doc)
    keys = step_keys(steps)

    workflow = find_workflow_for_skill(skill_id)
    if run_id is None and workflow is not None:
        run_id = workflow.last_test_run_id

    runtime_evidence = _read_runtime_evidence(run_id)
    failed_at = runtime_evidence.get("failed_at")
    failed_step_key = keys[failed_at] if isinstance(failed_at, int) and 0 <= failed_at < len(keys) else None

    # BUILD-26 stage f: the runtime only knows step_index (it has no concept of the compiler's
    # step_key), so resolve it here the same way failed_step_key is resolved above — this is
    # what lets a copilot proposal address an overlay by the SAME step_key gate_proposals already
    # re-resolves everything else against.
    for overlay in runtime_evidence.get("observed_overlays") or []:
        idx = overlay.get("step_index")
        overlay["step_key"] = keys[idx] if isinstance(idx, int) and 0 <= idx < len(keys) else None

    compile_report = doc.get("compile_report") if isinstance(doc.get("compile_report"), dict) else {}

    steps_bundle: list[dict[str, Any]] = []
    for i, (step, key) in enumerate(zip(steps, keys)):
        entry: dict[str, Any] = {
            "step_key": key,
            "step_index": i,
            "description": describe_step(step, i),
            "intent": step.get("intent"),
            "semantic_description": step.get("semantic_description"),
            "phase": step.get("phase"),
            "consequence": step.get("consequence"),
            "target": step.get("target"),
            "identity_bundle": step.get("identity_bundle"),
            "compiled_selectors": step.get("compiled_selectors"),
            "validation": step.get("validation"),
            "compile_report": _compile_report_for_step(compile_report, i, steps),
            "recorded_event": _recorded_event_evidence(step, doc),
            "edit_history": [e for e in read_edits(skill_id) if e.get("step_key") == key][-_EDIT_HISTORY_CAP:],
        }
        # Only the failing step (when known) and steps with prior edits carry the heavy fields —
        # a 24-step workflow's full identity_bundle set for every step would dwarf the run
        # evidence itself. Everything else stays as compact triage-list rows.
        if key != failed_step_key and not entry["edit_history"]:
            for heavy in ("target", "identity_bundle", "compiled_selectors"):
                entry[heavy] = None
        steps_bundle.append(entry)

    return {
        "skill_id": skill_id,
        "run_id": run_id,
        "failed_step_key": failed_step_key,
        "compile_status": compile_report.get("status"),
        "second_opinion": compile_report.get("second_opinion"),
        "archived_steps": compile_report.get("archived_steps"),
        "runtime_evidence": runtime_evidence,
        "steps": steps_bundle,
    }


if __name__ == "__main__":
    # ponytail: smallest runnable self-check for the logic that isn't a straight field copy —
    # the stale/mismatched compile_report degradation and the step_key/index correlation.
    fresh_report = {"status": "ok", "steps": [{"confidence": 0.9, "warnings": []}, {"confidence": 0.4, "warnings": [{"code": "low_selector_confidence"}]}]}
    two_steps = [{"action": {"action": "click"}}, {"action": {"action": "click"}}]
    assert _compile_report_for_step(fresh_report, 1, two_steps) == {
        "available": True, "confidence": 0.4, "warnings": [{"code": "low_selector_confidence"}], "source": None, "reasoning": None,
    }

    stale_report = {"status": "stale", "steps": []}
    degraded = _compile_report_for_step(stale_report, 0, two_steps)
    assert degraded == {"available": False, "reason": "workflow edited since last compile"}

    mismatched_report = {"status": "ok", "steps": [{"confidence": 0.9, "warnings": []}]}  # 1 entry, 2 live steps
    assert _compile_report_for_step(mismatched_report, 1, two_steps)["available"] is False

    print("ok")
