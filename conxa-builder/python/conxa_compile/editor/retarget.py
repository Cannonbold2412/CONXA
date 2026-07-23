"""Preview-and-apply support for the 3-phase re-target wizard (Human Edit page).

Phase 1 (pick element on the screenshot) happens client-side. This module backs
Phase 2 (review generated selectors) and Phase 3 (confirm validation): both are
previewed here without persisting so the whole wizard lands as a single mutation
when the user finally clicks Apply — see ``apply_retarget``.

A redrawn region has no stored per-element geometry to resolve against — only the
originally-recorded element carries a bbox, and the DOM snapshot is plain HTML with no inline
coordinates. Selector regeneration therefore uses a vision LLM
(``llm/region_selector_vision.py``) that is shown the screenshot with the drawn region
highlighted alongside the recorded DOM, so it can identify the element visually and read the DOM
to select it. This is a second, narrow exception to "LLM does not write selector strings on the
primary compile path" (see CLAUDE.md Key Invariants), alongside the 1-click-fix API's
(``compiler/patch.py::_regenerate_compiled_selectors``) — both are user-initiated re-compile
paths, not part of the primary compiler. ``find_source_event`` is shared with that path.
"""

from __future__ import annotations

from typing import Any


class RetargetError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _is_frame_nested(step: dict[str, Any]) -> bool:
    """True if this step's element lives inside 1+ iframes. dom_html/dom_snapshot is always
    page.content() — the top-level document only — so any DOM-based uniqueness/match check
    against it is structurally meaningless for such an element, both at compile time
    (identity_bundle.py's unique_at_compile) and in the offline re-checks below.
    """
    bundle = step.get("identity_bundle") if isinstance(step.get("identity_bundle"), dict) else {}
    return bool(bundle.get("frame_chain"))


