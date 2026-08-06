"""Unit tests for app.services.tracking_analytics' pure aggregation functions.

Same approach as test_tracking_service.py: drive the aggregators directly against
hand-built ``records`` (the shape ``_visible_run_records`` produces) rather than through
HTTP, so what's being asserted is the arithmetic and not the workspace-visibility plumbing.
"""

from __future__ import annotations

import time

from app.services.tracking_analytics import (
    bucket_series,
    failure_codes,
    health_score,
    insights,
    kpi_strip,
    normalize_assumptions,
    range_spec,
    recovery_cascade,
    recovery_tier_totals,
    reliability_heatmap,
    roi,
    step_analytics,
    step_recovery_paths,
    window_records,
    workflow_analytics,
)

_NOW = 1_760_000_000.0  # fixed epoch seconds so bucket/heatmap assertions are stable


def _record(
    company: str = "acme",
    plugin_id: str = "checkout",
    events: list[dict] | None = None,
    *,
    status: str = "ok",
    at: float = _NOW,
    plugin_ver: str = "1.0.0",
    duration_ms: int = 1000,
    total_steps: int = 3,
    recovered_steps: int = 0,
    failed_step_id: int | None = None,
    failure_code: str | None = None,
    run_id: str = "r1",
) -> dict:
    return {
        "company": company,
        "summary": {
            "run_id": run_id,
            "plugin_id": plugin_id,
            "plugin_ver": plugin_ver,
            "status": status,
            "duration_ms": duration_ms,
            "total_steps": total_steps,
            "recovered_steps": recovered_steps,
            "failed_step_id": failed_step_id,
            "failure_code": failure_code,
            "started_at": at,
            "server_ts": at,
        },
        "events": events or [],
    }


def _selector_recovery(si: int = 0, ts: float = _NOW) -> dict:
    return {"e": "tier_ok", "ts": ts, "si": si, "sel": "selector"}


def _a11y_recovery(si: int = 0, ts: float = _NOW) -> dict:
    return {"e": "rec_ok", "ts": ts, "si": si, "rt": "a11y_role"}


def _fuzzy_recovery(si: int = 0, ts: float = _NOW) -> dict:
    return {"e": "rec_ok", "ts": ts, "si": si, "rt": "fuzzy"}


# ---------------------------------------------------------------------------
# range + bucketing
# ---------------------------------------------------------------------------

def test_range_spec_normalizes_known_tokens():
    assert range_spec("24h")["days"] == 1
    assert range_spec("24h")["granularity"] == "hour"
    assert range_spec("24h")["buckets"] == 24
    assert range_spec("90d")["days"] == 90
    assert range_spec("30d")["granularity"] == "day"


def test_range_spec_falls_back_to_7d_for_junk():
    for junk in ("", "nonsense", "1y", None):
        assert range_spec(junk)["token"] == "7d"


def test_bucket_series_seeds_empty_periods_as_zero():
    """A quiet day must render as a zero, not vanish — a sparkline that drops empty
    buckets misreports the shape of the trend."""
    now_ms = int(_NOW * 1000)
    records = [_record(at=_NOW)]
    rows = bucket_series(records, end_ms=now_ms, spec=range_spec("7d"))
    assert len(rows) == 7
    assert sum(r["executions"] for r in rows) == 1
    assert rows[-1]["executions"] == 1
    assert all(r["executions"] == 0 for r in rows[:-1])


def test_bucket_series_computes_success_rate_and_duration():
    now_ms = int(_NOW * 1000)
    records = [
        _record(status="ok", duration_ms=1000, at=_NOW),
        _record(status="fail", duration_ms=3000, at=_NOW, failed_step_id=1, failure_code="timeout"),
    ]
    rows = bucket_series(records, end_ms=now_ms, spec=range_spec("7d"))
    today = rows[-1]
    assert today["executions"] == 2
    assert today["successful"] == 1
    assert today["failed"] == 1
    assert today["success_rate"] == 50.0
    assert today["avg_duration"] == 2000


def test_bucket_series_success_rate_is_none_when_nothing_completed():
    rows = bucket_series([], end_ms=int(_NOW * 1000), spec=range_spec("7d"))
    assert all(r["success_rate"] is None for r in rows)


