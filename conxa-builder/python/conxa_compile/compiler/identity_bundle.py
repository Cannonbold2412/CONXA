"""Deterministic-floor IdentitySignal generator (zero-LLM).

Generates the base signal set from recorded event attributes using Playwright's
native internal: grammar. LLM enrichment only runs on gaps not covered here.
"""

from __future__ import annotations

import re
from typing import Any

from conxa_compile.compiler.selector_filters import (
    dedup_by_orthogonality,
    is_low_quality_anchor,
    selector_passes_filters,
    uniqueness_gate,
)
from conxa_compile.compiler.selector_score import rank_by_durability
from conxa_compile.compiler.selector_grammar import to_playwright_grammar
from conxa_core.models.skill_spec import IdentitySignal

_EXCLUDED_ROLES = frozenset({
    "none", "presentation", "div", "span", "input", "path", "svg", "g", "generic",
})

# Engines for which we skip the selector_passes_filters check (internal: grammar passes it)
_NATIVE_ENGINES = frozenset({"testid", "role", "text_based", "relational"})


def generate_deterministic_signals(
    ev: dict[str, Any],
    dom_html: str | None = None,
    a11y_tree: dict[str, Any] | None = None,
) -> list[IdentitySignal]:
    """Return durability-ranked, orthogonality-deduplicated IdentitySignal list (no LLM).

    Produces signals in Playwright's native internal: grammar where applicable.
    Falls back to raw CSS/XPath for structural signals.

    `dom_html`/`a11y_tree` are the recorded page's snapshot (see
    conxa_core.storage.snapshots) used by uniqueness_gate to mark each signal
    unique_at_compile; omit when no snapshot was captured for this event.
    """
    target = ev.get("target") or {}
    semantic = ev.get("semantic") or {}
    selectors = ev.get("selectors") or {}

    candidates: list[tuple[str, str]] = []

    # 1. testid (highest durability) — preserves the exact attribute name (data-testid or data-test-id)
    testid_attr, data_testid = _extract_testid(selectors)
    if data_testid:
        candidates.append(("testid", to_playwright_grammar("testid", f'[{testid_attr}="{data_testid}"]')))

    # 2. role + name (semantic-aria)
    role = str(semantic.get("role") or target.get("role") or "").strip()
    # label_text stays last: it's the nearest external <label>'s text, not the element's
    # own attribute, and can mis-capture a sibling's text (see runtime/run.js:1084-1093's
    # a11yRecoveryName, which documents the same risk for its identical last-resort use).
    ax_name = (
        str(target.get("aria_label") or "")
        or str(target.get("name") or "")
        or str(target.get("inner_text") or "")[:80]
        or str(target.get("placeholder") or "")
        or str(target.get("label_text") or "")
    ).strip()
    if role and ax_name and role.lower() not in _EXCLUDED_ROLES:
        candidates.append(("role", to_playwright_grammar("role", role, ax_name)))

    # 3. text-based (visible-text)
    text_val = str(selectors.get("text_based") or "").strip()
    if text_val:
        candidates.append(("text_based", to_playwright_grammar("text", text_val)))

    # 4. relational from first *stable* (non-ephemeral) anchor phrase (spatial-anchor)
    anchor_phrases = [
        str(a.get("element") or "").strip()
        for a in (ev.get("anchors") or [])
        if a.get("element")
    ]
    stable_anchors = [p for p in anchor_phrases if p and not is_low_quality_anchor(p)]
    if stable_anchors and role and ax_name and role.lower() not in _EXCLUDED_ROLES:
        anchor = stable_anchors[0]
        rel_sel = f'internal:role={role}[name="{ax_name}"] >> right-of=internal:text="{anchor}"'
        candidates.append(("relational", rel_sel))

    # 5. CSS (structural fallback)
    css_sel = str(selectors.get("css") or "").strip()
    if css_sel:
        engine = "css-id" if re.search(r"#[a-zA-Z][\w-]*", css_sel) else "css-structural"
        candidates.append((engine, css_sel))

    # 6. XPath (lowest durability)
    xpath_sel = str(selectors.get("xpath") or "").strip()
    if xpath_sel:
        candidates.append(("xpath", xpath_sel))

    testid_present = bool(data_testid)
    ranked = rank_by_durability(candidates, testid_present=testid_present)

    signals: list[IdentitySignal] = []
    for dur, engine, sel, oc in ranked:
        if engine not in _NATIVE_ENGINES and not selector_passes_filters(sel):
            continue
        # absent_ok=True: a 0-match verdict here means "couldn't confirm", not "not unique" — see
        # uniqueness_gate's docstring. Without it, snapshot gaps (e.g. a modal captured before it
        # mounted) wrongly stamped real, durable selectors as unverified.
        unique = uniqueness_gate(sel, dom_html, a11y_tree, absent_ok=True)
        signals.append(IdentitySignal(
            engine=engine,
            selector=sel,
            durability=dur,
            orthogonality_class=oc,
            unique_at_compile=unique,
            source="compiler",
        ))

    return dedup_by_orthogonality(signals)


_TESTID_RE = re.compile(r'(data-test(?:-?id)?)=["\']?([^"\'>\s\]]+)')


def _extract_testid(selectors: dict[str, Any]) -> tuple[str, str]:
    """Returns (attr_name, value) for the first testid attr found, or ('', '')."""
    for key in ("css", "aria"):
        s = str(selectors.get(key) or "")
        m = _TESTID_RE.search(s)
        if m:
            return m.group(1), m.group(2)
    return "", ""
