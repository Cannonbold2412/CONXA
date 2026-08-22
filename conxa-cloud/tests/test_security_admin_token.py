"""Admin bearer token bypasses the Clerk gate in the production middleware.

/api/v1/entitlements/admin/billing authenticates with CONXA_ADMIN_TOKEN (no Clerk
session exists for CI/ops callers), but ProductionRequestMiddleware previously
demanded a Clerk JWT on every non-public path, making the endpoint unreachable
whenever SKILL_AUTH_REQUIRED=true.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient


class AdminTokenAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        for patcher in (
            patch("conxa_core.config.settings.data_dir", self.tmp / "data"),
            patch("conxa_core.config.settings.auth_required", True),
            patch("app.api.security._ADMIN_TOKEN", "secret-admin-token"),
            patch("app.api.updates_routes._ADMIN_TOKEN", "secret-admin-token"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _client(self) -> TestClient:
        from app.main import app

        return TestClient(app)

    def test_admin_bearer_token_bypasses_clerk_gate(self) -> None:
        client = self._client()
        resp = client.post(
            "/api/v1/entitlements/admin/billing",
            headers={"Authorization": "Bearer secret-admin-token"},
            json={"workspace_id": "org_test123", "plan": "pro", "duration_days": 30},
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["workspace_id"], "org_test123")
        self.assertEqual(body["plan"], "pro")
        self.assertIsNotNone(body["expires_at"])

    def test_non_admin_token_still_rejected_by_clerk_gate(self) -> None:
        client = self._client()
        with patch(
            "app.api.security.verify_clerk_jwt",
            side_effect=HTTPException(status_code=401, detail="invalid_clerk_token"),
        ):
            resp = client.post(
                "/api/v1/entitlements/admin/billing",
                headers={"Authorization": "Bearer not-the-admin-token"},
                json={"workspace_id": "org_test123", "plan": "pro"},
            )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json()["detail"], "invalid_clerk_token")


if __name__ == "__main__":
    unittest.main()
