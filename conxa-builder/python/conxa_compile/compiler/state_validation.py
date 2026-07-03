"""Scroll optimization, DOM state snapshots/diffs, and validation-from-diff.

Split out of the former compiler/v3.py (a versioned filename with no v1/v2
siblings — retired). This half of that module compares before/after page
state to infer validation blocks and wait conditions.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

from conxa_compile.compiler.action_semantics import action_name
from conxa_compile.compiler.decision_layer import infer_compiled_validation
from conxa_compile.compiler.validation_planner import infer_wait_for_shape
from conxa_compile.compiler.wait_for_shape import is_wait_group, leaf_wait_type
from conxa_compile.policy.bundle import get_policy_bundle

Step = dict[str, Any]


def optimize_scroll(step: Step) -> dict[str, Any] | str:
    if action_name(step) != "scroll":
        return action_name(step)
    return "scroll"


def scroll_payload(step: Step, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    if action_name(step) != "scroll":
        return {}
    pol = policy or get_policy_bundle().data
    sd = pol.get("scroll_defaults") if isinstance(pol.get("scroll_defaults"), dict) else {}
    extras = step.get("extras") if isinstance(step.get("extras"), dict) else {}
    try:
        delta = int(extras.get("scroll_amount")) if extras.get("scroll_amount") is not None else int(sd.get("delta", 150))
    except (TypeError, ValueError):
        delta = int(sd.get("delta", 150))
    return {
        "action": "scroll",
        "delta": delta,
    }


def _fingerprint(state: dict[str, Any]) -> str:
    payload = {
        "url": state.get("url") or "",
        "title": state.get("page_title") or "",
        "elements": state.get("visible_key_elements") or [],
        "texts": state.get("important_text_blocks") or [],
    }
    return hashlib.sha256(repr(payload).encode("utf-8")).hexdigest()


def capture_state_snapshot(step: Step, *, before: bool) -> dict[str, Any]:
    page = step.get("page") or {}
    target = step.get("target") or {}
    context = step.get("context") or {}
    selectors = step.get("selectors") or {}
    state_change = step.get("state_change") or {}
    state_text = str(state_change.get("before" if before else "after") or "")
    visible = [
        str(selectors.get("aria") or ""),
        str(selectors.get("text_based") or ""),
        str(selectors.get("css") or ""),
        str(target.get("tag") or ""),
    ] + [str(s) for s in (context.get("siblings") or [])[:6]]
    target_text = str(target.get("inner_text") or "").strip()
    if action_name(step) == "scroll":
        target_text = ""
    state = {
        "url": str(page.get("url") or ""),
        "page_title": str(page.get("title") or ""),
        "visible_key_elements": [x for x in visible if x],
        "important_text_blocks": [
            x
            for x in [target_text[:240], state_text.strip()[:240]]
            if x
        ][:4],
    }
    state["dom_fingerprint"] = _fingerprint(state)
    return state


def compare_state(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    b_elements = set(before.get("visible_key_elements") or [])
    a_elements = set(after.get("visible_key_elements") or [])
    b_text = set(before.get("important_text_blocks") or [])
    a_text = set(after.get("important_text_blocks") or [])
    n_new = sorted(a_elements - b_elements)
    n_rem = sorted(b_elements - a_elements)
    n_txt = sorted(a_text - b_text)
    strength = min(1.0, (len(n_new) + len(n_rem) + len(n_txt)) / 20.0)
    return {
        "url_changed": str(before.get("url") or "") != str(after.get("url") or ""),
        "dom_changed": str(before.get("dom_fingerprint") or "") != str(after.get("dom_fingerprint") or ""),
        "new_elements": n_new,
        "removed_elements": n_rem,
        "text_change": n_txt,
        "evidence_strength": strength,
    }


def validation_from_diff(
    action: str,
    intent: str,
    state_diff: dict[str, Any],
    timeout: int,
    *,
    page_url: str = "",
    source_step: dict[str, Any] | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    pol = policy or get_policy_bundle().data
    validation_step = source_step or {
        "action": {"action": action},
        "semantic": {"llm_intent": intent},
        "timing": {"timeout": timeout},
    }
    return infer_compiled_validation(validation_step, state_diff, page_url, pol)


def fix_validation(
    step: dict[str, Any],
    state_diff: dict[str, Any] | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Infer wait shape from action + observed diff (event-driven)."""
    pol = policy or get_policy_bundle().data
    sd = state_diff if isinstance(state_diff, dict) else {}
    return infer_wait_for_shape(step, sd, pol)


def _placeholder_leaf_ok(node: dict[str, Any]) -> bool:
    t = leaf_wait_type(node)
    if t in {"", "none"}:
        return True
    return t in {"url_change", "element_appear", "element_disappear", "intent_outcome", "dom_change"}


def _placeholder_tree_ok(node: dict[str, Any]) -> bool:
    """Recursive AND/OR placeholder (real executors should replace with browser checks)."""
    if is_wait_group(node):
        op = str(node.get("op") or "").strip().lower()
        kids = [c for c in (node.get("conditions") or []) if isinstance(c, dict)]
        if not kids:
            return False
        if op == "and":
            return all(_placeholder_tree_ok(c) for c in kids)
        if op == "or":
            return any(_placeholder_tree_ok(c) for c in kids)
        return False
    return _placeholder_leaf_ok(node)


def wait_for_condition(step: dict[str, Any], timeout: int = 8000) -> bool:
    """Deterministic polling helper for execution-layer validators."""
    raw = ((step.get("validation") or {}).get("wait_for") or {})
    wf = dict(raw) if isinstance(raw, dict) else {}
    if not wf:
        return True
    deadline = time.monotonic() + max(100, int(timeout)) / 1000.0
    while time.monotonic() < deadline:
        time.sleep(0.05)
        if _placeholder_tree_ok(wf):
            return True
    return False
