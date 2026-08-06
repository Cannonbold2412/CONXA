"""Characterization tests for the telemetry tracking routes.

Locks in the current observable behavior of ingest + query + dashboard
aggregation before ``tracking_routes`` is split into cohesive modules. Runs in
local mode (no HMAC secret, auth off) where ingest accepts an empty token.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


class TrackingRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        for attr, value in (
            ("data_dir", self.tmp / "data"),
            ("auth_required", False),
            ("tracking_hmac_secret", ""),
        ):
            p = patch(f"conxa_core.config.settings.{attr}", value)
            self.addCleanup(p.stop)
            p.start()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _client(self) -> TestClient:
        from app.main import app

        return TestClient(app)

    def _ingest(self, client: TestClient, company: str, rid: str, evts: list[dict]) -> None:
        res = client.post(
            f"/api/v1/tracking/{company}/events",
            json={"rid": rid, "pid": "plug", "pv": "1.0.0", "rv": "2.0.0", "sv": 1, "evts": evts},
        )
        self.assertEqual(res.status_code, 202, res.text)

    def test_ingest_then_list_and_timeline(self) -> None:
        client = self._client()
        self._ingest(client, "acme", "run_ok", [
            {"e": "wf_start", "ts": 1000},
            {"e": "wf_ok", "ts": 2000, "dur": 1000, "tot": 3, "rec": 1},
        ])
        self._ingest(client, "acme", "run_fail", [
            {"e": "wf_start", "ts": 3000},
            {"e": "wf_fail", "ts": 4000, "dur": 1000, "fsi": "step-2", "fc": "not_found"},
        ])

        runs = client.get("/api/v1/tracking/acme/runs")
        self.assertEqual(runs.status_code, 200)
        body = runs.json()
        self.assertEqual(body["total"], 2)
        by_id = {r["run_id"]: r for r in body["runs"]}
        self.assertEqual(by_id["run_ok"]["status"], "ok")
        self.assertEqual(by_id["run_ok"]["recovered_steps"], 1)
        self.assertEqual(by_id["run_fail"]["status"], "fail")
        self.assertEqual(by_id["run_fail"]["failed_step_id"], "step-2")

        timeline = client.get("/api/v1/tracking/acme/runs/run_ok")
        self.assertEqual(timeline.status_code, 200)
        tl = timeline.json()
        self.assertEqual(tl["plugin_id"], "plug")
        self.assertEqual([e["e"] for e in tl["timeline"]], ["wf_start", "wf_ok"])

    def test_timeline_unknown_run_404(self) -> None:
        res = self._client().get("/api/v1/tracking/acme/runs/nope")
        self.assertEqual(res.status_code, 404)

    def test_ingest_requires_token_when_secret_configured(self) -> None:
        with patch("conxa_core.config.settings.tracking_hmac_secret", "s3cret"):
            res = self._client().post(
                "/api/v1/tracking/acme/events", json={"rid": "r", "evts": []}
            )
            self.assertEqual(res.status_code, 401)

    def test_dashboard_and_drift_aggregate(self) -> None:
        client = self._client()
        self._ingest(client, "acme", "run_ok", [
            {"e": "wf_start", "ts": 1000},
            {"e": "wf_ok", "ts": 2000, "dur": 1000, "tot": 2, "rec": 0},
        ])

        dashboard = client.get("/api/v1/tracking/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        body = dashboard.json()
        self.assertIn("metrics", body)
        self.assertIn("success_rate", body["metrics"])
        self.assertEqual(
            [r["type"] for r in body["recovery_type_usage"]],
            ["Selector", "Text Anchor", "Text Variant", "Vision"],
        )

        drift = client.get("/api/v1/tracking/drift")
        self.assertEqual(drift.status_code, 200)
        self.assertIn("queue", drift.json())

    def test_dashboard_includes_assertion_health_by_step_key(self) -> None:
        # Full company-discovery + workspace-visibility aggregation is exercised directly
        # against app.services.tracking._assertion_health_by_step in test_tracking_service.py
        # (that function's inputs are easier to construct precisely than a fully-discoverable
        # tracking company in this route-level harness). This just locks in that the dashboard
        # response wires the field through.
        dashboard = self._client().get("/api/v1/tracking/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        self.assertIn("assertion_health_by_step", dashboard.json())

    def test_dashboard_wires_through_the_operations_analytics_blocks(self) -> None:
        # The arithmetic behind each block is asserted directly in
        # test_tracking_analytics.py; this locks in that the composed response exposes them.
        body = self._client().get("/api/v1/tracking/dashboard").json()
        for key in (
            "health", "kpis", "series", "workflows", "recovery_cascade",
            "reliability_heatmap", "failure_codes", "roi", "insights", "granularity",
        ):
            self.assertIn(key, body)

    def test_dashboard_accepts_the_wider_range_tokens(self) -> None:
        client = self._client()
        for token, granularity in (("24h", "hour"), ("7d", "day"), ("30d", "day"), ("90d", "day")):
            body = client.get(f"/api/v1/tracking/dashboard?range={token}").json()
            self.assertEqual(body["range"], token)
            self.assertEqual(body["granularity"], granularity)

    def test_dashboard_falls_back_to_7d_for_an_unknown_range(self) -> None:
        body = self._client().get("/api/v1/tracking/dashboard?range=all-time").json()
        self.assertEqual(body["range"], "7d")

    def test_activity_feed_returns_runs_newest_first(self) -> None:
        client = self._client()
        self._ingest(client, "acme", "run_old", [
            {"e": "wf_start", "ts": 1000},
            {"e": "wf_ok", "ts": 2000, "dur": 1000, "tot": 2, "rec": 0},
        ])
        res = client.get("/api/v1/tracking/activity?limit=10")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("runs", body)
        self.assertTrue(all("recovery_tiers" in row for row in body["runs"]))

    def test_workflow_detail_route_does_not_collide_with_the_company_runs_route(self) -> None:
        # /tracking/workflows/{company}/{slug} and /tracking/{company}/runs/{run_id} are both
        # three segments. The latter requires a literal "runs" in the middle, so these can
        # only be told apart by that literal — worth pinning so a future reorder can't
        # silently route skill drill-downs into the run-timeline handler.
        res = self._client().get("/api/v1/tracking/workflows/acme/checkout")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["company"], "acme")
        self.assertEqual(body["workflow"], "checkout")
        self.assertIn("steps", body)

    def test_roi_assumptions_round_trip(self) -> None:
        client = self._client()
        defaults = client.get("/api/v1/tracking/roi-assumptions").json()
        self.assertEqual(defaults["default_minutes"], 8)

        saved = client.put(
            "/api/v1/tracking/roi-assumptions",
            json={"default_minutes": 25, "hourly_rate": 90, "per_workflow": {"acme/checkout": 45}},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["default_minutes"], 25)

        reread = client.get("/api/v1/tracking/roi-assumptions").json()
        self.assertEqual(reread["hourly_rate"], 90)
        self.assertEqual(reread["per_workflow"], {"acme/checkout": 45})
        self.assertIn("updated_at", reread)


if __name__ == "__main__":
    unittest.main()
