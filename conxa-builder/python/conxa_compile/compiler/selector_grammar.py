"""Round-trip grammar conversion between Playwright internal: grammar and public editor display.

The editor's selector list uses PUBLIC Playwright grammar (e.g. `role=button[name="New"]`,
`text="New"`) because edited selectors flow through `run.js:root.locator(str)` which accepts
the public engines but NOT `internal:` (a non-public Playwright API).

The IdentityBundle signals are stored in INTERNAL grammar (`internal:role=button[name="New"]`,
`internal:text="New"`) because `runtime/resolve_adapter.js:signalToLocator` pre-parses them
into `getByRole`/`getByText` calls rather than relying on `.locator()` to accept internal: strings.

These two functions are the only place in the codebase that converts between the two forms.
They are mutual inverses — `display_to_signal(signal_to_display(e, s)) == (e, s)` for all engines.
"""

from __future__ import annotations

import re
from typing import Any

from conxa_compile.compiler.selector_score import durability_score, tag_orthogonality_class


# ---------------------------------------------------------------------------
# Minimal internal-grammar helpers (inlined to avoid llm_selector_generator_v2's
# heavy import chain that instantiates Settings at module load time).
# ---------------------------------------------------------------------------

def _to_internal_role(role: str, name: str = "") -> str:
    """Convert role + accessible name to internal:role= grammar."""
    role_clean = re.sub(r"^internal:role=", "", role).split("[")[0].strip()
    if name:
        return f'internal:role={role_clean}[name="{name}"]'
    return f"internal:role={role_clean}"


def _to_internal_text(text: str) -> str:
    """Convert text value to internal:text= grammar."""
    clean = re.sub(r'^text=["\']?|["\']?$', '', text.strip())
    return f'internal:text="{clean}"'


def _to_internal_testid(value: str) -> str:
    """Convert a [data-testid="..."] or raw testid value to internal:testid= grammar."""
    m = re.match(r'^\[data-testid=["\']?([^"\'>\s\]]+)["\']?\]$', value)
    testid_val = m.group(1) if m else value
    return f'internal:testid=[data-testid="{testid_val}"]'

# Engines that use internal: grammar in storage but need public grammar in the editor.
_INTERNAL_GRAMMAR_ENGINES = frozenset({"testid", "role", "aria", "text", "text_based", "relational"})

# Regex patterns for engine inference from display strings.
_ROLE_RE = re.compile(r"^role=([a-zA-Z]+)(?:\[name=\"([^\"]*)\"\])?$")
_TEXT_RE = re.compile(r'^text=["\']?(.*?)["\']?$', re.DOTALL)
_TESTID_RE = re.compile(r'\[data-testid=["\']?([^"\'>\s\]]+)["\']?\]')
_INTERNAL_ROLE_RE = re.compile(r"^internal:role=([a-zA-Z]+)(?:\[name=\"([^\"]*)\"\])?")
_INTERNAL_TEXT_RE = re.compile(r'^internal:text="(.*)"$', re.DOTALL)


def signal_to_display(engine: str, selector: str) -> str:
    """Convert a stored (internal: grammar) signal selector to a readable, executable public string.

    Rules:
      internal:role=X[name="Y"]  →  role=X[name="Y"]
      internal:text="Y"          →  text="Y"
      internal:testid=...        →  [data-testid="..."]
      relational: convert inner internal:role=/internal:text= fragments to public, keep >> structure
      css / xpath / css-id / css-structural: verbatim
    """
    eng = engine.lower()
    s = (selector or "").strip()

    if eng in ("role", "aria"):
        m = _INTERNAL_ROLE_RE.match(s)
        if m:
            role_name = m.group(1)
            name_val = m.group(2)
            return f'role={role_name}[name="{name_val}"]' if name_val else f"role={role_name}"
        # Already in public form or unknown format — return as-is.
        return s

    if eng in ("text", "text_based"):
        m = _INTERNAL_TEXT_RE.match(s)
        if m:
            return f'text="{m.group(1)}"'
        # Strip internal: prefix if present.
        if s.startswith("internal:text="):
            return s[len("internal:"):]
        return s

    if eng == "testid":
        # Prefer the [data-testid="..."] CSS form as it's human-readable.
        m_i = re.match(r'^internal:testid=\[data-testid=["\']?([^"\'>\s\]]+)["\']?\]$', s)
        if m_i:
            return f'[data-testid="{m_i.group(1)}"]'
        # Already CSS form.
        m_c = _TESTID_RE.search(s)
        if m_c:
            return f'[data-testid="{m_c.group(1)}"]'
        return s

    if eng == "relational":
        # Convert inner internal:role= and internal:text= fragments to public grammar.
        # Pattern: internal:role=X[name="Y"] >> right-of=internal:text="Z"
        def _to_public(m: re.Match) -> str:
            raw = m.group(0)
            if raw.startswith("internal:role="):
                rm = _INTERNAL_ROLE_RE.match(raw)
                if rm:
                    n = rm.group(2)
                    return f'role={rm.group(1)}[name="{n}"]' if n else f"role={rm.group(1)}"
            if raw.startswith("internal:text="):
                tm = _INTERNAL_TEXT_RE.match(raw)
                if tm:
                    return f'text="{tm.group(1)}"'
                return raw[len("internal:"):]
            return raw

        result = re.sub(r"internal:(?:role|text)=[^\s>]+(?:\[[^\]]*\])?", _to_public, s)
        return result

    # css-id, css-structural, css, xpath — verbatim.
    return s


