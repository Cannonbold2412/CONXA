"""Attach a screenshot frame from the source recording to an editor step and re-run vision anchors."""

from __future__ import annotations

from typing import Any

from conxa_compile.compiler.action_semantics import action_name
from conxa_compile.compiler.build import _default_confidence_protocol, _merge_compile_warnings, _persisted_visual_asset_path
from conxa_compile.compiler.decision_layer import rank_merged_anchors
from conxa_compile.compiler.recovery_policy import merge_recovery_strategies_for_wait_shape
from conxa_core.config import settings
from conxa_compile.editor.assets import asset_url, resolve_skill_asset
from conxa_compile.editor.step_view import skill_step_for_destructive_check
from conxa_compile.llm import anchor_vision_llm
from conxa_compile.llm.anchor_vision_llm import VisionAnchorGenerationError
from conxa_compile.policy.bundle import PolicyBundle, get_policy_bundle

_STRIP_VISUAL_IMAGE_KEYS = ("full_screenshot", "element_snapshot", "scroll_screenshot", "bbox")

_FRAME_LABEL_ORDER = {"before_far": 0, "before_near": 1, "at": 2, "after_near": 3, "after_far": 4}


def screenshot_items_for_skill(
    skill_id: str,
    document: dict[str, Any],
    *,
    asset_base_url: str,
) -> tuple[str | None, list[dict[str, Any]]]:
    """Return (session_id_or_none, items) for GET recording-screenshots.

    Each item carries the event's representative screenshot plus, when available, every
    timed frame captured around that event (``frames``: before_far/before_near/at/after_near/
    after_far) — so a caller can offer all frames per step, not just one per event.
    """
    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    session_id = str(meta.get("source_session_id") or "").strip() or None
    if not session_id:
        return None, []

    from conxa_core.storage.session_events import read_session_events

    events = read_session_events(session_id)
    out: list[dict[str, Any]] = []

    for idx, ev in enumerate(events):
        vis = ev.get("visual") if isinstance(ev.get("visual"), dict) else {}
        rel = vis.get("full_screenshot")
        if not isinstance(rel, str) or not rel.strip():
            continue
        persisted_full = _persisted_visual_asset_path(
            dict(ev),
            rel,
            session_id_fallback=session_id,
        )
        if not persisted_full:
            continue
        extras = ev.get("extras") if isinstance(ev.get("extras"), dict) else {}
        seq_raw = extras.get("sequence")
        try:
            sequence = int(seq_raw) if seq_raw is not None else idx + 1
        except (TypeError, ValueError):
            sequence = idx + 1

        preview_url = asset_url(persisted_full, asset_base_url=asset_base_url, skill_id=skill_id)

        frames_raw = vis.get("frames") if isinstance(vis.get("frames"), dict) else {}
        frame_items: list[dict[str, Any]] = []
        for label, frame_rel in frames_raw.items():
            if not isinstance(frame_rel, str) or not frame_rel.strip():
                continue
            persisted_frame = _persisted_visual_asset_path(
                dict(ev),
                frame_rel,
                session_id_fallback=session_id,
            )
            if not persisted_frame:
                continue
            frame_items.append(
                {
                    "label": label,
                    "url": asset_url(persisted_frame, asset_base_url=asset_base_url, skill_id=skill_id),
                }
            )
        frame_items.sort(key=lambda f: _FRAME_LABEL_ORDER.get(f["label"], 99))

        out.append(
            {
                "event_index": idx,
                "sequence": sequence,
                "persisted_full_screenshot": persisted_full,
                "preview_url": preview_url,
                "viewport": str(vis.get("viewport") or ""),
                "has_element_snapshot": bool(
                    isinstance(vis.get("element_snapshot"), str) and str(vis.get("element_snapshot") or "").strip()
                ),
                "frame": dict(ev.get("frame") or {}) if isinstance(ev.get("frame"), dict) else {},
                "frames": frame_items,
            }
        )

    return session_id, out


def _ev_rank_stub_from_step(step: dict[str, Any]) -> dict[str, Any]:
    """Minimal event-shaped dict for ``rank_merged_anchors`` (uses step semantics, not swapped frame copy)."""
    signals = step.get("signals") if isinstance(step.get("signals"), dict) else {}
    return {
        "target": signals.get("dom") or {},
        "semantic": signals.get("semantic") or {},
        "context": signals.get("context") or {},
    }


