from __future__ import annotations

import time

from conxa_core import db
from conxa_core.config import settings
from conxa_core.storage import selector_cache


def _seed(monkeypatch, dom_hash: str, bbox: dict[str, int], created_at: float) -> None:
    """Write one cache entry stamped with a specific created_at."""
    monkeypatch.setattr(selector_cache.time, "time", lambda: created_at)
    selector_cache.set(dom_hash, bbox, "default", [{"selector": f"#{dom_hash}"}])


def test_cleanup_expired_entries_removes_only_expired(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "selector_cache_enabled", True)
    monkeypatch.setattr(settings, "selector_cache_ttl_days", 30)
    monkeypatch.setattr(db, "_engine", None)

    now = time.time()
    fresh_bbox = {"x": 1, "y": 2, "w": 3, "h": 4}
    expired_bbox = {"x": 5, "y": 6, "w": 7, "h": 8}

    _seed(monkeypatch, "freshhash", fresh_bbox, now)
    _seed(monkeypatch, "oldhash", expired_bbox, now - 40 * 86400)

    # Restore the clock for the sweep itself.
    monkeypatch.setattr(selector_cache.time, "time", lambda: now)

    # Each set() writes two files: the KV fallback + the content-addressed cache.
    assert len(list(tmp_path.rglob("*.json"))) == 4

    stats = selector_cache.cleanup_expired_entries()

    assert stats["deleted_kv"] == 1
    assert stats["deleted_files"] == 1
    assert stats["error_count"] == 0

    # The fresh entry survives; the expired entry's two backing files are gone.
    remaining = list(tmp_path.rglob("*.json"))
    assert len(remaining) == 2
    assert selector_cache.get("freshhash", fresh_bbox, "default") == [{"selector": "#freshhash"}]


def test_cleanup_expired_entries_noop_when_all_fresh(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "selector_cache_enabled", True)
    monkeypatch.setattr(settings, "selector_cache_ttl_days", 30)
    monkeypatch.setattr(db, "_engine", None)

    now = time.time()
    _seed(monkeypatch, "a", {"x": 0, "y": 0, "w": 1, "h": 1}, now)
    monkeypatch.setattr(selector_cache.time, "time", lambda: now)

    stats = selector_cache.cleanup_expired_entries()

    assert stats == {"deleted_kv": 0, "deleted_files": 0, "error_count": 0}
    assert len(list(tmp_path.rglob("*.json"))) == 2