def display_to_signal(display: str) -> tuple[str, str]:
    """Convert a public display string back to (engine, stored_selector) in internal: grammar.

    Engine inference rules (first match wins):
      starts with role=           → engine=role,      stored=internal:role=X[name="Y"]
      starts with text=           → engine=text_based, stored=internal:text="Y"
      contains [data-testid=      → engine=testid,    stored=internal:testid=[data-testid="..."]
      starts with // or (//       → engine=xpath,     stored verbatim
      contains >> right-of=       → engine=relational, stored (convert public → internal inside)
      #id-only CSS                → engine=css-id,   stored verbatim
      else                        → engine=css-structural, stored verbatim
    """
    s = (display or "").strip()

    # Already in internal: grammar (idempotent — re-convert safely).
    if s.startswith("internal:role="):
        m = _INTERNAL_ROLE_RE.match(s)
        if m:
            return "role", s
        return "role", s

    if s.startswith("internal:text="):
        return "text_based", s

    if s.startswith("internal:testid="):
        return "testid", s

    # Public role grammar.
    m = _ROLE_RE.match(s)
    if m:
        stored = _to_internal_role(m.group(1), m.group(2) or "")
        return "role", stored

    # Public text grammar.
    if s.lower().startswith("text="):
        stored = _to_internal_text(s)
        return "text_based", stored

    # data-testid.
    m_t = _TESTID_RE.search(s)
    if m_t:
        stored = _to_internal_testid(s)
        return "testid", stored

    # Relational (contains >> right-of= / near=).
    if ">>" in s:
        def _to_internal(m: re.Match) -> str:
            raw = m.group(0)
            if raw.startswith("role="):
                rm = _ROLE_RE.match(raw)
                if rm:
                    return _to_internal_role(rm.group(1), rm.group(2) or "")
            if raw.lower().startswith("text="):
                return _to_internal_text(raw)
            return raw

        stored = re.sub(r"(?:role=[a-zA-Z]+(?:\[name=\"[^\"]*\"\])?|text=[^\s>]+)", _to_internal, s)
        return "relational", stored

    # XPath.
    if s.startswith("/") or s.startswith("(//"):
        return "xpath", s

    # CSS with stable id.
    if re.match(r"#[a-zA-Z][\w-]*$", s):
        return "css-id", s

    return "css-structural", s


def rebuild_identity_signals_from_target(step: dict[str, Any]) -> list[dict[str, Any]]:
    """Rebuild identity_bundle.signals from the step's target.primary_selector + fallback_selectors.

    Called by cmd_patch_step after saving an edited selector list. Preserves the existing
    bundle's other fields (fingerprint, frame_chain, etc.) — only signals are replaced.

    Editor order = signal priority (do NOT re-rank). Signals whose selector string is unchanged
    carry forward their existing unique_at_compile and durability. New/edited entries are
    source="user", unique_at_compile=False.

    Returns the new signals list as a list of plain dicts (JSON-serializable).
    """
    target = step.get("target") if isinstance(step.get("target"), dict) else {}
    primary = str(target.get("primary_selector") or "").strip()
    fallbacks = [str(s).strip() for s in (target.get("fallback_selectors") or []) if str(s).strip()]
    ordered = [s for s in [primary] + fallbacks if s]

    # Build lookup of existing signals by stored selector string for carry-forward.
    bundle = step.get("identity_bundle") if isinstance(step.get("identity_bundle"), dict) else {}
    existing: dict[str, dict[str, Any]] = {}
    for sig in (bundle.get("signals") or []):
        if isinstance(sig, dict) and sig.get("selector"):
            existing[str(sig["selector"])] = sig

    new_signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for display_str in ordered:
        if display_str in seen:
            continue
        seen.add(display_str)
        engine, stored_sel = display_to_signal(display_str)
        # Carry forward existing signal if the STORED selector is unchanged.
        if stored_sel in existing:
            ex = existing[stored_sel]
            new_signals.append({
                "engine": engine,
                "selector": stored_sel,
                "durability": ex.get("durability", durability_score(engine, stored_sel)),
                "orthogonality_class": ex.get("orthogonality_class", tag_orthogonality_class(engine)),
                "unique_at_compile": bool(ex.get("unique_at_compile", False)),
                "source": ex.get("source", "compiler"),
            })
        else:
            new_signals.append({
                "engine": engine,
                "selector": stored_sel,
                "durability": durability_score(engine, stored_sel),
                "orthogonality_class": tag_orthogonality_class(engine),
                "unique_at_compile": False,
                "source": "user",
            })

    return new_signals


def signals_to_display_list(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert IdentityBundle signals to the form used by the editor.

    Returns list of {selector (display string), engine, durability} dicts,
    durability-ordered (signals already come in durability order from the bundle).
    Filters out relational signals (they're derived context, not directly editable as text).
    """
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for sig in signals:
        if not isinstance(sig, dict):
            continue
        engine = str(sig.get("engine") or "")
        stored = str(sig.get("selector") or "").strip()
        if not stored:
            continue
        display = signal_to_display(engine, stored)
        if not display or display in seen:
            continue
        seen.add(display)
        result.append({
            "selector": display,
            "engine": engine,
            "durability": float(sig.get("durability") or 0.0),
        })
    return result