def apply_recording_event_visual_to_step_or_raise(
    document: dict[str, Any],
    step_index: int,
    event_index: int,
    *,
    frame_label: str | None = None,
    policy_bundle: PolicyBundle | None = None,
) -> dict[str, Any]:
    """Return a **new** document dict with swapped ``signals.visual``, fresh vision anchors, and bumped meta.version.

    By default picks the event's representative screenshot. Pass ``frame_label`` (one of
    before_far/before_near/at/after_near/after_far) to instead pick one of that event's 5
    timed frames — e.g. when browsing every frame of every step, not just one per step.
    """
    bundle = policy_bundle or get_policy_bundle()
    policy = bundle.data

    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    session_id = str(meta.get("source_session_id") or "").strip()
    if not session_id:
        raise ValueError("no_source_session_id")

    from conxa_core.storage.session_events import read_session_events

    events = read_session_events(session_id)
    if event_index < 0 or event_index >= len(events):
        raise ValueError("event_index_out_of_range")

    ev_pick = dict(events[event_index])
    visual = dict(ev_pick.get("visual")) if isinstance(ev_pick.get("visual"), dict) else {}

    if frame_label is not None:
        if frame_label not in _FRAME_LABEL_ORDER:
            raise ValueError(f"invalid_frame_label: {frame_label!r}")
        frames = visual.get("frames") if isinstance(visual.get("frames"), dict) else {}
        raw_full = frames.get(frame_label)
        if not isinstance(raw_full, str) or not raw_full.strip():
            raise ValueError(f"event_frame_not_available: {frame_label!r}")
    else:
        raw_full = visual.get("full_screenshot")
        if not isinstance(raw_full, str) or not raw_full.strip():
            raise ValueError("event_missing_full_screenshot")

    persisted_visual: dict[str, Any] = {
        "bbox": visual.get("bbox") if isinstance(visual.get("bbox"), dict) else {},
        "viewport": str(visual.get("viewport") or ""),
        "scroll_position": str(visual.get("scroll_position") or ""),
        "full_screenshot": _persisted_visual_asset_path(
            ev_pick,
            raw_full,
            session_id_fallback=session_id,
        ),
    }

    abs_check = resolve_skill_asset(persisted_visual["full_screenshot"])
    if not abs_check.is_file():
        raise ValueError("screenshot_file_missing_on_disk")

    if frame_label is not None:
        # A specific frame's element crop hasn't been pre-computed (only the event's
        # representative frame has) — crop it fresh from this frame's bbox.
        from conxa_compile.recorder.visual import crop_element_from_frame

        images_dir = abs_check.parent.parent / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        el_out = images_dir / f"evt_{event_index + 1:04d}_{frame_label}_element.jpg"
        cropped = crop_element_from_frame(
            abs_check,
            persisted_visual["bbox"],
            el_out,
            jpeg_quality=settings.screenshot_jpeg_quality,
        )
        if cropped is not None:
            try:
                el_rel = str(el_out.relative_to(settings.data_dir.resolve())).replace("\\", "/")
                persisted_visual["element_snapshot"] = el_rel
            except ValueError:
                pass
    else:
        el_snap = visual.get("element_snapshot")
        if isinstance(el_snap, str) and el_snap.strip():
            persisted_visual["element_snapshot"] = _persisted_visual_asset_path(
                ev_pick,
                el_snap,
                session_id_fallback=session_id,
            )

    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")

    step = dict(steps[step_index])
    if action_name(step).lower() == "scroll":
        raise ValueError("cannot_swap_visual_on_scroll_step")

    from conxa_compile.compiler.intent_access import get_effective_intent_from_skill_step

    intent = get_effective_intent_from_skill_step(step) or str(step.get("intent") or "").strip()
    if not intent.strip():
        raise ValueError("intent_required_for_visual_swap")

    session_root = (settings.data_dir / "sessions" / session_id).resolve()
    ev_llm = {"visual": dict(persisted_visual)}
    anchors = anchor_vision_llm.generate_anchors_for_step_or_raise(
        ev_llm,
        session_root=session_root,
        final_intent=intent,
        policy=policy,
        step_index=step_index,
    )
    anchors = rank_merged_anchors(anchors, _ev_rank_stub_from_step(step), intent, policy)

    signals = dict(step.get("signals") or {})
    prev_vis = signals.get("visual") if isinstance(signals.get("visual"), dict) else {}
    merged_visual = dict(prev_vis)
    merged_visual.update(persisted_visual)
    signals["visual"] = merged_visual
    signals["anchors"] = list(anchors)
    step["signals"] = signals
    frame = ev_pick.get("frame")
    if isinstance(frame, dict) and frame.get("chain"):
        step["frame"] = dict(frame)

    recovery = dict(step.get("recovery") or {})
    recovery["anchors"] = list(anchors)
    recovery["intent"] = intent
    recovery["final_intent"] = intent
    wf = (step.get("validation") or {}).get("wait_for") or {}
    recovery = merge_recovery_strategies_for_wait_shape(
        recovery,
        dict(wf) if isinstance(wf, dict) else {},
        policy,
    )
    step["recovery"] = recovery

    proto_base = dict(step.get("confidence_protocol") or _default_confidence_protocol(bundle))
    step["confidence_protocol"] = _merge_compile_warnings(
        proto_base,
        skill_step_for_destructive_check(step),
        anchors,
        policy,
    )

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta2 = dict(doc.get("meta") or {})
    meta2["version"] = int(meta2.get("version", 1)) + 1
    doc["meta"] = meta2
    return doc


