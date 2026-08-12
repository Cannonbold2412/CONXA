"""merge_storage_states — cookie concat/dedup, origin/localStorage merge, and
empty-input handling. JS parity lives in runtime/test/test_group_auth.js."""
from __future__ import annotations

from conxa_core.storage.storage_state import merge_storage_states


def test_cookies_are_deduped_by_name_domain_path():
    merged = merge_storage_states([
        {"cookies": [{"name": "a", "domain": "x", "path": "/"}]},
        {"cookies": [{"name": "a", "domain": "x", "path": "/"}, {"name": "b", "domain": "y", "path": "/"}]},
    ])
    assert len(merged["cookies"]) == 2


def test_later_origin_localstorage_wins_on_conflict():
    merged = merge_storage_states([
        {"origins": [{"origin": "https://a.com", "localStorage": [{"name": "k", "value": "1"}]}]},
        {"origins": [{"origin": "https://a.com", "localStorage": [{"name": "k", "value": "2"}, {"name": "k2", "value": "z"}]}]},
    ])
    assert len(merged["origins"]) == 1
    values = {item["name"]: item["value"] for item in merged["origins"][0]["localStorage"]}
    assert values == {"k": "2", "k2": "z"}


def test_distinct_origins_are_kept_separate():
    merged = merge_storage_states([
        {"origins": [{"origin": "https://a.com", "localStorage": [{"name": "k", "value": "1"}]}]},
        {"origins": [{"origin": "https://b.com", "localStorage": [{"name": "k", "value": "2"}]}]},
    ])
    assert {o["origin"] for o in merged["origins"]} == {"https://a.com", "https://b.com"}


def test_empty_and_none_inputs():
    assert merge_storage_states([]) == {"cookies": [], "origins": []}
    assert merge_storage_states([None, {}, None]) == {"cookies": [], "origins": []}
