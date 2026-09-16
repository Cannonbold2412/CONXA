"""Deterministic identity synthesis for a runtime-observed overlay control (BUILD-26 stage f).

`bundle_from_descriptor` turns one control descriptor from `overlays.jsonl`
(`runtime/app/page_scripts.js::overlayProbe`'s `controlDescriptor` — the same six fields
`resolver.js::scoreCandidate` reads: role/name/text/testid/anchorNeighbors) into an
IdentityBundle, using the SAME durability table and orthogonality classes the primary compiler
uses (`compiler/selector_score.py`, `compiler/selector_grammar.py`) — no re-typed numbers, no LLM.

This is deliberately narrower than `compiler/identity_bundle.py::generate_deterministic_signals`:
that function works from a full recorded event plus a DOM/a11y snapshot (uniqueness-gated,
relational anchors, CSS/XPath fallbacks). An overlay observation carries none of that — just one
element's descriptor — so only the signals a descriptor alone can support are built: testid,
css-id, role+name, text. `unique_at_compile` is always False (no snapshot to verify against,
matching uniqueness_gate's own "couldn't confirm" convention, never "not unique").

Every signal is filtered through the SAME `selector_passes_filters` gate a compile-time signal
clears — the "LLM does not write selector strings" invariant's sibling for runtime-observed
identity: nothing here is model output, but it is still a selector proposed into a compiled step,
so it earns no exemption from the quality gates a compiler-authored one clears.
"""

from __future__ import annotations

import re
from typing import Any

from conxa_compile.compiler.selector_filters import selector_passes_filters
from conxa_compile.compiler.selector_grammar import to_playwright_grammar
from conxa_compile.compiler.selector_score import rank_by_durability
from conxa_compile.compiler.stable_hash import compute_stable_hash
from conxa_core.models.skill_spec import ElementFingerprint, IdentityBundle, IdentitySignal

# Native Playwright internal: grammar — exempt from selector_passes_filters, mirroring
# identity_bundle.py's _NATIVE_ENGINES (testid/role/text_based pass by construction; there is no
# relational signal here since that needs a stable anchor phrase this descriptor doesn't carry).
_NATIVE_ENGINES = frozenset({"testid", "role", "text_based"})

_ID_UNSAFE_RE = re.compile(r"[^a-zA-Z0-9_-]")


def _css_escape_ident(value: str) -> str:
    return _ID_UNSAFE_RE.sub(lambda m: f"\\{m.group(0)}", value)


def bundle_from_descriptor(descriptor: dict[str, Any]) -> IdentityBundle | None:
    """Returns None when nothing in the descriptor survives filtering — the caller then falls
    back to a try_dismiss proposal, which needs no bundle at all."""
    if not isinstance(descriptor, dict):
        return None

    tag = str(descriptor.get("tag") or "").strip().lower()
    role = str(descriptor.get("role") or "").strip()
    name = str(descriptor.get("name") or "").strip()
    text = str(descriptor.get("text") or "").strip()
    testid = str(descriptor.get("testid") or "").strip()
    el_id = str(descriptor.get("id") or "").strip()
    anchors = [str(a).strip() for a in (descriptor.get("anchorNeighbors") or []) if str(a).strip()]

    candidates: list[tuple[str, str]] = []
    if testid:
        candidates.append(("testid", to_playwright_grammar("testid", f'[data-testid="{testid}"]')))
    if el_id:
        candidates.append(("css-id", f"#{_css_escape_ident(el_id)}"))
    if role and name:
        candidates.append(("role", to_playwright_grammar("role", role, name)))
    if text:
        candidates.append(("text_based", to_playwright_grammar("text", text)))

    if not candidates:
        return None

    ranked = rank_by_durability(candidates, testid_present=bool(testid))
    signals: list[IdentitySignal] = []
    for durability, engine, selector, orthogonality_class in ranked:
        if engine not in _NATIVE_ENGINES and not selector_passes_filters(selector):
            continue
        signals.append(IdentitySignal(
            engine=engine,
            selector=selector,
            durability=durability,
            orthogonality_class=orthogonality_class,
            unique_at_compile=False,
            source="runtime",
        ))
    if not signals:
        return None

    fingerprint = ElementFingerprint(
        role=role, tag=tag, inner_text=text[:120], aria_label=name if name != text else "",
        name=name, data_testid=testid, anchor_phrases=anchors[:5],
    )
    stable_hash = compute_stable_hash({
        "tag": tag, "attributes": {"id": el_id} if el_id else {},
        "aria_label": name, "inner_text": text,
    })
    return IdentityBundle(signals=signals, fingerprint=fingerprint, stable_hash=stable_hash)


if __name__ == "__main__":
    # ponytail: smallest runnable self-check — a testid-bearing control survives with a contract
    # signal, a name-only control falls through to role/text, and an empty descriptor returns None.
    bundle = bundle_from_descriptor({
        "tag": "button", "role": "button", "name": "Accept", "text": "Accept",
        "testid": "cookie-accept", "id": "cookie-accept-btn", "anchorNeighbors": ["We use cookies"],
    })
    assert bundle is not None
    assert bundle.signals[0].engine == "testid", [s.engine for s in bundle.signals]
    assert bundle.fingerprint.data_testid == "cookie-accept"
    assert bundle.stable_hash

    text_only = bundle_from_descriptor({"tag": "button", "role": "", "name": "", "text": "Got it"})
    assert text_only is not None
    assert text_only.signals[0].engine == "text_based"

    assert bundle_from_descriptor({"tag": "div", "role": "", "name": "", "text": ""}) is None
    assert bundle_from_descriptor(None) is None

    print("ok")
