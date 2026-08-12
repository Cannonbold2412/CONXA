"""Merge multiple Playwright storageState dicts into one.

A WorkflowGroup can hold several authenticated applications, each captured as
its own storageState file. To record or run a workflow that crosses those
apps in one Chromium context, their sessions need to be combined into a
single storageState. See runtime/browser.js's mergeStorageStates for the JS
twin used at execution time.
"""

from __future__ import annotations

from typing import Any


def merge_storage_states(states: list[dict[str, Any]]) -> dict[str, Any]:
    """Concatenate cookies (de-duped by name+domain+path) and merge localStorage
    origins (later states win per-key on conflicting origins)."""
    cookies: list[dict[str, Any]] = []
    seen_cookies: set[tuple[Any, Any, Any]] = set()
    origins_by_url: dict[str, dict[str, Any]] = {}

    for state in states:
        if not state:
            continue
        for cookie in state.get("cookies") or []:
            key = (cookie.get("name"), cookie.get("domain"), cookie.get("path"))
            if key in seen_cookies:
                continue
            seen_cookies.add(key)
            cookies.append(cookie)

        for origin in state.get("origins") or []:
            url = origin.get("origin")
            if not url:
                continue
            existing = origins_by_url.get(url)
            if existing is None:
                origins_by_url[url] = {"origin": url, "localStorage": list(origin.get("localStorage") or [])}
                continue
            merged_items = {item["name"]: item for item in existing["localStorage"]}
            for item in origin.get("localStorage") or []:
                merged_items[item["name"]] = item
            existing["localStorage"] = list(merged_items.values())

    return {"cookies": cookies, "origins": list(origins_by_url.values())}
