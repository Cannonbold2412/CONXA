"""BUILD-30: detect a virtualized-list scroll container from the recorded ancestor chain.

A virtualized grid (AG Grid, react-window, TanStack Virtual, Angular CDK) only renders the rows
currently in the scrolled viewport — a target row recorded further down the list is not in the
DOM at all until the runtime scrolls it into range. Without this, a virtualized row's step fails
identically to genuine breakage (see runtime/app/resolution.js's scroll-and-re-gather, which
reads handler_hints.virtualized_container).

Deterministic only, built from the ancestor chain and outer_html the recorder already captures
(bridge.js::captureAncestors) — same no-LLM path, and the same event shape, as
entity_binding.py::detect_entity_binding, whose row search this module runs alongside rather
than duplicates (reuses its selector-building primitives below).

Note: captureAncestors truncates outer_html at 2000 chars (bridge.js), so counting an ancestor's
rendered row children from it systematically undercounts on a real grid — that is why the
row-count signal below is corroborating only and never fires detection by itself.
"""

from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

from conxa_compile.compiler.entity_binding import _css_class_selector
from conxa_compile.compiler.selector_filters import is_dynamic_id
from conxa_compile.compiler.stable_hash import strip_dynamic_classes

Step = dict[str, Any]

# Wider than entity_binding's _MAX_ROW_SEARCH_DEPTH (3) — the scroll viewport that virtualizes
# rows sits above the row container itself, not at the row level.
_MAX_SEARCH_DEPTH = 6

_LIBRARY_CLASS_MARKERS = (
    "ag-body-viewport", "ag-center-cols-viewport",
    "reactvirtualized__grid", "reactvirtualized__list",
    "react-window", "rc-virtual-list-holder",
    "cdk-virtual-scroll-viewport", "vue-recycle-scroller", "virtual-scroll",
)

_OVERFLOW_STYLE_RE = re.compile(r"overflow(?:-y)?\s*:\s*(auto|scroll)", re.IGNORECASE)
_FIXED_HEIGHT_STYLE_RE = re.compile(r"(?:max-)?height\s*:\s*\d", re.IGNORECASE)
_ARIA_COUNT_ATTRS = ("aria-rowcount", "aria-setsize")
# How much an ancestor's declared row count must exceed what's actually rendered inside its
# (possibly truncated) outer_html before the row-count signal is allowed to corroborate at all.
_ARIA_OVERCOUNT_RATIO = 3.0


def _has_library_marker(classes: list[str]) -> bool:
    lowered = [c.lower() for c in classes]
    return any(marker in c for c in lowered for marker in _LIBRARY_CLASS_MARKERS)


def _root_from_outer_html(outer_html: str):
    if not outer_html:
        return None
    try:
        soup = BeautifulSoup(outer_html, "html.parser")
    except Exception:
        return None
    return soup.find(True)


def _has_scroll_viewport_style(outer_html: str) -> bool:
    """Strong signal on its own: an inline overflow + a fixed height — exactly what
    react-window/react-virtualized emit on the element they manage."""
    root = _root_from_outer_html(outer_html)
    if root is None:
        return False
    style = str(root.get("style") or "")
    return bool(style and _OVERFLOW_STYLE_RE.search(style) and _FIXED_HEIGHT_STYLE_RE.search(style))


def _has_scroll_overflow(outer_html: str) -> bool:
    """Weak signal: overflow alone, no fixed-height requirement — only ever paired with the
    row-count overcount below, never sufficient by itself."""
    root = _root_from_outer_html(outer_html)
    if root is None:
        return False
    style = str(root.get("style") or "")
    return bool(style and _OVERFLOW_STYLE_RE.search(style))


def _aria_row_overcount_ratio(outer_html: str) -> float:
    """declared / rendered from aria-rowcount|aria-setsize vs. actual role="row" descendants
    (or, failing that, all descendants) in this ancestor's own outer_html. 0.0 when there's no
    declared count to compare against."""
    root = _root_from_outer_html(outer_html)
    if root is None:
        return 0.0
    declared = 0
    for attr in _ARIA_COUNT_ATTRS:
        raw = str(root.get(attr) or "").strip()
        if raw.isdigit():
            declared = max(declared, int(raw))
    if declared <= 0:
        return 0.0
    rendered = len(root.find_all(attrs={"role": "row"})) or len(root.find_all(True))
    return declared / rendered if rendered > 0 else float(declared)


def _selector_for(node: dict[str, Any], tag: str, classes: list[str]) -> str:
    node_id = str(node.get("id") or "").strip()
    if node_id and not is_dynamic_id(f"#{node_id}"):
        return f"#{node_id}"
    class_suffix = _css_class_selector(classes)
    if class_suffix:
        return f"{tag}{class_suffix}"
    return tag


def detect_virtualized_container(ev: Step) -> str:
    """Pure, single-event: walk the recorded ancestor chain outward for a scroll container
    that virtualizes its rows. Returns "" when nothing qualifies — the common, correct outcome.
    A false positive costs one wasted scroll pass at replay, so this stays conservative: the
    row-count signal alone (see module docstring on outer_html truncation) never qualifies by
    itself, only alongside a plain overflow style."""
    ancestors = ev.get("ancestors") or []
    for i in range(min(len(ancestors), _MAX_SEARCH_DEPTH)):
        node = ancestors[i] or {}
        tag = str(node.get("tag") or "").strip().lower()
        if not tag:
            continue
        classes = strip_dynamic_classes([str(c) for c in (node.get("classes") or [])])
        outer_html = str(node.get("outer_html") or "")

        qualifies = _has_library_marker(classes) or _has_scroll_viewport_style(outer_html)
        if not qualifies:
            qualifies = (
                _has_scroll_overflow(outer_html)
                and _aria_row_overcount_ratio(outer_html) >= _ARIA_OVERCOUNT_RATIO
            )
        if not qualifies:
            continue

        return _selector_for(node, tag, classes)
    return ""
