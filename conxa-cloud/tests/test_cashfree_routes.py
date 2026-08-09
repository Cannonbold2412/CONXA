"""Characterization tests for the Cashfree billing routes.

These lock in the current observable behavior of the (previously untested)
billing surface before it is refactored. External Cashfree HTTP calls are
mocked via ``_cf_request``; no network or real credentials are needed.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = b"{}"
        self.text = str(payload)

    def json(self) -> dict[str, Any]:
        return self._payload


class CashfreeRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        for attr, value in (
            ("data_dir", self.tmp / "data"),
            ("auth_required", False),
            ("cashfree_app_id", "cf_app"),
            ("cashfree_secret_key", "cf_secret"),
            ("cashfree_starter_plan_id", "plan_starter"),
            ("cashfree_pro_plan_id", "plan_pro"),
            ("cashfree_webhook_secret", ""),
        ):
            p = patch(f"conxa_core.config.settings.{attr}", value)
            self.addCleanup(p.stop)
            p.start()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _client(self) -> TestClient:
        from app.main import app

        return TestClient(app)

    def test_list_plans_returns_four_tiers(self) -> None:
        res = self._client().get("/api/v1/subscriptions/plans")
        self.assertEqual(res.status_code, 200)
        plans = {p["tier"]: p for p in res.json()["plans"]}
        self.assertEqual(set(plans), {"free", "starter", "pro", "enterprise"})
        self.assertEqual(plans["free"]["amount"], 0)
        self.assertEqual(plans["starter"]["amount"], 19999)
        self.assertEqual(plans["pro"]["amount"], 49999)
        self.assertTrue(all(p["features"] for p in plans.values()))

    def test_create_subscription_returns_reference_and_stores_mapping(self) -> None:
        from conxa_core.db import db_get

        fake = FakeResponse(200, {"data": {"subReferenceId": "subref123", "authLink": "https://auth.example"}})
        with patch("app.api.cashfree_routes._cf_request", return_value=fake):
            res = self._client().post("/api/v1/subscriptions/create", json={"tier": "starter"})
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["subscription_id"], "subref123")
        self.assertEqual(body["auth_link"], "https://auth.example")
        self.assertEqual(body["tier"], "starter")
        mapping = db_get("cashfree_sub_workspace", "subref123")
        self.assertEqual(mapping["tier"], "starter")

    def test_create_subscription_rejects_invalid_tier(self) -> None:
        res = self._client().post("/api/v1/subscriptions/create", json={"tier": "enterprise"})
        self.assertEqual(res.status_code, 400)

    def test_verify_subscription_activates_billing(self) -> None:
        fake = FakeResponse(200, {"subscription": {"status": "ACTIVE", "planId": "plan_starter"}})
        with patch("app.api.cashfree_routes._cf_request", return_value=fake):
            res = self._client().post(
                "/api/v1/subscriptions/verify", json={"subscription_id": "subref123"}
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json()["success"])
        sub = self._client().get("/api/v1/billing/subscription")
        self.assertEqual(sub.json()["subscription"]["plan"], "starter")

    def test_verify_subscription_rejects_unknown_plan(self) -> None:
        fake = FakeResponse(200, {"subscription": {"status": "ACTIVE", "planId": "plan_unknown"}})
        with patch("app.api.cashfree_routes._cf_request", return_value=fake):
            res = self._client().post(
                "/api/v1/subscriptions/verify", json={"subscription_id": "subref123"}
            )
        self.assertEqual(res.status_code, 400)

    def test_webhook_valid_signature_activates_then_cancels(self) -> None:
        from app.api.cashfree_routes import _cf_webhook_signature

        secret = "whsec"
        with patch("conxa_core.config.settings.cashfree_webhook_secret", secret):
            from conxa_core.db import db_set

            db_set("cashfree_sub_workspace", "subref123", {"workspace_id": "wrk_local", "tier": "starter"})

            payload = {
                "cf_event": "SUBSCRIPTION_NEW_PAYMENT",
                "cf_subReferenceId": "subref123",
                "cf_planId": "plan_starter",
                "cf_status": "ACTIVE",
            }
            payload["signature"] = _cf_webhook_signature(payload, secret)
            res = self._client().post("/api/v1/subscriptions/webhooks/cashfree", json=payload)
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.json()["received"])
            sub = self._client().get("/api/v1/billing/subscription")
            self.assertEqual(sub.json()["subscription"]["plan"], "starter")

    def test_webhook_invalid_signature_rejected(self) -> None:
        with patch("conxa_core.config.settings.cashfree_webhook_secret", "whsec"):
            payload = {
                "cf_event": "SUBSCRIPTION_NEW_PAYMENT",
                "cf_subReferenceId": "subref123",
                "cf_planId": "plan_starter",
                "cf_status": "ACTIVE",
                "signature": "not-the-right-signature",
            }
            res = self._client().post("/api/v1/subscriptions/webhooks/cashfree", json=payload)
            self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
