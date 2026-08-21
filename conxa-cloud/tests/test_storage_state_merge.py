"""merge_storage_states / refresh_app_state — cookie concat/dedup, origin/
localStorage merge, empty-input handling, and post-recording per-app
splitting. JS parity for the merge half lives in runtime/test/test_group_auth.js."""
from __future__ import annotations

from conxa_core.storage.storage_state import merge_storage_states, refresh_app_state


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


def test_refresh_keeps_rotated_cookie_on_owned_domain():
    previous = {"cookies": [{"name": "session", "domain": "example.com", "path": "/", "value": "old"}], "origins": []}
    current = {"cookies": [{"name": "session", "domain": "example.com", "path": "/", "value": "new"}], "origins": []}
    refreshed = refresh_app_state(previous, current)
    assert refreshed["cookies"] == [{"name": "session", "domain": "example.com", "path": "/", "value": "new"}]


def test_refresh_drops_cookies_from_a_sibling_apps_domain():
    previous = {"cookies": [{"name": "session", "domain": "example.com", "path": "/", "value": "old"}], "origins": []}
    current = {
        "cookies": [
            {"name": "session", "domain": "example.com", "path": "/", "value": "new"},
            {"name": "other", "domain": "other.com", "path": "/", "value": "foreign"},
        ],
        "origins": [],
    }
    refreshed = refresh_app_state(previous, current)
    assert {c["domain"] for c in refreshed["cookies"]} == {"example.com"}


def test_refresh_keeps_new_cookie_on_an_already_owned_domain():
    previous = {"cookies": [{"name": "session", "domain": "example.com", "path": "/", "value": "old"}], "origins": []}
    current = {
        "cookies": [
            {"name": "session", "domain": "example.com", "path": "/", "value": "new"},
            {"name": "csrf", "domain": "example.com", "path": "/", "value": "abc"},
        ],
        "origins": [],
    }
    refreshed = refresh_app_state(previous, current)
    assert {c["name"] for c in refreshed["cookies"]} == {"session", "csrf"}


def test_refresh_of_an_empty_previous_state_is_empty():
    assert refresh_app_state({"cookies": [], "origins": []}, {"cookies": [{"name": "a", "domain": "x.com"}], "origins": []}) == {
        "cookies": [],
        "origins": [],
    }
