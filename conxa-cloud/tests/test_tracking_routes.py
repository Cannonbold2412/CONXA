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


if __name__ == "__main__":
    unittest.main()
