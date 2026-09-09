"""Shared local cache for whole-workflow LLM passes (BUILD-25 stage b).

Every task client under conxa_compile/llm/ has hand-rolled the identical
dual-write cache (a `db_get`/`db_set("llm_cache", ...)` row plus a JSON file
under `settings.data_dir / "cache"`) — workflow_intent.py was the sixth copy.
This extracts that one pattern so a namespace only has to declare its version
and let the rest self-prune, instead of re-copying ~40 lines.

Versioned namespace: bump `version` on any schema change to the cached value
shape. Old-version entries are dropped on read rather than migrated — a
recompile re-pays for one call instead of the cache serving stale-shaped data
forever.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_set


def _cache_path(namespace: str) -> Path:
    p = settings.data_dir / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{namespace}_cache.json"


def _filter_version(data: dict[str, Any], version: int) -> dict[str, dict[str, Any]]:
    return {
        str(k): v for k, v in data.items()
        if isinstance(v, dict) and v.get("_v") == version
    }


def _read_all(namespace: str, version: int) -> dict[str, dict[str, Any]]:
    data = db_get("llm_cache", namespace)
    if isinstance(data, dict):
        return _filter_version(data, version)
    path = _cache_path(namespace)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return _filter_version(data, version)


def _write_all(namespace: str, cache: dict[str, dict[str, Any]]) -> None:
    try:
        db_set("llm_cache", namespace, cache)
    except Exception:
        pass
    try:
        _cache_path(namespace).write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def cache_key(version: int, **fields: Any) -> str:
    raw = json.dumps({"v": version, **fields}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def read_cached(namespace: str, key: str, version: int) -> dict[str, Any] | None:
    return _read_all(namespace, version).get(key)


def write_cached(namespace: str, key: str, value: dict[str, Any], version: int) -> None:
    cache = _read_all(namespace, version)
    cache[key] = {**value, "_v": version}
    _write_all(namespace, cache)


if __name__ == "__main__":
    # Pure-logic checks only — no real db/disk I/O, so running this never
    # pollutes a developer's actual cache.
    stale = {"goal": "old"}          # no "_v": pre-versioning entry
    current = {"goal": "new", "_v": 2}
    other_version = {"goal": "mid", "_v": 1}
    filtered = _filter_version({"a": stale, "b": current, "c": other_version, "d": "not a dict"}, 2)
    assert filtered == {"b": current}, filtered
    assert cache_key(1, steps=["a"]) == cache_key(1, steps=["a"])
    assert cache_key(1, steps=["a"]) != cache_key(2, steps=["a"])
    print("ok")