def _get_step(document: dict[str, Any], step_index: int) -> dict[str, Any]:
    skills = list(document.get("skills") or [])
    if not skills:
        raise RetargetError("invalid_document", "No skills block")
    steps = list((skills[0] or {}).get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise RetargetError("step_not_found", f"Step {step_index} out of range")
    return dict(steps[step_index])


def find_source_event(step: dict[str, Any], document: dict[str, Any]) -> dict[str, Any] | None:
    """Locate the original recorded event this step was compiled from.

    Shared by the 1-click-fix path (``compiler/patch.py::_regenerate_compiled_selectors``)
    and this wizard's preview — both need the same recorded-event lookup by
    the step's ``snapshot_ref`` within the session named by ``meta.source_session_id``.
    """
    snapshot_ref = step.get("snapshot_ref")
    if not snapshot_ref:
        return None
    source_session_id = (document.get("meta") or {}).get("source_session_id")
    if not source_session_id:
        return None

    from conxa_core.storage.session_events import read_session_events

    events = read_session_events(source_session_id)
    for ev in events:
        if (ev.get("snapshot") or {}).get("ref") == snapshot_ref:
            return ev
    return None


def _normalize_bbox(bbox: dict[str, Any]) -> dict[str, int]:
    try:
        next_bbox = {
            "x": int(round(float(bbox.get("x") or 0))),
            "y": int(round(float(bbox.get("y") or 0))),
            "w": int(round(float(bbox.get("w") or 0))),
            "h": int(round(float(bbox.get("h") or 0))),
        }
    except (TypeError, ValueError) as exc:
        raise RetargetError("invalid_bbox", "Bounding box must be numeric") from exc
    if next_bbox["w"] < 2 or next_bbox["h"] < 2:
        raise RetargetError("bbox_too_small", "Drawn region must be at least 2x2 pixels")
    return next_bbox


# Engine labels match the keys recognized by selector_score.durability_score /
# tag_orthogonality_class so scores and orthogonality classes are meaningful.
_ENGINE_RULES: tuple[tuple[str, Any], ...] = (
    ("testid", lambda s: "data-testid" in s or "data-test-id" in s),
    ("role", lambda s: "[role=" in s),
    ("aria", lambda s: "aria-label" in s),
    ("name", lambda s: "[name=" in s or "[placeholder=" in s),
    ("css-id", lambda s: "#" in s),
    ("text_based", lambda s: ":has-text" in s or ":text" in s),
)


def _classify_engine(selector: str) -> str:
    low = (selector or "").lower()
    for label, test in _ENGINE_RULES:
        if test(low):
            return label
    return "css-structural"


def _descriptor_for(step: dict[str, Any], candidate_intent: str) -> str:
    if candidate_intent:
        return candidate_intent
    dom = (step.get("signals") or {}).get("dom") or {}
    target = step.get("target") if isinstance(step.get("target"), dict) else {}
    tag = dom.get("tag") or target.get("tag") or "element"
    text = str(dom.get("inner_text") or "").strip()
    if text:
        return f'{tag} "{text[:40]}"'
    return str(tag)


# Below this durability score a "unique" match still isn't trusted as a good pick.
_AMBIGUITY_DURABILITY_FLOOR = 0.5

# Hard minimum durability for a selector to be offered as a target on the review path. Anything
# below this (e.g. an absolute XPath, or a fragile structural selector) does not move forward —
# it's neither shown for selection nor written back as a fallback on apply.
_MIN_OFFERED_DURABILITY = 0.3


def _prune_review_candidates(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop options that shouldn't be offered as a target on the review path: non-unique matches
    (could resolve to the wrong element at runtime) and any selector below the durability floor.
    May return an empty list — if nothing qualifies, the wizard shows the "re-pick" prompt rather
    than offering a selector that isn't good enough to move forward.
    """
    return [
        c
        for c in rows
        if c.get("verified") != "not_unique" and c["durability"] >= _MIN_OFFERED_DURABILITY
    ]


def _verified_from_count(match_count: int) -> str:
    """Map a DOM match count to a verification status: 1 = uniquely matched, <0 = couldn't be
    checked offline (deferred to runtime), otherwise didn't uniquely match."""
    if match_count == 1:
        return "unique"
    if match_count < 0:
        return "unverified"
    return "not_unique"


def _pick_quality(candidates: list[dict[str, Any]]) -> str:
    """good = at least one durable selector that either uniquely matched or couldn't be verified
    (trust the compile); ambiguous = candidates exist but none clear that bar; none = nothing."""
    for c in candidates:
        if c.get("verified") in ("unique", "unverified") and c["durability"] >= _AMBIGUITY_DURABILITY_FLOOR:
            return "good"
    return "ambiguous" if candidates else "none"


def _candidate_row(
    step: dict[str, Any], selector: str, match_count: int, intent: str = "", source: str = "compiler"
) -> dict[str, Any]:
    from conxa_compile.compiler.selector_score import durability_score, tag_orthogonality_class

    engine = _classify_engine(selector)
    return {
        "selector": selector,
        "engine": engine,
        "durability": durability_score(engine, selector),
        "orthogonality_class": tag_orthogonality_class(engine),
        "match_count": match_count,
        "unique": match_count == 1,
        "verified": _verified_from_count(match_count),
        "descriptor": _descriptor_for(step, intent),
        "source": source,
    }


def _existing_candidates(step: dict[str, Any], dom_snapshot: str | None) -> list[dict[str, Any]]:
    """Selector candidates built from what the compiler already produced for this step — no LLM.

    Used on the "review" path, when the user opens the wizard and continues without re-picking
    the element. Prefers the identity_bundle signals: each carries the compiler's own
    ``unique_at_compile`` verdict (computed against the recorded DOM *and* accessibility tree at
    compile time — the authoritative "verified after recording" result, which the offline CSS
    re-check here can't reproduce for role=/text= selectors) plus a compiled engine and
    durability. Falls back to an offline CSS re-check of the raw target selectors for older
    skills that predate the identity_bundle.
    """
    from conxa_compile.compiler.selector_score import tag_orthogonality_class

    target = step.get("target") if isinstance(step.get("target"), dict) else {}
    primary = str(target.get("primary_selector") or "").strip()
    fallbacks = [str(s).strip() for s in (target.get("fallback_selectors") or []) if str(s).strip()]
    # identity_bundle.signals align index-for-index with [primary, *fallbacks]; use the target
    # strings for display (readable) but the signal for the verdict/engine/durability.
    display = [s for s in [primary, *fallbacks] if s]

    bundle = step.get("identity_bundle") if isinstance(step.get("identity_bundle"), dict) else {}
    signals = bundle.get("signals") if isinstance(bundle.get("signals"), list) else []

    frame_nested = _is_frame_nested(step)

    rows: list[dict[str, Any]] = []
    if signals:
        for i, sig in enumerate(signals):
            if not isinstance(sig, dict):
                continue
            sel = display[i] if i < len(display) else str(sig.get("selector") or "").strip()
            if not sel:
                continue
            unique = bool(sig.get("unique_at_compile"))
            engine = str(sig.get("engine") or _classify_engine(sel))
            # unique_at_compile was computed against dom_html (page.content(), top-level only —
            # see _is_frame_nested). For a frame-nested element that's not a real "not unique"
            # verdict, just "couldn't check" — treat it the same as the unverifiable case rather
            # than dropping it in _prune_review_candidates below.
            verified = "unique" if unique else ("unverified" if frame_nested else "not_unique")
            rows.append(
                {
                    "selector": sel,
                    "engine": engine,
                    "durability": float(sig.get("durability") or 0.0),
                    "orthogonality_class": str(sig.get("orthogonality_class") or tag_orthogonality_class(engine)),
                    # exact count isn't stored — only the unique-or-not verdict; -1 keeps the UI
                    # from claiming a specific number for the non-unique/unverified case.
                    "match_count": 1 if unique else -1,
                    "unique": unique,
                    "verified": verified,
                    "descriptor": _descriptor_for(step, ""),
                    "source": str(sig.get("source") or "compiler"),
                }
            )
            if len(rows) >= 5:
                break
        if rows:
            return _prune_review_candidates(rows)

    # No identity_bundle (older skill) — best-effort offline CSS re-check of the target strings.
    from conxa_compile.llm.selector_regeneration import validate_selector

    seen: set[str] = set()
    for sel in display:
        if sel in seen:
            continue
        seen.add(sel)
        if frame_nested:
            # Same reasoning as above: dom_snapshot can't contain this element at all, so a
            # match_count check here would reject every selector regardless of quality.
            match_count = -1
        else:
            _passes, match_count = validate_selector(sel, dom_snapshot)
        rows.append(_candidate_row(step, sel, match_count))
        if len(rows) >= 5:
            break
    return _prune_review_candidates(rows)


def preview_retarget(
    document: dict[str, Any], step_index: int, bbox: dict[str, Any], regenerate: bool = True
) -> dict[str, Any]:
    """Return Phase 2 (candidates) + Phase 3 (validation diff) data. Persists nothing.

    ``regenerate`` controls whether selectors are re-derived by the LLM (the user re-picked
    the element) or simply read back from the compile (the user is only reviewing). The LLM
    fires *only* on the regenerate path — reviewing an unchanged step costs zero tokens.
    """
    from conxa_compile.compiler.build import _build_assertions
    from conxa_compile.compiler.validation_planner import infer_wait_for_shape
    from conxa_compile.policy.bundle import get_policy_bundle
    from conxa_core.storage import snapshots
    from conxa_core.models.skill_spec import ValidationBlock

    step = _get_step(document, step_index)
    next_bbox = _normalize_bbox(bbox)

    source_session_id = (document.get("meta") or {}).get("source_session_id")
    matching_event = find_source_event(step, document)
    snapshot_hash = step.get("snapshot_dom_hash")
    dom_snapshot = (
        snapshots.read_dom_snapshot(source_session_id, snapshot_hash)
        if source_session_id and snapshot_hash
        else None
    )

    current_validation = step.get("validation") if isinstance(step.get("validation"), dict) else {}
    current_wait_for = current_validation.get("wait_for") or {}
    current_assertions = current_validation.get("assertions") or []

    if regenerate:
        # The element changed, so its selectors must be regenerated for the new target. A drawn
        # region has no stored per-element geometry to resolve against (see module docstring) —
        # the vision LLM identifies the element from the highlighted screenshot + DOM snippet.
        # Requires the recorded screenshot and DOM snapshot to run.
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region
        from conxa_compile.llm.selector_regeneration import validate_selector

        if not source_session_id or not matching_event:
            raise RetargetError(
                "session_artifacts_missing",
                "The original recording session is no longer available for this step",
            )

        action_type = str((matching_event.get("action") or {}).get("action") or "")
        # compile_selectors_for_region discards nothing itself — the re-validation below is
        # what enforces uniqueness against the stored DOM snapshot, plus gives the
        # match_count/durability data shown in the UI.
        raw_candidates = compile_selectors_for_region(
            matching_event=matching_event,
            session_id=source_session_id,
            bbox=next_bbox,
            dom_snapshot=dom_snapshot,
            action_type=action_type,
        )
        # dom_snapshot is page.content() — the top-level document only, never iframe
        # subdocument HTML (see session.py's _capture_dom_snapshot_sync). For a step
        # recorded inside an iframe, no candidate selector can ever appear in it, so a
        # match_count check here would reject every candidate regardless of quality.
        # Trust the LLM instead, same as validate_selector already does when there's no
        # dom_snapshot at all.
        frame_nested = _is_frame_nested(step)
        candidates: list[dict[str, Any]] = []
        for cand in raw_candidates[:5]:
            if frame_nested:
                match_count = -1
            else:
                _passes, match_count = validate_selector(cand.selector, dom_snapshot)
                if match_count == 0:
                    continue
            candidates.append(_candidate_row(step, cand.selector, match_count, cand.intent, source="llm"))
        # Same rule as the review path: no non-unique matches, nothing below the durability
        # floor — a freshly re-picked element deserves the same bar as a reviewed one.
        candidates = _prune_review_candidates(candidates)

        state_diff = matching_event.get("state_change") if isinstance(matching_event.get("state_change"), dict) else {}
        policy = get_policy_bundle().data
        proposed_wait_for = infer_wait_for_shape(step, state_diff, policy)
        proposed_validation = ValidationBlock(wait_for=proposed_wait_for, success_conditions={})
        # The user hasn't picked a candidate yet at preview time — use the top-ranked candidate
        # as the provisional primary_selector for the enforced value_equals/selector_present
        # signal (falls back to the step's existing target if regeneration produced nothing).
        preview_selector = (
            candidates[0]["selector"] if candidates
            else str((step.get("target") or {}).get("primary_selector") or "")
        )
        preview_target = {"primary_selector": preview_selector}
        proposed_assertions = [
            a.model_dump(mode="json")
            for a in _build_assertions(matching_event, proposed_validation, policy, preview_target, step.get("value"))
        ]
        validation_changed = proposed_wait_for != current_wait_for or proposed_assertions != current_assertions
    else:
        # Nothing changed — review the selectors the compiler already produced. No LLM call,
        # and the validation is unchanged by definition.
        candidates = _existing_candidates(step, dom_snapshot)
        proposed_wait_for = current_wait_for
        proposed_assertions = current_assertions
        validation_changed = False

    pick_quality = _pick_quality(candidates)

    from conxa_compile.compiler.selector_score import confidence_from_signal_rows

    bundle = step.get("identity_bundle") if isinstance(step.get("identity_bundle"), dict) else {}
    bundle_signals = bundle.get("signals") if isinstance(bundle.get("signals"), list) else []
    stored_confidence = (step.get("target") or {}).get("selector_confidence")
    if isinstance(stored_confidence, (int, float)):
        compile_confidence: float | None = float(stored_confidence)
    elif bundle_signals:
        compile_confidence = confidence_from_signal_rows(bundle_signals)
    else:
        compile_confidence = None

    return {
        "bbox": next_bbox,
        "pick_quality": pick_quality,
        "candidates": candidates,
        "compile_confidence": compile_confidence,
        "current_wait_for": current_wait_for,
        "proposed_wait_for": proposed_wait_for,
        "current_assertions": current_assertions,
        "proposed_assertions": proposed_assertions,
        "validation_changed": validation_changed,
        "fast_finish": pick_quality == "good" and not validation_changed,
    }


def apply_retarget(document: dict[str, Any], step_index: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Atomically apply bbox + target selectors + identity_bundle + validation.

    Returns a **new** document dict. Caller is responsible for the single undo
    entry (push the pre-apply snapshot once, before calling this) and for
    writing the result.
    """
    from conxa_compile.compiler.build import _confidence_from_identity_bundle
    from conxa_compile.compiler.patch import _sync_recovery_deterministic
    from conxa_compile.compiler.selector_filters import selector_passes_filters
    from conxa_compile.compiler.selector_grammar import rebuild_identity_signals_from_target
    from conxa_compile.editor.recording_visual import update_step_visual_bbox_and_regenerate_anchors_or_raise

    next_bbox = _normalize_bbox(payload.get("bbox") or {})
    primary_selector = str(payload.get("primary_selector") or "").strip()
    fallback_selectors = [str(s).strip() for s in (payload.get("fallback_selectors") or []) if str(s).strip()]
    keep_validation = bool(payload.get("keep_validation", True))

    if not primary_selector:
        raise RetargetError("primary_selector_required", "No target selector was chosen")
    if not selector_passes_filters(primary_selector):
        raise RetargetError("invalid_selector", f"primary_selector failed quality gates: {primary_selector!r}")

    original_meta = dict(document.get("meta") or {})
    original_version = int(original_meta.get("version", 1))

    # 1. bbox + regenerated vision anchors (existing, LLM-backed helper).
    doc = update_step_visual_bbox_and_regenerate_anchors_or_raise(document, step_index, next_bbox)

    skills = list(doc.get("skills") or [])
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    step = dict(steps[step_index])

    # 2. target selectors + rebuilt identity_bundle + re-derived confidence.
    step["target"] = {
        **(step.get("target") if isinstance(step.get("target"), dict) else {}),
        "primary_selector": primary_selector,
        "fallback_selectors": fallback_selectors,
    }
    new_signals = rebuild_identity_signals_from_target(step)
    if new_signals:
        bundle = dict(step.get("identity_bundle") or {})
        bundle["signals"] = new_signals
        step["identity_bundle"] = bundle
        try:
            step["target"]["selector_confidence"] = _confidence_from_identity_bundle(bundle)
        except Exception:
            pass  # Non-critical — confidence will be recomputed on next compile.

    # 3. compiled_selectors: top candidates in review order (already LLM-validated in preview).
    signals = dict(step.get("signals") or {})
    signals["compiled_selectors"] = [primary_selector, *fallback_selectors][:3]
    step["signals"] = signals

    # 4. validation: keep current, adopt the previewed proposal, or apply a human edit made in
    # the Validation phase. edited_assertions takes precedence over proposed_assertions when
    # present; it round-trips independently of keep_validation, which only governs wait_for —
    # a human can keep the existing wait condition but still hand-edit the assertion list.
    edited_assertions = payload.get("edited_assertions")
    if edited_assertions is not None or not keep_validation:
        validation = dict(step.get("validation") or {})
        if not keep_validation:
            validation["wait_for"] = payload.get("proposed_wait_for") or {}
        validation["assertions"] = (
            edited_assertions if edited_assertions is not None else payload.get("proposed_assertions") or []
        )
        step["validation"] = validation
        step = _sync_recovery_deterministic(step)

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills

    meta = dict(doc.get("meta") or {})
    meta["version"] = original_version + 1
    doc["meta"] = meta
    return doc