def test_window_records_filters_by_run_time():
    day = 86_400
    records = [_record(at=_NOW), _record(at=_NOW - (5 * day))]
    recent = window_records(records, int((_NOW - day) * 1000), int((_NOW + 1) * 1000))
    assert len(recent) == 1


# ---------------------------------------------------------------------------
# recovery paths + cascade
# ---------------------------------------------------------------------------

def test_step_recovery_paths_records_ordered_tier_sequence():
    record = _record(events=[_selector_recovery(0, _NOW), _a11y_recovery(0, _NOW + 1)])
    paths = step_recovery_paths(record)
    assert paths[0]["tiers"] == ["Tier 1", "Tier 2"]
    assert paths[0]["failed"] is False


def test_step_recovery_paths_dedupes_consecutive_repeats_of_a_tier():
    record = _record(events=[_selector_recovery(0, _NOW), _selector_recovery(0, _NOW + 1)])
    assert step_recovery_paths(record)[0]["tiers"] == ["Tier 1"]


def test_step_recovery_paths_ignores_steps_that_never_recovered():
    record = _record(events=[{"e": "verify_result", "ts": _NOW, "si": 0, "ok": True, "n": 1}])
    assert step_recovery_paths(record) == {}


def test_step_recovery_paths_marks_failure_from_run_summary():
    """run.js does not reliably emit a per-step success event, so the failed step is
    identified from step_fail or the run summary rather than the absence of step_ok."""
    record = _record(
        events=[_selector_recovery(2, _NOW)],
        status="fail",
        failed_step_id=2,
        failure_code="timeout",
    )
    assert step_recovery_paths(record)[2]["failed"] is True


