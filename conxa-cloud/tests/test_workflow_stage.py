"""Tests for handlers/status.py::derive_workflow_stage — the single status
derivation function replacing the three previously-inconsistent vocabularies."""

from __future__ import annotations

import pytest

from conxa_core.models.plugin import PluginWorkflow
from handlers.status import derive_workflow_stage


def _wf(**overrides) -> PluginWorkflow:
    base = dict(
        id="wf_1",
        slug="wf-1",
        name="Test workflow",
        session_id="sess_1",
        recorded_at=0.0,
    )
    base.update(overrides)
    return PluginWorkflow(**base)


@pytest.mark.parametrize(
    "overrides, expected",
    [
        # Freshly recorded, nothing compiled yet.
        (dict(status="recorded"), "ready_to_compile"),
        # Compiled but not yet signed off (and no legacy edited_at shim).
        (dict(status="compiled", skill_id="skill_1"), "needs_review"),
        # Signed off via the new field, no test run yet.
        (dict(status="compiled", skill_id="skill_1", signed_off=True), "needs_test"),
        # Legacy sign-off shim: edited_at set but signed_off never backfilled.
        (dict(status="compiled", skill_id="skill_1", edited_at=123.0), "needs_test"),
        # Signed off, tested, but the test failed.
        (
            dict(status="compiled", skill_id="skill_1", signed_off=True, last_test_status="failed"),
            "needs_test",
        ),
        # Signed off and passed — fully ready.
        (
            dict(status="compiled", skill_id="skill_1", signed_off=True, last_test_status="passed"),
            "ready",
        ),
        # Explicit error status always wins.
        (dict(status="error", skill_id="skill_1", signed_off=True, last_test_status="passed"), "error"),
    ],
)
def test_derive_workflow_stage_field_combinations(overrides, expected):
    assert derive_workflow_stage(_wf(**overrides)) == expected


def test_active_job_queued_overrides_field_state():
    wf = _wf(status="recorded")
    assert derive_workflow_stage(wf, active_job={"status": "queued"}) == "queued"


def test_active_job_running_overrides_field_state():
    wf = _wf(status="compiled", skill_id="skill_1", signed_off=True, last_test_status="passed")
    assert derive_workflow_stage(wf, active_job={"status": "running"}) == "compiling"