def _resolve_step_for_visual_update(
    document: dict[str, Any], step_index: int, bbox: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Normalize the drawn bbox and look up the target step. Shared by the preview (Continue) and
    apply-time entry points below so both validate identically."""
    try:
        next_bbox = {
            "x": int(round(float(bbox.get("x") or 0))),
            "y": int(round(float(bbox.get("y") or 0))),
            "w": int(round(float(bbox.get("w") or 0))),
            "h": int(round(float(bbox.get("h") or 0))),
        }
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid_visual_bbox") from exc
    if next_bbox["w"] < 2 or next_bbox["h"] < 2:
        raise ValueError("visual_bbox_too_small")

    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    if not str(meta.get("source_session_id") or "").strip():
        raise ValueError("no_source_session_id")

    skills = list(document.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    steps = list((skills[0] or {}).get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")

    step = dict(steps[step_index])
    if action_name(step).lower() == "scroll":
        raise ValueError("cannot_update_visual_bbox_on_scroll_step")
    return next_bbox, step


def _generate_anchors_for_bbox(
    step: dict[str, Any], next_bbox: dict[str, Any], session_id: str, policy: dict[str, Any], step_index: int
) -> tuple[list[dict[str, Any]], str]:
    """LLM-backed anchor generation for a step's screenshot + drawn region. Raises on missing inputs."""
    signals = step.get("signals") if isinstance(step.get("signals"), dict) else {}
    visual = dict(signals.get("visual") if isinstance(signals.get("visual"), dict) else {})
    raw_full = visual.get("full_screenshot")
    if not isinstance(raw_full, str) or not raw_full.strip():
        raise ValueError("step_missing_full_screenshot")

    from conxa_compile.compiler.intent_access import get_effective_intent_from_skill_step

    intent = get_effective_intent_from_skill_step(step) or str(step.get("intent") or "").strip()
    if not intent.strip():
        raise ValueError("intent_required_for_visual_bbox")

    visual["bbox"] = next_bbox
    session_root = (settings.data_dir / "sessions" / session_id).resolve()
    anchors = anchor_vision_llm.generate_anchors_for_step_or_raise(
        {"visual": visual},
        session_root=session_root,
        final_intent=intent,
        policy=policy,
        step_index=step_index,
    )
    anchors = rank_merged_anchors(anchors, _ev_rank_stub_from_step(step), intent, policy)
    return anchors, intent


def preview_visual_anchors_for_bbox_or_raise(
    document: dict[str, Any],
    step_index: int,
    bbox: dict[str, Any],
    *,
    policy_bundle: PolicyBundle | None = None,
) -> dict[str, Any]:
    """Compute (without persisting) the vision anchors a redrawn region would produce.

    Lets the re-target wizard pay for the anchor LLM call once, at Continue (Phase 1 -> 2),
    instead of again at Apply — see ``update_step_visual_bbox_and_regenerate_anchors_or_raise``'s
    ``precomputed_anchors`` param.
    """
    bundle = policy_bundle or get_policy_bundle()
    next_bbox, step = _resolve_step_for_visual_update(document, step_index, bbox)
    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    session_id = str(meta.get("source_session_id") or "").strip()
    anchors, intent = _generate_anchors_for_bbox(step, next_bbox, session_id, bundle.data, step_index)
    return {"anchors": anchors, "intent": intent}


def update_step_visual_bbox_and_regenerate_anchors_or_raise(
    document: dict[str, Any],
    step_index: int,
    bbox: dict[str, Any],
    *,
    policy_bundle: PolicyBundle | None = None,
    precomputed_anchors: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Update ``signals.visual.bbox`` and apply vision-backed anchors for the current screenshot.

    Pass ``precomputed_anchors`` (from ``preview_visual_anchors_for_bbox_or_raise``) to reuse
    anchors already generated at Continue instead of calling the LLM again here.
    """
    bundle = policy_bundle or get_policy_bundle()
    policy = bundle.data
    next_bbox, step = _resolve_step_for_visual_update(document, step_index, bbox)
    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    session_id = str(meta.get("source_session_id") or "").strip()

    doc = dict(document)
    skills = list(doc.get("skills") or [])
    block = dict(skills[0])
    steps = list(block.get("steps") or [])

    signals = dict(step.get("signals") or {})
    visual_prev = signals.get("visual") if isinstance(signals.get("visual"), dict) else {}
    visual = dict(visual_prev)

    # The wizard's Pick phase defaults to the step's existing bbox so a human who only wants to
    # edit validation (Phase 3) can continue without redrawing. When the box genuinely hasn't
    # moved, the vision-derived anchors describing landmarks around it are still valid — skip the
    # LLM round-trip entirely instead of re-deriving them. This also means a validation-only Apply
    # can't fail on a transient vision-proxy error it has no real reason to depend on.
    prev_bbox = visual_prev.get("bbox") if isinstance(visual_prev.get("bbox"), dict) else None
    if prev_bbox == next_bbox:
        return document

    if precomputed_anchors is not None:
        anchors = precomputed_anchors.get("anchors") or []
        intent = str(precomputed_anchors.get("intent") or "")
    else:
        anchors, intent = _generate_anchors_for_bbox(step, next_bbox, session_id, policy, step_index)

    visual["bbox"] = next_bbox
    signals["visual"] = visual
    signals["anchors"] = list(anchors)
    step["signals"] = signals

    recovery = dict(step.get("recovery") or {})
    recovery["anchors"] = list(anchors)
    recovery["intent"] = intent
    recovery["final_intent"] = intent
    wf = (step.get("validation") or {}).get("wait_for") or {}
    recovery = merge_recovery_strategies_for_wait_shape(
        recovery,
        dict(wf) if isinstance(wf, dict) else {},
        policy,
    )
    step["recovery"] = recovery

    proto_base = dict(step.get("confidence_protocol") or _default_confidence_protocol(bundle))
    step["confidence_protocol"] = _merge_compile_warnings(
        proto_base,
        skill_step_for_destructive_check(step),
        anchors,
        policy,
    )

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta2 = dict(doc.get("meta") or {})
    meta2["version"] = int(meta2.get("version", 1)) + 1
    doc["meta"] = meta2
    return doc


def clear_step_visual_screenshots_or_raise(
    document: dict[str, Any],
    step_index: int,
    *,
    policy_bundle: PolicyBundle | None = None,
) -> dict[str, Any]:
    """Remove screenshot assets from ``signals.visual`` and clear vision anchors (no LLM)."""
    bundle = policy_bundle or get_policy_bundle()
    policy = bundle.data

    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")

    step = dict(steps[step_index])

    signals = dict(step.get("signals") or {})
    visual_prev = signals.get("visual") if isinstance(signals.get("visual"), dict) else {}
    visual = dict(visual_prev)
    for k in _STRIP_VISUAL_IMAGE_KEYS:
        visual.pop(k, None)
    signals["visual"] = visual
    signals["anchors"] = []
    step["signals"] = signals

    recovery = dict(step.get("recovery") or {})
    recovery["anchors"] = []
    from conxa_compile.compiler.intent_access import get_effective_intent_from_skill_step

    intent_raw = (
        str(recovery.get("final_intent") or "").strip()
        or str(recovery.get("intent") or "").strip()
        or get_effective_intent_from_skill_step(step)
        or str(step.get("intent") or "").strip()
    )
    if intent_raw:
        recovery["intent"] = intent_raw
        recovery["final_intent"] = intent_raw
    wf = (step.get("validation") or {}).get("wait_for") or {}
    recovery = merge_recovery_strategies_for_wait_shape(
        recovery,
        dict(wf) if isinstance(wf, dict) else {},
        policy,
    )
    step["recovery"] = recovery

    proto_base = dict(step.get("confidence_protocol") or _default_confidence_protocol(bundle))
    step["confidence_protocol"] = _merge_compile_warnings(
        proto_base,
        skill_step_for_destructive_check(step),
        [],
        policy,
    )

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def apply_step_frame_or_raise(
    document: dict[str, Any],
    step_index: int,
    frame_label: str,
    *,
    policy_bundle: PolicyBundle | None = None,
) -> dict[str, Any]:
    """Set a specific video frame as the step representative and re-run vision anchors.

    Picks ``frame_label`` (one of before_far/before_near/at/after_near/after_far) from
    ``signals.visual.frames``, crops a new element snapshot, re-runs the vision anchor
    LLM, and bumps meta.version. Returns a new document dict.
    """
    bundle = policy_bundle or get_policy_bundle()
    policy = bundle.data

    _VALID_LABELS = {"before_far", "before_near", "at", "after_near", "after_far"}
    if frame_label not in _VALID_LABELS:
        raise ValueError(f"invalid_frame_label: {frame_label!r}")

    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")

    step = dict(steps[step_index])
    if action_name(step).lower() == "scroll":
        raise ValueError("cannot_swap_frame_on_scroll_step")

    signals = dict(step.get("signals") or {})
    visual = dict(signals.get("visual") if isinstance(signals.get("visual"), dict) else {})

    frames = visual.get("frames") if isinstance(visual.get("frames"), dict) else {}
    frame_path_rel = frames.get(frame_label)
    if not frame_path_rel or not isinstance(frame_path_rel, str):
        raise ValueError(f"frame_not_available: {frame_label!r}")

    # Resolve the frame file on disk.
    frame_abs = resolve_skill_asset(frame_path_rel)
    if not frame_abs.is_file():
        raise ValueError("frame_file_missing_on_disk")

    # Generate a new element crop from the chosen frame.
    from conxa_compile.recorder.visual import crop_element_from_frame
    from conxa_core.config import settings as _settings

    bbox = visual.get("bbox") if isinstance(visual.get("bbox"), dict) else {}
    # frame_abs is data_dir/sessions/<id>/frames/<name> (already .resolve()-d by resolve_skill_asset)
    session_abs = frame_abs.parent.parent  # data_dir/sessions/<id>
    images_dir = session_abs / "images"
    el_out = images_dir / f"step_{step_index:04d}_frame_{frame_label}_element.jpg"
    cropped = crop_element_from_frame(frame_abs, bbox, el_out, jpeg_quality=_settings.screenshot_jpeg_quality)
    # Store as data-dir-relative path; el_out is absolute and under data_dir (resolved).
    el_rel: str | None = None
    if cropped is not None:
        try:
            el_rel = str(el_out.relative_to(_settings.data_dir.resolve())).replace("\\", "/")
        except ValueError:
            # Fallback: construct from session path
            try:
                el_rel = str(el_out.relative_to(session_abs.parent.parent)).replace("\\", "/")
            except ValueError:
                pass

    visual["full_screenshot"] = frame_path_rel
    visual["element_snapshot"] = el_rel
    visual["default_frame_label"] = frame_label

    from conxa_compile.compiler.intent_access import get_effective_intent_from_skill_step

    intent = get_effective_intent_from_skill_step(step) or str(step.get("intent") or "").strip()
    if not intent.strip():
        raise ValueError("intent_required_for_frame_apply")

    meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
    session_id = str(meta.get("source_session_id") or "").strip()

    session_root = (settings.data_dir / "sessions" / session_id).resolve() if session_id else frame_abs.parent.parent
    ev_llm = {"visual": dict(visual)}
    try:
        anchors = anchor_vision_llm.generate_anchors_for_step_or_raise(
            ev_llm,
            session_root=session_root,
            final_intent=intent,
            policy=policy,
            step_index=step_index,
        )
    except VisionAnchorGenerationError:
        anchors = []

    anchors = rank_merged_anchors(anchors, _ev_rank_stub_from_step(step), intent, policy)

    prev_vis = signals.get("visual") if isinstance(signals.get("visual"), dict) else {}
    merged_visual = dict(prev_vis)
    merged_visual.update(visual)
    signals["visual"] = merged_visual
    signals["anchors"] = list(anchors)
    step["signals"] = signals

    recovery = dict(step.get("recovery") or {})
    recovery["anchors"] = list(anchors)
    recovery["intent"] = intent
    recovery["final_intent"] = intent
    wf = (step.get("validation") or {}).get("wait_for") or {}
    recovery = merge_recovery_strategies_for_wait_shape(
        recovery,
        dict(wf) if isinstance(wf, dict) else {},
        policy,
    )
    step["recovery"] = recovery

    proto_base = dict(step.get("confidence_protocol") or _default_confidence_protocol(bundle))
    step["confidence_protocol"] = _merge_compile_warnings(
        proto_base,
        skill_step_for_destructive_check(step),
        anchors,
        policy,
    )

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta2 = dict(doc.get("meta") or {})
    meta2["version"] = int(meta2.get("version", 1)) + 1
    doc["meta"] = meta2
    return doc