def test_recovery_cascade_builds_layered_links():
    records = [_record(events=[_selector_recovery(0, _NOW), _a11y_recovery(0, _NOW + 1)])]
    cascade = recovery_cascade(records)
    names = [n["name"] for n in cascade["nodes"]]
    assert names == ["Entered recovery", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Healed", "Failed"]

    edges = {(names[l["source"]], names[l["target"]]): l["value"] for l in cascade["links"]}
    assert edges == {
        ("Entered recovery", "Tier 1"): 1,
        ("Tier 1", "Tier 2"): 1,
        ("Tier 2", "Healed"): 1,
    }
    assert cascade["entered_recovery"] == 1
    assert cascade["healed"] == 1
    assert cascade["heal_rate"] == 100.0


def test_recovery_cascade_routes_failed_steps_to_failed_node():
    records = [_record(events=[_selector_recovery(0, _NOW)], status="fail", failed_step_id=0)]
    cascade = recovery_cascade(records)
    names = [n["name"] for n in cascade["nodes"]]
    edges = {(names[l["source"]], names[l["target"]]) for l in cascade["links"]}
    assert ("Tier 1", "Failed") in edges
    assert cascade["failed"] == 1
    assert cascade["heal_rate"] == 0.0


def test_recovery_cascade_counts_zero_token_heals_from_tier_1_and_2_only():
    records = [
        _record(events=[_selector_recovery(0)], run_id="a"),
        _record(events=[_a11y_recovery(1)], run_id="b"),
        _record(events=[_fuzzy_recovery(2)], run_id="c"),
    ]
    cascade = recovery_cascade(records)
    assert cascade["zero_token_heals"] == 2  # Tier 3 fuzzy match is excluded
    assert cascade["agent_assisted"] == 1


def test_recovery_cascade_does_not_credit_a_step_that_escalated_to_a_paid_tier():
    """A step that tried Tier 1, failed, then healed at Tier 3 did not heal for free.
    Counting Tier 1/2 touches instead of outcomes would credit it anyway."""
    records = [_record(events=[_selector_recovery(0, _NOW), _fuzzy_recovery(0, _NOW + 1)])]
    cascade = recovery_cascade(records)
    assert cascade["healed"] == 1
    assert cascade["zero_token_heals"] == 0
    assert cascade["agent_assisted"] == 1


def test_recovery_cascade_zero_token_heals_never_exceeds_steps_that_entered_recovery():
    """One step touching both free tiers is one heal, not two — the headline number is a
    count of steps, and a business metric that can exceed its own denominator is wrong."""
    records = [_record(events=[_selector_recovery(0, _NOW), _a11y_recovery(0, _NOW + 1)])]
    cascade = recovery_cascade(records)
    assert cascade["entered_recovery"] == 1
    assert cascade["zero_token_heals"] == 1


def test_recovery_cascade_failed_step_is_never_a_zero_token_heal():
    records = [_record(events=[_selector_recovery(0, _NOW)], status="fail", failed_step_id=0)]
    cascade = recovery_cascade(records)
    assert cascade["failed"] == 1
    assert cascade["zero_token_heals"] == 0


def test_recovery_cascade_reports_directly_resolved_steps_separately():
    """The directly-resolved population dwarfs recovery; it's a number beside the diagram,
    never a band inside it."""
    records = [_record(total_steps=10, events=[_selector_recovery(0)])]
    cascade = recovery_cascade(records)
    assert cascade["entered_recovery"] == 1
    assert cascade["resolved_directly"] == 9


def test_recovery_cascade_is_empty_without_recoveries():
    cascade = recovery_cascade([_record()])
    assert cascade["links"] == []
    assert cascade["entered_recovery"] == 0
    assert cascade["heal_rate"] == 0.0


def test_recovery_tier_totals_classifies_each_tier():
    records = [
        _record(events=[_selector_recovery(0)], run_id="a"),
        _record(events=[_a11y_recovery(0)], run_id="b"),
        _record(events=[_fuzzy_recovery(0)], run_id="c"),
        _record(events=[{"e": "tier_escalated", "ts": _NOW, "si": 0, "l": 4}], run_id="d"),
    ]
    assert recovery_tier_totals(records) == {"Tier 1": 1, "Tier 2": 1, "Tier 3": 1, "Tier 4": 1}


# ---------------------------------------------------------------------------
# workflow + step analytics
# ---------------------------------------------------------------------------

def test_workflow_analytics_groups_by_company_and_skill():
    records = [
        _record("acme", "checkout", run_id="a"),
        _record("acme", "signup", run_id="b"),
        _record("beta", "checkout", run_id="c"),
    ]
    rows = workflow_analytics(records)
    assert {(r["company"], r["workflow"]) for r in rows} == {
        ("acme", "checkout"), ("acme", "signup"), ("beta", "checkout"),
    }


def test_workflow_analytics_computes_percentiles_and_rates():
    records = [_record(duration_ms=d, run_id=f"r{d}") for d in (100, 200, 300, 400)]
    records.append(_record(status="fail", duration_ms=500, failed_step_id=0, run_id="rf"))
    row = workflow_analytics(records)[0]
    assert row["runs"] == 5
    assert row["successful"] == 4
    assert row["failed"] == 1
    assert row["success_rate"] == 80.0
    assert row["p50_duration"] == 300
    assert row["p95_duration"] == 500


def test_workflow_analytics_breaks_down_by_version_newest_first():
    day = 86_400
    records = [_record(plugin_ver="0.2.0", at=_NOW - (2 * day), run_id=f"old{i}") for i in range(3)]
    records += [_record(plugin_ver="0.3.0", status="fail", failed_step_id=0, run_id=f"new{i}") for i in range(2)]
    row = workflow_analytics(records)[0]
    assert [v["version"] for v in row["versions"]] == ["0.3.0", "0.2.0"]
    assert row["versions"][0]["success_rate"] == 0.0
    assert row["versions"][1]["success_rate"] == 100.0


def test_workflow_analytics_reports_delta_against_previous_window():
    current = [_record(status="fail", failed_step_id=0, run_id="c1")]
    previous = [_record(run_id="p1")]
    row = workflow_analytics(current, previous)[0]
    assert row["previous_success_rate"] == 100.0
    assert row["success_rate"] == 0.0
    assert row["success_rate_delta"] == -100.0


def test_workflow_analytics_delta_is_none_without_a_previous_window():
    assert workflow_analytics([_record()])[0]["success_rate_delta"] is None


def test_step_analytics_counts_attempts_failures_and_recoveries():
    records = [
        _record(total_steps=3, events=[_a11y_recovery(1)], run_id="a"),
        _record(
            total_steps=3,
            status="fail",
            failed_step_id=1,
            failure_code="timeout",
            events=[{"e": "step_fail", "ts": _NOW, "si": 1, "fc": "timeout"}],
            run_id="b",
        ),
    ]
    by_index = {r["step_index"]: r for r in step_analytics(records)}
    step_one = by_index[1]
    assert step_one["attempts"] == 2
    assert step_one["failures"] == 1
    assert step_one["recoveries"] == 1
    assert step_one["success_rate"] == 50.0
    assert step_one["dominant_failure_code"] == "timeout"
    assert step_one["tier_counts"] == [{"tier": "Tier 2", "count": 1}]


def test_step_analytics_derives_failure_from_summary_when_no_step_fail_event():
    records = [_record(total_steps=2, status="fail", failed_step_id=1, failure_code="url_mismatch")]
    by_index = {r["step_index"]: r for r in step_analytics(records)}
    assert by_index[1]["failures"] == 1
    assert by_index[1]["dominant_failure_code"] == "url_mismatch"


def test_step_analytics_reports_assertion_pass_rate_per_step():
    records = [
        _record(total_steps=1, events=[{"e": "verify_result", "ts": _NOW, "si": 0, "ok": True, "n": 1, "advFail": 0}], run_id="a"),
        _record(total_steps=1, events=[{"e": "verify_result", "ts": _NOW, "si": 0, "ok": False, "n": 1, "advFail": 1}], run_id="b"),
    ]
    row = step_analytics(records)[0]
    assert row["assertion_pass_rate"] == 50.0
    assert row["assertions_total"] == 2
    assert row["advisory_failures"] == 1


def test_step_analytics_sorts_worst_success_rate_first():
    records = [
        _record(total_steps=2, status="fail", failed_step_id=1, failure_code="timeout", run_id="a"),
        _record(total_steps=2, run_id="b"),
    ]
    rows = step_analytics(records)
    assert rows[0]["step_index"] == 1
    assert rows[0]["success_rate"] < rows[1]["success_rate"]


# ---------------------------------------------------------------------------
# KPIs + health
# ---------------------------------------------------------------------------

def test_kpi_strip_marks_direction_so_rising_failures_are_not_green():
    series = bucket_series([], end_ms=int(_NOW * 1000), spec=range_spec("7d"))
    rows = {r["key"]: r for r in kpi_strip([_record()], [], series)}
    assert rows["success_rate"]["direction"] == "up_good"
    assert rows["failed_executions"]["direction"] == "down_good"
    assert rows["average_execution_time"]["direction"] == "down_good"


def test_kpi_strip_computes_delta_against_previous_period():
    series = bucket_series([], end_ms=int(_NOW * 1000), spec=range_spec("7d"))
    current = [_record(run_id="a"), _record(run_id="b")]
    previous = [_record(run_id="c")]
    executions = {r["key"]: r for r in kpi_strip(current, previous, series)}["executions"]
    assert executions["value"] == 2
    assert executions["previous"] == 1
    assert executions["delta"] == 1
    assert executions["delta_pct"] == 100.0


def test_kpi_strip_delta_pct_is_none_when_previous_period_was_empty():
    series = bucket_series([], end_ms=int(_NOW * 1000), spec=range_spec("7d"))
    executions = {r["key"]: r for r in kpi_strip([_record()], [], series)}["executions"]
    assert executions["delta_pct"] is None


def test_health_score_reports_no_telemetry_rather_than_zero():
    """A brand-new workspace has no data, not a failing platform. Scoring it 0 would
    put a red 'Critical' badge in front of a customer who has done nothing wrong."""
    health = health_score([], assertion_rows=[], drift_rows=[], registrations=[], now_ms=int(_NOW * 1000))
    assert health["score"] is None
    assert health["grade"] == "No telemetry"
    assert health["factors"] == []


def test_health_score_is_perfect_for_a_clean_workspace():
    health = health_score(
        [_record()],
        assertion_rows=[{"total": 10, "passed": 10}],
        drift_rows=[],
        registrations=[{"last_seen": _NOW}],
        now_ms=int(_NOW * 1000),
    )
    assert health["score"] == 100
    assert health["grade"] == "Excellent"


def test_health_score_factor_contributions_sum_to_the_score():
    health = health_score(
        [_record(run_id="a"), _record(status="fail", failed_step_id=0, run_id="b")],
        assertion_rows=[{"total": 10, "passed": 6}],
        drift_rows=[{"occurrence_rate_pct": 40}],
        registrations=[{"last_seen": _NOW}, {"last_seen": _NOW - (60 * 86_400)}],
        now_ms=int(_NOW * 1000),
    )
    assert health["score"] == round(sum(f["contribution"] for f in health["factors"]))
    assert {f["weight"] for f in health["factors"]} == {40, 20, 15, 15, 10}


def test_health_score_penalises_agent_dependence():
    """Tier 3/4 recoveries cost tokens; leaning on them is a fragility signal even when
    every run still succeeds."""
    zero_token = health_score(
        [_record(events=[_selector_recovery(0)])],
        assertion_rows=[], drift_rows=[], registrations=[], now_ms=int(_NOW * 1000),
    )
    agent_heavy = health_score(
        [_record(events=[_fuzzy_recovery(0)])],
        assertion_rows=[], drift_rows=[], registrations=[], now_ms=int(_NOW * 1000),
    )
    assert agent_heavy["score"] < zero_token["score"]


# ---------------------------------------------------------------------------
# failure codes + heatmap
# ---------------------------------------------------------------------------

def test_failure_codes_ranks_by_frequency():
    records = [
        _record(status="fail", failure_code="timeout", failed_step_id=0, run_id="a"),
        _record(status="fail", failure_code="timeout", failed_step_id=0, run_id="b"),
        _record(status="fail", failure_code="url_mismatch", failed_step_id=0, run_id="c"),
        _record(run_id="ok"),
    ]
    rows = failure_codes(records)
    assert [r["code"] for r in rows] == ["timeout", "url_mismatch"]
    assert rows[0]["count"] == 2
    assert rows[0]["workflow_count"] == 1


def test_failure_codes_ignores_successful_runs():
    assert failure_codes([_record()]) == []


def test_reliability_heatmap_buckets_by_weekday_and_hour():
    stamp = time.gmtime(_NOW)
    cells = reliability_heatmap([_record(status="fail", failed_step_id=0), _record(run_id="b")])["cells"]
    assert len(cells) == 1
    assert cells[0]["weekday"] == stamp.tm_wday
    assert cells[0]["hour"] == stamp.tm_hour
    assert cells[0]["runs"] == 2
    assert cells[0]["success_rate"] == 50.0


# ---------------------------------------------------------------------------
# ROI
# ---------------------------------------------------------------------------

def test_normalize_assumptions_applies_defaults():
    assumptions = normalize_assumptions(None)
    assert assumptions["default_minutes"] == 8
    assert assumptions["hourly_rate"] == 65
    assert assumptions["currency"] == "USD"
    assert assumptions["per_workflow"] == {}


def test_normalize_assumptions_coerces_junk_instead_of_raising():
    assumptions = normalize_assumptions({
        "default_minutes": "not a number",
        "hourly_rate": -5,
        "per_workflow": {"acme/checkout": "abc", "acme/signup": 12},
    })
    assert assumptions["default_minutes"] == 8   # falls back to the default
    assert assumptions["hourly_rate"] == 0       # clamped, never negative
    assert assumptions["per_workflow"] == {"acme/signup": 12}


def test_roi_uses_per_workflow_override_over_the_default():
    records = [_record("acme", "checkout", run_id="a"), _record("acme", "signup", run_id="b")]
    result = roi(records, {"default_minutes": 10, "per_workflow": {"acme/checkout": 60}})
    assert result["estimated"]["hours_saved"] == round((60 + 10) / 60, 1)
    by_workflow = {r["workflow"]: r for r in result["estimated"]["by_workflow"]}
    assert by_workflow["checkout"]["is_estimate_default"] is False
    assert by_workflow["signup"]["is_estimate_default"] is True


def test_roi_counts_only_successful_runs_as_saved_time():
    records = [_record(run_id="a"), _record(status="fail", failed_step_id=0, run_id="b")]
    result = roi(records, {"default_minutes": 60})
    assert result["estimated"]["hours_saved"] == 1.0
    assert result["measured"]["unattended_completions"] == 1


def test_roi_separates_measured_facts_from_estimates():
    """hours_saved leans on an admin's guess; the measured block must not, so the UI can
    present the two with different confidence."""
    records = [_record(events=[_selector_recovery(0)], run_id="a")]
    result = roi(records, {})
    assert result["measured"]["zero_token_recoveries"] == 1
    assert result["measured"]["self_healed_runs"] == 1
    assert result["measured"]["agent_assisted_recoveries"] == 0
    assert "hours_saved" not in result["measured"]


# ---------------------------------------------------------------------------
# insights
# ---------------------------------------------------------------------------

def _insight_ids(rows: list[dict]) -> set[str]:
    return {row["id"].split(":")[0] for row in rows}


def test_insights_flags_a_version_regression():
    day = 86_400
    records = [_record(plugin_ver="0.2.0", at=_NOW - (2 * day), run_id=f"old{i}") for i in range(6)]
    records += [
        _record(plugin_ver="0.3.0", status="fail", failed_step_id=0, run_id=f"new{i}")
        for i in range(6)
    ]
    workflows = workflow_analytics(records)
    rows = insights(
        workflows=workflows, assertion_rows=[], drift_rows=[], failure_rows=[],
        tier_totals={}, stale_runtimes=0, metrics={"total_executions": 12},
        previous_records=[], current_records=records,
    )
    assert "version_regression" in _insight_ids(rows)
    assert rows[0]["severity"] == "critical"
    assert rows[0]["evidence"] == "/dashboard/workflows/acme/checkout"


def test_insights_flags_assertion_decay():
    rows = insights(
        workflows=[], drift_rows=[], failure_rows=[], tier_totals={}, stale_runtimes=0,
        assertion_rows=[{
            "company": "acme", "workflow": "checkout", "step_label": "Step 3",
            "step_index": 2, "total": 20, "pass_rate": 55.0,
        }],
        metrics={"total_executions": 20}, previous_records=[], current_records=[],
    )
    assert "assertion_decay" in _insight_ids(rows)


def test_insights_flags_agent_dependence_above_threshold():
    rows = insights(
        workflows=[], assertion_rows=[], drift_rows=[], failure_rows=[],
        tier_totals={"Tier 1": 5, "Tier 2": 2, "Tier 3": 3},
        stale_runtimes=0, metrics={"total_executions": 10},
        previous_records=[], current_records=[],
    )
    assert "agent_dependence" in _insight_ids(rows)


def test_insights_reports_all_clear_when_nothing_is_wrong():
    rows = insights(
        workflows=[], assertion_rows=[], drift_rows=[], failure_rows=[], tier_totals={},
        stale_runtimes=0, metrics={"total_executions": 40, "success_rate": 99.2},
        previous_records=[], current_records=[],
    )
    assert [r["id"] for r in rows] == ["all_clear"]


def test_insights_stays_silent_for_a_workspace_with_no_telemetry():
    rows = insights(
        workflows=[], assertion_rows=[], drift_rows=[], failure_rows=[], tier_totals={},
        stale_runtimes=0, metrics={"total_executions": 0},
        previous_records=[], current_records=[],
    )
    assert rows == []


def test_insights_orders_critical_before_warning_before_info():
    day = 86_400
    records = [_record(plugin_ver="0.2.0", at=_NOW - (2 * day), run_id=f"old{i}") for i in range(6)]
    records += [_record(plugin_ver="0.3.0", status="fail", failed_step_id=0, run_id=f"n{i}") for i in range(6)]
    rows = insights(
        workflows=workflow_analytics(records), assertion_rows=[], drift_rows=[],
        failure_rows=[], tier_totals={}, stale_runtimes=3,
        metrics={"total_executions": 12}, previous_records=[], current_records=records,
    )
    severities = [r["severity"] for r in rows]
    assert severities == sorted(severities, key=lambda s: {"critical": 0, "warning": 1, "info": 2}[s])
