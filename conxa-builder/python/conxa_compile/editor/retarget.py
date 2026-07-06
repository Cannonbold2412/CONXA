"""Preview-and-apply support for the 3-phase re-target wizard (Human Edit page).

Phase 1 (pick element on the screenshot) happens client-side. This module backs
Phase 2 (review generated selectors) and Phase 3 (confirm validation): both are
previewed here without persisting so the whole wizard lands as a single mutation
when the user finally clicks Apply — see ``apply_retarget``.

Selector regeneration reuses the same LLM path as the 1-click-fix API
(``compiler/patch.py::_regenerate_compiled_selectors``) — the sanctioned
exception to "LLM does not write selector strings on the primary compile path"
(see CLAUDE.md Key Invariants). ``find_source_event`` is shared with that path.
"""

from __future__ import annotations

from typing import Any


class RetargetError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


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
    ``signals.snapshot.ref`` within the session named by ``meta.source_session_id``.
    """
    snapshot_ref = ((step.get("signals") or {}).get("snapshot") or {}).get("ref")
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


def preview_retarget(document: dict[str, Any], step_index: int, bbox: dict[str, Any]) -> dict[str, Any]:
    """Return Phase 2 (candidates) + Phase 3 (validation diff) data. Persists nothing."""
    from conxa_compile.compiler.build import _build_assertions
    from conxa_compile.compiler.selector_score import durability_score
    from conxa_compile.compiler.validation_planner import infer_wait_for_shape
    from conxa_compile.llm.selector_regeneration import compile_selectors_for_task, task_from_recorded_event, validate_selector
    from conxa_compile.policy.bundle import get_policy_bundle
    from conxa_core.storage import snapshots
    from conxa_core.models.skill_spec import ValidationBlock

    step = _get_step(document, step_index)
    next_bbox = _normalize_bbox(bbox)

    matching_event = find_source_event(step, document)
    source_session_id = (document.get("meta") or {}).get("source_session_id")
    if not source_session_id or not matching_event:
        raise RetargetError(
            "session_artifacts_missing",
            "The original recording session is no longer available for this step",
        )

    snapshot_hash = ((step.get("signals") or {}).get("snapshot") or {}).get("dom_hash")
    dom_snapshot = snapshots.read_dom_snapshot(source_session_id, snapshot_hash) if snapshot_hash else None

    task = task_from_recorded_event(matching_event, step_index)
    task.element_bbox = next_bbox
    task.target_dom = step.get("target") if isinstance(step.get("target"), dict) else {}

    # compile_selectors_for_task already discards candidates that don't uniquely match
    # the stored DOM snapshot (see selector_regeneration.py::validate_selector), so what
    # comes back here is normally all-unique. The re-validation below is mostly for the
    # match_count/durability data to show in the UI; it also protects against the rare
    # case of a cache hit predating a stricter validation rule.
    raw_candidates = compile_selectors_for_task(task, session_id=source_session_id)

    candidates: list[dict[str, Any]] = []
    for cand in raw_candidates[:5]:
        passes, match_count = validate_selector(cand.selector, dom_snapshot)
        if not passes and match_count == 0:
            continue
        engine = _classify_engine(cand.selector)
        candidates.append(
            {
                "selector": cand.selector,
                "engine": engine,
                "durability": durability_score(engine, cand.selector),
                "match_count": match_count,
                "unique": match_count == 1,
                "descriptor": _descriptor_for(step, cand.intent),
            }
        )

    if any(c["unique"] and c["durability"] >= _AMBIGUITY_DURABILITY_FLOOR for c in candidates):
        pick_quality = "good"
    elif candidates:
        pick_quality = "ambiguous"
    else:
        pick_quality = "none"

    state_diff = matching_event.get("state_change") if isinstance(matching_event.get("state_change"), dict) else {}
    policy = get_policy_bundle().data
    proposed_wait_for = infer_wait_for_shape(step, state_diff, policy)
    proposed_validation = ValidationBlock(wait_for=proposed_wait_for, success_conditions={})
    proposed_assertions = [a.model_dump(mode="json") for a in _build_assertions(matching_event, proposed_validation)]

    current_validation = step.get("validation") if isinstance(step.get("validation"), dict) else {}
    current_wait_for = current_validation.get("wait_for") or {}
    current_assertions = current_validation.get("assertions") or []

    validation_changed = proposed_wait_for != current_wait_for or proposed_assertions != current_assertions

    return {
        "bbox": next_bbox,
        "pick_quality": pick_quality,
        "candidates": candidates,
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

    # 4. validation: keep current or adopt the previewed proposal.
    if not keep_validation:
        proposed_wait_for = payload.get("proposed_wait_for") or {}
        proposed_assertions = payload.get("proposed_assertions") or []
        validation = dict(step.get("validation") or {})
        validation["wait_for"] = proposed_wait_for
        validation["assertions"] = proposed_assertions
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
