from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

import app.api.skillpack_update_routes as sp


class RateLimitPersistenceTests(unittest.TestCase):
    """The sync rate limit must survive a process restart when a database is
    configured, so a runtime cannot bypass the 5-minute window by hitting a
    freshly-restarted (or newly scaled-out) app instance."""

    def test_rate_limit_persists_across_restart(self) -> None:
        store: dict[tuple[str, str], dict] = {}

        def fake_get(ns: str, key: str):
            return store.get((ns, key))

        def fake_set(ns: str, key: str, data: dict) -> None:
            store[(ns, key)] = data

        with (
            patch.object(sp, "using_database", return_value=True),
            patch.object(sp, "db_get", side_effect=fake_get),
            patch.object(sp, "db_set", side_effect=fake_set),
        ):
            # First sync records the timestamp in the KV store.
            sp._check_rate_limit("token-abc")
            # Simulate a restart / different instance: in-memory cache is gone,
            # but the KV entry survives.
            sp._rate_cache.clear()
            with self.assertRaises(HTTPException) as ctx:
                sp._check_rate_limit("token-abc")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_rate_limit_in_memory_fallback_without_database(self) -> None:
        sp._rate_cache.clear()
        with patch.object(sp, "using_database", return_value=False):
            sp._check_rate_limit("token-xyz")  # first call allowed
            with self.assertRaises(HTTPException) as ctx:
                sp._check_rate_limit("token-xyz")  # second within window blocked
        self.assertEqual(ctx.exception.status_code, 429)
        sp._rate_cache.clear()


if __name__ == "__main__":
    unittest.main()
