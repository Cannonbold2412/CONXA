"""Deterministic selector quality gates (shared by ranking + stable selector build)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from conxa_core.models.skill_spec import IdentitySignal


def is_dynamic_id(selector: str) -> bool:
    if not selector.startswith("#"):
        return False
    value = selector[1:]
    if not value:
        return True
    if value.startswith("_r_"):
        return True
    if re.search(r"[:][a-z0-9]{6,}", value, re.I):
        return True
    if re.search(r"-[a-f0-9]{8,}\b", value, re.I):
        return True
    return bool(re.search(r"\d", value) and re.search(r"[_\-]", value))


def is_unstable_generated_css_fragment(selector: str) -> bool:
    """Heuristic for hashed / scoped class segments in attribute selectors (not full parser)."""
    s = selector.strip()
    if len(s) < 24:
        return False
    if re.search(r"\[[^\]]{80,}\]", s):
        return True
    if s.count("[class") >= 2 and re.search(r"[a-f0-9]{6,}", s, re.I):
        return True
    return False


_INVALID_ARIA_ROLE_TOKENS = frozenset(
    {
        "path",
        "svg",
        "g",
        "div",
        "span",
        "none",
        "presentation",
        "input",
    }
)


def is_invalid_aria_semantic_role(selector: str) -> bool:
    """Reject selectors that claim impossible / non-interactive ARIA roles."""
    m = re.search(r'\[role=["\']([^"\']+)["\']', selector, re.I)
    if not m:
        return False
    r = str(m.group(1) or "").strip().lower()
    return r in _INVALID_ARIA_ROLE_TOKENS


def is_valid_selector(selector: str) -> bool:
    if not selector:
        return False
    normalized = selector.strip()
    if not normalized:
        return False
    lowered = normalized.lower()
    if lowered in {'[role="input"]', "[role='input']"}:
        return False
    if lowered.startswith("[role=") and "input" in lowered:
        return False
    if is_invalid_aria_semantic_role(normalized):
        return False
    return True


def is_weak_literal_token(selector: str) -> bool:
    """Reject bare words mistaken for selectors (e.g. field name tokens)."""
    s = selector.strip()
    if not s:
        return True
    lowered = s.lower()
    if lowered.startswith(("[", "#", ".", "/", "*", "(")):
        return False
    for prefix in ("input", "button", "textarea", "select", "form", "option", "label", "svg", "path", "a[", "a."):
        if lowered.startswith(prefix):
            return False
    if "text=" in lowered:
        return False
    if re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]*", s) and len(s) < 48:
        return True
    return False


def is_brittle_deep_chain(selector: str, *, max_xpath_segments: int = 10, max_css_child_depth: int = 6) -> bool:
    """Heuristic: very long positional CSS or XPath trees are fragile."""
    s = selector.strip()
    if not s:
        return False
    if s.startswith("/"):
        parts = [p for p in re.split(r"/+", s) if p and p not in (".",)]
        depth = len(parts)
        return depth > max_xpath_segments
    if ">" in s:
        depth = s.count(">") + 1
        return depth > max_css_child_depth
    if len(s) > 220:
        return True
    return False


def _strip_invalid_role_fragments(selector: str) -> str:
    """Remove [role="<invalid>"] fragments from compound aria selectors.

    '[role="input"][name="Search services"]' → '[name="Search services"]'
    Lets useful name/testid attributes survive a bad role token from bridge.js.
    """
    return re.sub(
        r'\[role=["\']([^"\']+)["\']\]',
        lambda m: "" if m.group(1).strip().lower() in _INVALID_ARIA_ROLE_TOKENS else m.group(0),
        selector,
    ).strip()


def filter_selectors_dict(selectors: dict[str, Any] | None) -> dict[str, Any]:
    """Strip selector channels that fail quality gates before persisting to skill steps."""
    if not isinstance(selectors, dict):
        return {}
    out: dict[str, Any] = dict(selectors)
    for key in ("css", "aria", "text_based", "xpath", "name"):
        raw = out.get(key)
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            out[key] = ""
            continue
        if selector_passes_filters(s):
            out[key] = s
            continue
        # For aria selectors with an invalid role token, try salvaging the rest
        if key == "aria" and is_invalid_aria_semantic_role(s):
            salvaged = _strip_invalid_role_fragments(s)
            if salvaged and selector_passes_filters(salvaged):
                out[key] = salvaged
                continue
        out[key] = ""
    return out


def selector_passes_filters(selector: str) -> bool:
    if not is_valid_selector(selector):
        return False
    if is_weak_literal_token(selector):
        return False
    if is_dynamic_id(selector):
        return False
    if is_unstable_generated_css_fragment(selector):
        return False
    if is_brittle_deep_chain(selector):
        return False
    return True


def prefilter_selector_candidate(selector: str) -> bool:
    """Gate before scoring: same as selector_passes_filters (explicit alias for ranking pipelines)."""
    return selector_passes_filters(selector)


# ---------------------------------------------------------------------------
# Phase 2 compile-time gates (Final Selector Architecture)
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_METACHAR_RE = re.compile(r"[>+~|^$]")  # CSS combinators / unsanitisable metacharacters


def _count_selector_matches_dom(selector: str, dom: dict[str, Any]) -> int:
    """Minimal DOM counter for common selector patterns (data-testid, aria-label, text=)."""
    selector = selector.strip()
    if not selector:
        return 0
    m = re.match(r'\[data-testid=["\']?([^"\']+)["\']?\]', selector)
    if m:
        return _count_attr(dom, "data-testid", m.group(1))
    m = re.match(r'\[aria-label=["\']?([^"\']+)["\']?\]', selector)
    if m:
        return _count_attr(dom, "aria-label", m.group(1))
    m = re.match(r'text=["\']?([^"\']+)["\']?', selector)
    if m:
        return _count_text(dom, m.group(1))
    return 1  # complex selectors: assume unique


def _count_attr(dom: dict[str, Any], attr: str, value: str) -> int:
    count = 0
    if isinstance(dom, dict):
        attrs = dom.get("attributes") or {}
        if isinstance(attrs, dict) and str(attrs.get(attr) or "") == value:
            count = 1
        for child in dom.get("children") or []:
            count += _count_attr(child, attr, value)
    return count


def _count_text(dom: dict[str, Any], text: str) -> int:
    count = 0
    if isinstance(dom, dict):
        inner = str(dom.get("inner_text") or "").strip()
        if inner.lower() == text.lower() or text.lower() in inner.lower():
            count = 1
        for child in dom.get("children") or []:
            count += _count_text(child, text)
    return count


def uniqueness_gate(selector: str, dom_snapshot: dict[str, Any] | None) -> bool:
    """Return True if selector matches exactly 1 node in the recorded DOM snapshot.

    Returns True when no snapshot is available (can't verify, allow through).
    """
    if not dom_snapshot:
        return True
    return _count_selector_matches_dom(selector, dom_snapshot) == 1


def dedup_by_orthogonality(signals: list["IdentitySignal"]) -> list["IdentitySignal"]:
    """Keep the highest-durability signal per orthogonality class; drop the rest."""
    best: dict[str, "IdentitySignal"] = {}
    for sig in signals:
        oc = sig.orthogonality_class
        if oc not in best or sig.durability > best[oc].durability:
            best[oc] = sig
    # Return in original durability-descending order
    kept = set(id(s) for s in best.values())
    return [s for s in signals if id(s) in kept]


def pii_bind(
    selector: str, inputs: dict[str, Any] | None = None
) -> tuple[str, bool]:
    """Replace PII literals in selector with {{var}} references.

    Returns (modified_selector, was_bound). If un-escapable metacharacters remain
    after binding, returns ("", True) to signal the selector must be dropped.
    """
    modified = selector
    bound = False

    # Replace email addresses
    if _EMAIL_RE.search(modified):
        modified = _EMAIL_RE.sub("{{email}}", modified)
        bound = True

    # Replace input literal values found verbatim in selector
    if inputs:
        for key, val in inputs.items():
            if not val or not isinstance(val, str) or len(val) < 4:
                continue
            if val in modified:
                modified = modified.replace(val, f"{{{{{key}}}}}")
                bound = True

    if bound and _METACHAR_RE.search(modified.replace("{{", "").replace("}}", "")):
        return ("", True)

    return (modified, bound)


def xpath_shadow_guard(engine: str, shadow_path: list[Any] | None) -> bool:
    """Return False (block) if engine is xpath and shadow_path is non-empty.

    XPath cannot cross shadow roots; such selectors must be dropped.
    """
    if not shadow_path:
        return True
    return engine != "xpath"


# ---------------------------------------------------------------------------
# Ephemeral-anchor filter (used by spatial-anchor / relational signal builders)
# ---------------------------------------------------------------------------

_EPHEMERAL_ANCHOR_KEYWORDS = frozenset({
    "cookie",
    "consent",
    "gdpr",
    "ccpa",
    "banner",
    "popup",
    "pop-up",
    "pop up",
    "newsletter",
    "subscribe",
    "notification",
    "we use cookies",
    "accept all",
    "manage preferences",
})


def is_ephemeral_anchor(phrase: str) -> bool:
    """Return True if an anchor phrase names a transient overlay unsuitable as a durable
    spatial anchor (cookie/consent banners, popups, newsletter prompts, notification toasts).

    These elements are typically absent, dismissed, or repositioned at replay time, making
    them the worst-possible reference points for relational selectors.
    """
    lowered = phrase.strip().lower()
    return any(kw in lowered for kw in _EPHEMERAL_ANCHOR_KEYWORDS)
