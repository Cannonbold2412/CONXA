"""LLM-assisted selector regeneration for the 1-click fix API (Phase 6 patch flow).

When a user edits a step's target element in the workflow editor, `patch.py`
re-runs selector generation against the original recorded DOM snapshot with the
new bounding box, so the compiled selector list matches the corrected element.
This is the one place outside the primary compile pipeline where selector
strings are still produced by an LLM call rather than by `IdentityBundle` +
`selector_grammar.py` — see `patch.py::_regenerate_compiled_selectors`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from conxa_core.config import settings
from conxa_compile.llm.openapi_client import (
    SelectorCandidate,
    generate_selector_candidates,
)
from conxa_core.storage import selector_cache, snapshots


_TOO_GENERIC = {"button", "div", "span", "input", "a", "form", "li", "ul", "p", "h1", "h2", "h3"}
_FORBIDDEN_PREFIXES = ("/", "//", "xpath=", "xpath:")


@dataclass
class SelectorCompileTask:
    """Per-step input for the LLM selector generator."""

    step_index: int
    snapshot_ref: str
    snapshot_hash: str
    dom_path: str | None
    element_bbox: dict[str, int]
    element_ancestors: list[dict[str, Any]]
    surrounding_text: str
    action_type: str
    target_dom: dict[str, Any]  # tag, id, classes, inner_text, role, aria_label, name, placeholder
    a11y_path: str | None = None


def is_obviously_invalid(selector: str) -> bool:
    """Cheap rule-based filter before spending Playwright validation cycles."""
    s = (selector or "").strip()
    if not s or len(s) > 1024:
        return True
    low = s.lower()
    for pref in _FORBIDDEN_PREFIXES:
        if low.startswith(pref):
            return True
    if s in _TOO_GENERIC:
        return True
    if low.startswith(":has-text("):
        return True
    # Sanity: must contain at least one of CSS's selector hooks.
    if not re.search(r"[#.\[\]:>~+\s]|[a-z][a-z0-9-]*", low):
        return True
    return False


def _count_matches_in_html(selector: str, html: str) -> int:
    """Best-effort match count via parsing the recorded snapshot.

    Uses lxml parser to support modern CSS selectors (:has, :is, etc).
    Returns -1 if the parser can't evaluate the selector.
    """
    try:
        from bs4 import BeautifulSoup  # type: ignore
    except ImportError:
        return -1
    try:
        soup = BeautifulSoup(html or "", "lxml")
        matches = soup.select(selector)
        return len(matches)
    except Exception:  # noqa: BLE001 — selector grammar mismatch, etc.
        return -1


def validate_selector(selector: str, dom_snapshot: str | None) -> tuple[bool, int]:
    """Returns (passes, match_count). passes=True iff exactly one match.

    When BeautifulSoup is unavailable or the selector uses Playwright extensions
    not supported by html.parser, we accept the candidate (skip rule-based check)
    and let runtime Playwright validation decide.
    """
    if is_obviously_invalid(selector):
        return False, 0
    if not dom_snapshot:
        return True, -1
    n = _count_matches_in_html(selector, dom_snapshot)
    if n < 0:
        return True, -1
    return n == 1, n


def rank_candidates(candidates: list[SelectorCandidate]) -> list[SelectorCandidate]:
    """Stability ordering: testid > role+aria-label > aria-label > name > placeholder > text > tag+class."""

    def score(c: SelectorCandidate) -> tuple[int, int]:
        s = c.selector.lower()
        prio = 9
        if "data-testid" in s or "data-test-id" in s:
            prio = 0
        elif "[role=" in s and "aria-label" in s:
            prio = 1  # a11y-derived compound: most layout-tolerant
        elif "aria-label" in s:
            prio = 2
        elif "[name=" in s:
            prio = 3
        elif "[placeholder=" in s:
            prio = 4
        elif "#" in s:
            prio = 5
        elif ":has-text" in s or ":text" in s:
            prio = 6
        elif "nth-of-type" in s or "nth-child" in s:
            prio = 8
        return (prio, c.rank or 99)

    return sorted(candidates, key=score)


def _dom_snippet_for_llm(dom_snapshot: str, max_chars: int = 60000) -> str:
    """Trim the snapshot so it fits in the LLM context window.

    For very large pages we send the head plus the section around the element's
    deepest ancestor; for now a head-truncated slice keeps the prompt bounded.
    """
    if not dom_snapshot:
        return ""
    if len(dom_snapshot) <= max_chars:
        return dom_snapshot
    return dom_snapshot[:max_chars] + "\n<!-- truncated -->\n"


def _extract_a11y_node(
    tree: dict[str, Any] | None,
    target: dict[str, Any],
) -> dict[str, Any] | None:
    """Depth-first search for the a11y node matching target role + accessible name.

    Returns the first node whose role matches and whose accessible name contains
    the target's aria_label or inner_text (first 50 chars). Returns None if the
    tree is absent or no match is found — caller falls back to CSS-only path.
    """
    if not tree or not target:
        return None
    t_role = (target.get("role") or "").lower().strip()
    t_name = (target.get("aria_label") or target.get("inner_text") or "").strip().lower()[:50]

    def _walk(node: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(node, dict):
            return None
        n_role = (node.get("role") or "").lower().strip()
        n_name = (node.get("name") or "").strip().lower()
        if t_role and n_role == t_role:
            if not t_name or t_name in n_name:
                return node
        for child in node.get("children") or []:
            found = _walk(child)
            if found is not None:
                return found
        return None

    return _walk(tree)


def compile_selectors_for_task(
    task: SelectorCompileTask,
    *,
    session_id: str,
    model: str | None = None,
) -> list[SelectorCandidate]:
    """Generate, validate, rank, and cache selector candidates for one element."""
    # Cache lookup.
    effective_model = model or settings.llm_text_model or "default"
    cached = selector_cache.get(task.snapshot_hash, task.element_bbox, effective_model)
    if cached:
        return [SelectorCandidate.from_dict(c) for c in cached]

    # Load DOM snapshot for validation.
    dom_snapshot = snapshots.read_dom_snapshot(session_id, task.snapshot_hash) if task.snapshot_hash else None

    # Load a11y tree and extract the node matching this element (if available).
    a11y_node: dict[str, Any] | None = None
    if task.snapshot_hash:
        a11y_tree = snapshots.read_a11y_snapshot(session_id, task.snapshot_hash)
        if a11y_tree:
            a11y_node = _extract_a11y_node(a11y_tree, task.target_dom)

    raw_candidates = generate_selector_candidates(
        dom_snippet=_dom_snippet_for_llm(dom_snapshot or ""),
        element_bbox=task.element_bbox,
        element_ancestors=task.element_ancestors,
        surrounding_text=task.surrounding_text,
        action_type=task.action_type,
        target_dom=task.target_dom,
        a11y_node=a11y_node,
        candidates_wanted=settings.llm_selector_candidates,
        model=model,
    )
    if not raw_candidates:
        return []

    # Validate each candidate; discard obvious failures.
    validated: list[SelectorCandidate] = []
    for cand in raw_candidates:
        passes, _count = validate_selector(cand.selector, dom_snapshot)
        if passes:
            validated.append(cand)

    ranked = rank_candidates(validated)

    # Cache (even empty results) so we don't repeat doomed LLM calls.
    selector_cache.set(
        task.snapshot_hash,
        task.element_bbox,
        effective_model,
        [c.to_dict() for c in ranked],
    )
    return ranked


def task_from_recorded_event(ev: dict[str, Any], step_index: int) -> SelectorCompileTask:
    """Convert one raw recorded event dict into a SelectorCompileTask."""
    snapshot = ev.get("snapshot") or {}
    visual = ev.get("visual") or {}
    bbox = visual.get("bbox") or {}
    target = ev.get("target") or {}
    action = ev.get("action") or {}
    return SelectorCompileTask(
        step_index=step_index,
        snapshot_ref=str(snapshot.get("ref") or ""),
        snapshot_hash=str(snapshot.get("dom_hash") or ""),
        dom_path=snapshot.get("dom_path"),
        a11y_path=snapshot.get("a11y_path") or None,
        element_bbox={
            "x": int(bbox.get("x") or 0),
            "y": int(bbox.get("y") or 0),
            "w": int(bbox.get("w") or 0),
            "h": int(bbox.get("h") or 0),
        },
        element_ancestors=list(ev.get("ancestors") or []),
        surrounding_text=str(ev.get("surrounding_text") or ""),
        action_type=str(action.get("action") or ""),
        target_dom={
            "tag": str(target.get("tag") or ""),
            "id": target.get("id"),
            "classes": list(target.get("classes") or []),
            "inner_text": str(target.get("inner_text") or "")[:200],
            "role": target.get("role"),
            "aria_label": target.get("aria_label"),
            "name": target.get("name"),
            "placeholder": target.get("placeholder"),
        },
    )
