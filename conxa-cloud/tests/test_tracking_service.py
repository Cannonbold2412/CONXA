"""Unit tests for app.services.tracking's pure aggregation functions.

Exercises these directly against hand-built ``records`` (the shape
``_visible_run_records`` produces: ``[{"company", "summary", "events"}, ...]``)
rather than through the HTTP routes, since driving full company-discovery /
workspace-visibility plumbing for a route-level test obscures what's actually
being aggregated. See test_tracking_routes.py for the route-level wiring check.
"""

from __future__ import annotations

from app.services.tracking import _assertion_health_by_step, _drift_review_queue


def _record(company: str, workflow_id: str, events: list[dict], *, workflow_ver: str = "1.0.0", run_id: str = "") -> dict:
    return {
        "company": company,
        "summary": {"workflow_id": workflow_id, "workflow_ver": workflow_ver, "run_id": run_id},
        "events": events,
    }


def test_assertion_health_aggregates_pass_rate_per_step():
    records = [
        _record("acme", "checkout", [{"e": "verify_result", "ts": 1000, "si": 2, "ok": True, "n": 1, "advFail": 0}]),
        _record("acme", "checkout", [{"e": "verify_result", "ts": 2000, "si": 2, "ok": False, "n": 2, "advFail": 1}]),
        _record("acme", "checkout", [{"e": "verify_result", "ts": 3000, "si": 2, "ok": False, "n": 1, "advFail": 0}]),
        _record("acme", "checkout", [{"e": "verify_result", "ts": 4000, "si": 2, "ok": True, "n": 1, "advFail": 0}]),
    ]
    rows = _assertion_health_by_step(records)
    assert len(rows) == 1
    row = rows[0]
    assert row["company"] == "acme"
    assert row["workflow"] == "checkout"
    assert row["step_index"] == 2
    assert row["step_label"] == "Step 3"
    assert row["total"] == 4
    assert row["passed"] == 2
    assert row["pass_rate"] == 50.0
    assert row["advisory_failures"] == 1
    assert row["last_seen"] == 4_000_000  # _epoch_ms treats sub-10-billion values as seconds


def test_assertion_health_ignores_non_verify_result_events():
    records = [_record("acme", "checkout", [{"e": "wf_ok", "ts": 1000, "dur": 500, "tot": 1, "rec": 0}])]
    assert _assertion_health_by_step(records) == []


def test_assertion_health_sorts_worst_pass_rate_first():
    records = [
        _record("acme", "checkout", [{"e": "verify_result", "ts": 1000, "si": 0, "ok": True, "n": 1, "advFail": 0}]),
        _record("acme", "checkout", [{"e": "verify_result", "ts": 2000, "si": 1, "ok": False, "n": 1, "advFail": 0}]),
    ]
    rows = _assertion_health_by_step(records)
    assert [r["step_index"] for r in rows] == [1, 0]
    assert rows[0]["pass_rate"] == 0.0
    assert rows[1]["pass_rate"] == 100.0


def test_assertion_health_keeps_steps_separate_across_workflows():
    records = [
        _record("acme", "checkout", [{"e": "verify_result", "ts": 1000, "si": 0, "ok": True, "n": 1, "advFail": 0}]),
        _record("beta", "signup", [{"e": "verify_result", "ts": 1000, "si": 0, "ok": False, "n": 1, "advFail": 0}]),
    ]
    rows = _assertion_health_by_step(records)
    assert len(rows) == 2
    keys = {(r["company"], r["workflow"]) for r in rows}
    assert keys == {("acme", "checkout"), ("beta", "signup")}


def _repair(step_id: int, *, tier: str = "L2", method: str = "a11y", ts: int = 1000) -> dict:
    return {"e": "repair_event", "step_id": step_id, "tier": tier, "method": method, "ts": ts}


def test_drift_queue_computes_occurrence_rate_against_distinct_runs():
    # Step 4 needed repair in 4 of 5 distinct runs of this workflow version — one run
    # (run-3) never touched the repair path at all (no repair_event emitted for it).
    records = [
        _record("acme", "checkout", [_repair(4)], run_id="run-1"),
        _record("acme", "checkout", [_repair(4)], run_id="run-2"),
        _record("acme", "checkout", [], run_id="run-3"),
        _record("acme", "checkout", [_repair(4)], run_id="run-4"),
        _record("acme", "checkout", [_repair(4)], run_id="run-5"),
    ]
    queue = _drift_review_queue(records)
    assert len(queue) == 1
    entry = queue[0]
    assert entry["step_id"] == 4
    assert entry["run_count"] == 4
    assert entry["total_runs"] == 5
    assert entry["occurrence_rate_pct"] == 80.0


def test_drift_queue_counts_runs_not_raw_events_for_the_rate():
    # A single run escalating through two tiers for the same step emits two repair_events —
    # that must count as one run needing repair, not two, or the rate would exceed 100%.
    records = [
        _record("acme", "checkout", [_repair(2, tier="L1"), _repair(2, tier="L2")], run_id="run-1"),
        _record("acme", "checkout", [], run_id="run-2"),
    ]
    queue = _drift_review_queue(records)
    entry = queue[0]
    assert entry["occurrences"] == 2
    assert entry["run_count"] == 1
    assert entry["total_runs"] == 2
    assert entry["occurrence_rate_pct"] == 50.0


def test_drift_queue_reports_dominant_tier_and_method():
    records = [
        _record("acme", "checkout", [_repair(1, tier="L2", method="a11y")], run_id="run-1"),
        _record("acme", "checkout", [_repair(1, tier="L2", method="a11y")], run_id="run-2"),
        _record("acme", "checkout", [_repair(1, tier="L1", method="re-resolve")], run_id="run-3"),
    ]
    queue = _drift_review_queue(records)
    entry = queue[0]
    assert entry["dominant_tier"] == "L2"
    assert entry["dominant_method"] == "a11y"


def test_drift_queue_sorts_by_occurrence_rate_before_raw_count():
    # Step 1 has more raw occurrences but a lower rate (many runs, few hit it); step 2
    # has fewer occurrences but hits every run of a low-traffic workflow — rate wins.
    records = [
        *[_record("acme", "high-traffic", [_repair(1)], run_id=f"ht-{i}") for i in range(10)],
        *[_record("acme", "high-traffic", [], run_id=f"ht-clean-{i}") for i in range(90)],
        _record("acme", "low-traffic", [_repair(2)], run_id="lt-1"),
        _record("acme", "low-traffic", [_repair(2)], run_id="lt-2"),
    ]
    queue = _drift_review_queue(records)
    assert queue[0]["step_id"] == 2
    assert queue[0]["occurrence_rate_pct"] == 100.0
    assert queue[1]["step_id"] == 1
    assert queue[1]["occurrence_rate_pct"] == 10.0


def test_drift_queue_scopes_total_runs_per_workflow_version_not_globally():
    records = [
        _record("acme", "checkout", [_repair(1)], workflow_ver="1.0.0", run_id="v1-run-1"),
        _record("acme", "checkout", [], workflow_ver="2.0.0", run_id="v2-run-1"),
        _record("acme", "checkout", [], workflow_ver="2.0.0", run_id="v2-run-2"),
        _record("acme", "checkout", [], workflow_ver="2.0.0", run_id="v2-run-3"),
    ]
    queue = _drift_review_queue(records)
    entry = next(e for e in queue if e["workflow_ver"] == "1.0.0")
    # v2.0.0's three unrelated runs must not dilute v1.0.0's own rate.
    assert entry["total_runs"] == 1
    assert entry["occurrence_rate_pct"] == 100.0
