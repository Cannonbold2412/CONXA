"""Stable, position-independent identity for a compiled step (BUILD-25 stage a).

`step_index` renumbers the moment anyone inserts/deletes/reorders a step (see
BUILD-22/BUILD-23) — so it is the wrong key for anything meant to outlive one
compile, e.g. the reviewer edit log and the compiler's own semantic
suggestions. `identity_bundle.stable_hash` (compiler/stable_hash.py) is
*element* identity, not *step* identity: it is empty for element-less steps
(scroll/navigate/frame markers) and collides when the same element is acted on
twice in one workflow (the COMPILE-1 double date-pick). step_key() closes both
gaps with a fallback hash plus an occurrence ordinal, so two steps never share
a key even when their underlying element does.

Accepts either a plain step dict (as loaded from a saved skill document — the
editor's world) or a SkillStep model instance (the compiler's world, before
`model_dump()`), so both callers share one implementation instead of two.
"""

from __future__ import annotations

import hashlib
from collections import Counter
from typing import Any


def _field(step: Any, *path: str) -> Any:
    """Read a (possibly nested) field off a dict-shaped step or a pydantic
    SkillStep, without forcing the caller to serialize first."""
    cur = step
    for name in path:
        if cur is None:
            return None
        cur = cur.get(name) if isinstance(cur, dict) else getattr(cur, name, None)
    return cur


def _fallback_hash(step: Any) -> str:
    action_name = _field(step, "action")
    if isinstance(action_name, dict):
        action_name = action_name.get("action")
    raw = f"{action_name or ''}|{_field(step, 'url') or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def step_key(step: Any, seen: Counter[str]) -> str:
    """Return this step's stable key, disambiguated against every key already
    seen in this workflow (pass the same Counter across a full step list)."""
    base = str(_field(step, "identity_bundle", "stable_hash") or "").strip()
    if not base:
        base = _fallback_hash(step)
    seen[base] += 1
    return f"{base}#{seen[base]}"


def step_keys(steps: list[Any]) -> list[str]:
    """Compute step_key() for a full step list in order, sharing one occurrence
    counter — the shape every caller actually wants."""
    seen: Counter[str] = Counter()
    return [step_key(s, seen) for s in steps]


if __name__ == "__main__":
    click_a = {"action": {"action": "click"}, "url": "https://x", "identity_bundle": {"stable_hash": "h1"}}
    click_b = {"action": {"action": "click"}, "url": "https://x", "identity_bundle": {"stable_hash": "h1"}}
    scroll = {"action": {"action": "scroll"}, "url": "https://x"}

    keys = step_keys([click_a, scroll, click_b])
    assert len(set(keys)) == 3, keys  # same element twice must not collide
    assert keys[0] != keys[2]

    # Inserting a step ahead of an existing one must not change its key.
    keys_with_insert = step_keys([scroll, click_a, scroll, click_b])
    assert keys_with_insert[1] == "h1#1"
    assert keys_with_insert[3] == "h1#2"

    class _FakeBundle:
        stable_hash = "h2"

    class _FakeStep:
        action = {"action": "click"}
        url = "https://y"
        identity_bundle = _FakeBundle()

    # Attribute-style (pydantic-shaped) steps must key identically to the
    # equivalent dict shape.
    obj_key = step_keys([_FakeStep()])[0]
    dict_key = step_keys([{"action": {"action": "click"}, "url": "https://y", "identity_bundle": {"stable_hash": "h2"}}])[0]
    assert obj_key == dict_key == "h2#1"

    print("ok")
