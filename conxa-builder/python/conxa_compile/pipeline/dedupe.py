"""Collapse redundant consecutive events (deterministic)."""

from __future__ import annotations

from typing import Any

_ELEMENT_ACTIONS = frozenset({
    "click", "dblclick", "right_click", "type", "fill",
    "set_checkbox", "set_radio", "select", "select_option",
})
_FOCUS_LOOKAHEAD = 3
# A native <select> can fire click (opens the dropdown), a browser-native type-ahead "type" flush
# (typing to jump to an option), and a second click (closing it) around its own authoritative
# "select" event — all on the identical element. Bounded lookaround for how many such noise events
# can surround one select before/after; wide enough for the open+close pair, narrow enough to never
# accidentally absorb an unrelated later action.
_SELECT_NOISE_LOOKAROUND = 2
_SELECT_NOISE_ACTIONS = frozenset({"click", "dblclick", "type", "fill"})


def _selector_key(ev: dict[str, Any]) -> str:
    """Return a stable same-element key. Empty string means not enough info to identify."""
    selectors = ev.get("selectors") or {}
    for key in ("aria", "text_based"):
        val = str(selectors.get(key) or "").strip()
        if val:
            return val
    css = str(selectors.get("css") or "").strip()
    if css:
        return css
    target = ev.get("target") or {}
    # Tag alone is not discriminating enough — require at least one stable attribute
    discriminators = list(filter(None, [
        str(target.get("id") or ""),
        str(target.get("aria_label") or ""),
        str(target.get("name") or ""),
    ]))
    if not discriminators:
        return ""
    tag = str(target.get("tag") or "")
    return "|".join(filter(None, [tag] + discriminators))


def drop_superseded_focus_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop focus events immediately superseded by a click/type/fill on the same element.

    A focus event is superseded when any of the next _FOCUS_LOOKAHEAD events is
    an element action (click, type, fill, …) targeting the same element.
    Standalone focus events (no matching action ahead) are kept.
    """
    out: list[dict[str, Any]] = []
    for i, ev in enumerate(events):
        if (ev.get("action") or {}).get("action") != "focus":
            out.append(ev)
            continue
        focus_key = _selector_key(ev)
        superseded = False
        for j in range(i + 1, min(i + 1 + _FOCUS_LOOKAHEAD, len(events))):
            nxt = events[j]
            nxt_action = (nxt.get("action") or {}).get("action")
            if nxt_action not in _ELEMENT_ACTIONS:
                continue
            if focus_key and _selector_key(nxt) == focus_key:
                superseded = True
                break
        if not superseded:
            out.append(ev)
    return out


def collapse_select_interaction_noise(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse click/type noise bracketing a `select` event on the same element into just the
    `select` — it already carries the authoritative committed value, so a preceding click (opens
    the dropdown), a following click (closes it), and a type-ahead "type" flush (a select's own
    native jump-to-option typing, which is not text entry) are pure noise once it exists. Without
    this, one dropdown pick can compile into 3-4 separate steps for no reason — general to every
    `<select>`, not specific to date pickers (react-datepicker's month/year dropdowns are exactly
    where this was found, but it applies identically to any ordinary form select)."""
    out: list[dict[str, Any]] = []
    n = len(events)
    i = 0
    while i < n:
        ev = events[i]
        if (ev.get("action") or {}).get("action") != "select":
            out.append(ev)
            i += 1
            continue
        key = _selector_key(ev)
        if key:
            # Absorb noise already appended to `out` immediately before this select.
            absorbed = 0
            while (
                absorbed < _SELECT_NOISE_LOOKAROUND
                and out
                and (out[-1].get("action") or {}).get("action") in _SELECT_NOISE_ACTIONS
                and _selector_key(out[-1]) == key
            ):
                out.pop()
                absorbed += 1
        out.append(ev)
        i += 1
        if key:
            # Absorb noise immediately following this select, same element, bounded lookaround.
            absorbed = 0
            while (
                absorbed < _SELECT_NOISE_LOOKAROUND
                and i < n
                and (events[i].get("action") or {}).get("action") in _SELECT_NOISE_ACTIONS
                and _selector_key(events[i]) == key
            ):
                i += 1
                absorbed += 1
    return out


def dedupe_scroll_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop consecutive scroll events with identical fingerprints and scroll offsets."""
    out: list[dict[str, Any]] = []
    for ev in events:
        if ev.get("action", {}).get("action") != "scroll":
            out.append(ev)
            continue
        if out and out[-1].get("action", {}).get("action") == "scroll":
            prev = out[-1]
            same_scroll = prev.get("visual", {}).get("scroll_position") == ev.get("visual", {}).get(
                "scroll_position"
            )
            same_fp = prev.get("state_change", {}).get("after") == ev.get("state_change", {}).get(
                "after"
            )
            if same_scroll and same_fp:
                continue
        out.append(ev)
    return out
