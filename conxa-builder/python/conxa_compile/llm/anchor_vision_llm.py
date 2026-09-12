"""Vision-only anchor generation at compile time (multimodal LLM)."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from conxa_compile.compiler.step_anchors import finalize_vision_anchors, finalize_vision_frameset
from conxa_core.config import settings
from conxa_core.db import db_get, db_set
# supports_multimodal_chat is re-exported here as part of this module's patchable
# surface (test_phases patches it on this module); keep the import even though the
# call happens elsewhere.
from conxa_compile.llm.client import call_llm, supports_multimodal_chat  # noqa: F401
from conxa_compile.policy.bundle import get_policy_bundle
from services.llm_proxy_client import ProxyUnavailable


class VisionAnchorGenerationError(Exception):
    """Compile must abort when vision anchors cannot be produced."""

    def __init__(self, reason: str, *, step_index: int | None = None, hint: str | None = None):
        self.reason = reason
        self.step_index = step_index
        self.hint = hint.strip()[:500] if hint else None
        super().__init__(reason)

    def api_detail(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "code": "vision_anchors_failed",
            "reason": self.reason,
            "step_index": self.step_index,
        }
        if self.hint:
            d["hint"] = self.hint
        return d


def _cache_path() -> Path:
    p = settings.data_dir / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p / "anchor_vision_llm_cache.json"


def _read_cache() -> dict[str, Any]:
    data = db_get("llm_cache", "anchor_vision")
    if data is not None:
        return data
    path = _cache_path()
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_cache(cache: dict[str, Any]) -> None:
    db_set("llm_cache", "anchor_vision", cache)
    try:
        _cache_path().write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def _vision_cfg(policy: dict[str, Any]) -> dict[str, Any]:
    sec = policy.get("anchors") if isinstance(policy.get("anchors"), dict) else {}
    raw = sec.get("vision")
    return raw if isinstance(raw, dict) else {}


def _parse_viewport_wh(viewport: str) -> tuple[int | None, int | None]:
    m = re.match(r"^(\d+)\s*x\s*(\d+)$", str(viewport or "").strip(), re.I)
    if not m:
        return None, None
    try:
        return int(m.group(1)), int(m.group(2))
    except ValueError:
        return None, None


_VISION_MAX_DIMENSION = 1024


def _downscale_and_encode(im: Image.Image, *, max_dimension: int = _VISION_MAX_DIMENSION) -> bytes:
    """Bound an image to ``max_dimension`` on its longest side and encode as JPEG.

    Vision LLM cost scales with image resolution, not source format, so every image
    handed to a vision provider goes through this — never a raw full-resolution frame.
    """
    im = im.copy()
    im.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
    buf = io.BytesIO()
    im.convert("RGB").save(buf, format="JPEG", quality=settings.screenshot_jpeg_quality, optimize=True)
    return buf.getvalue()


def _bounded_jpeg_bytes(image_bytes: bytes, *, max_dimension: int = _VISION_MAX_DIMENSION) -> bytes:
    """Re-encode arbitrary image bytes (e.g. a raw PNG video frame) as bounded JPEG."""
    with Image.open(io.BytesIO(image_bytes)) as im:
        return _downscale_and_encode(im.convert("RGB"), max_dimension=max_dimension)


def _apply_bbox_highlight(
    image_bytes: bytes,
    bbox: dict[str, Any],
    viewport: str,
    *,
    highlight_alpha: float,
) -> bytes:
    """Highlight the target bbox and return bounded-resolution JPEG bytes.

    Every return path — including a missing/degenerate bbox that skips highlighting —
    goes through ``_downscale_and_encode`` so the vision LLM never receives a raw,
    full-resolution PNG video frame (recorder frames are 1280x720 PNGs).
    """
    alpha = max(0.0, min(1.0, float(highlight_alpha)))
    try:
        x = float(bbox.get("x") or 0)
        y = float(bbox.get("y") or 0)
        w = float(bbox.get("w") or 0)
        h = float(bbox.get("h") or 0)
    except (TypeError, ValueError):
        x = y = w = h = 0.0

    with Image.open(io.BytesIO(image_bytes)) as im:
        im = im.convert("RGB")
        if w >= 1 and h >= 1:
            vw, vh = _parse_viewport_wh(viewport)
            dpr_x = (im.size[0] / vw) if vw and vw > 0 else 1.0
            dpr_y = (im.size[1] / vh) if vh and vh > 0 else dpr_x
            x1 = max(0, int(round(x * dpr_x)))
            y1 = max(0, int(round(y * dpr_y)))
            x2 = min(im.size[0], int(round((x + w) * dpr_x)))
            y2 = min(im.size[1], int(round((y + h) * dpr_y)))
            if x2 > x1 and y2 > y1:
                overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
                draw = ImageDraw.Draw(overlay)
                fill = (255, 0, 0, int(255 * alpha))
                outline = (255, 80, 80, 255)
                draw.rectangle(
                    (x1, y1, x2, y2), fill=fill, outline=outline, width=int(max(2, min(im.size) // 400))
                )
                im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
        return _downscale_and_encode(im)


def resolve_screenshot_path(session_root: Path, rel: str) -> Path:
    """Resolve a screenshot path relative to ``session_root``.

    Compiled skills persist paths like ``sessions/<id>/images/foo.jpg``. Strip that
    prefix when it matches ``session_root`` so the same vision pipeline works for
    raw recorder events (``images/...`` only) and for editor-swapped visuals.
    """
    root = session_root.resolve()
    raw = rel.strip().replace("\\", "/")
    if not raw or ".." in raw:
        raise VisionAnchorGenerationError("screenshot_path_invalid")
    sid = session_root.name
    prefix = f"sessions/{sid}/"
    if raw.startswith(prefix):
        raw = raw[len(prefix) :]
    elif raw.startswith("sessions/"):
        raise VisionAnchorGenerationError("screenshot_path_wrong_session")
    candidate = (root / raw).resolve()
    if root not in candidate.parents and candidate != root:
        raise VisionAnchorGenerationError("screenshot_path_escapes_session")
    return candidate


class _PreparedVisionRequest:
    """A cache-miss single-image vision-anchor request (legacy structured-anchor
    path — used only by generate_anchors_from_image_bytes, which has no
    session_root/frames to build a frameset from)."""

    __slots__ = ("cache_key", "user_text", "image_b64")

    def __init__(self, cache_key: str, user_text: str, image_b64: str) -> None:
        self.cache_key = cache_key
        self.user_text = user_text
        self.image_b64 = image_b64


_FRAME_LABELS_ORDER = ("before_far", "before_near", "at", "after_near", "after_far")


class _PreparedFramesetRequest:
    """A cache-miss anchor_vision_frameset request, ready to send: one step's
    (up to) 5 time-offset frames, each already highlighted/downscaled/encoded."""

    __slots__ = ("cache_key", "user_text", "frames")

    def __init__(self, cache_key: str, user_text: str, frames: list[tuple[str, str]]) -> None:
        self.cache_key = cache_key
        self.user_text = user_text
        self.frames = frames  # [(label, base64), ...] in _FRAME_LABELS_ORDER


def _prepare_frameset_vision_request(
    ev: dict[str, Any],
    *,
    session_root: Path,
    final_intent: str,
    policy: dict[str, Any],
    step_index: int,
) -> dict[str, Any] | _PreparedFramesetRequest:
    """Resolve a step's frames (all 5, or a 1-frame fallback for legacy recordings),
    apply the highlight to each, compute the cache key, and check the cache.
    Returns the cached finalized dict directly on a hit, or a
    _PreparedFramesetRequest to actually send on a miss. Raises
    VisionAnchorGenerationError for anything that can't be prepared at all
    (missing/unreadable screenshots, disabled)."""
    if os.environ.get("CONXA_DISABLE_VISION_ANCHORS", "").strip().lower() in ("1", "true", "yes"):
        raise VisionAnchorGenerationError("llm_anchor_vision_disabled", step_index=step_index)
    if not bool(_vision_cfg(policy).get("enabled", True)):
        raise VisionAnchorGenerationError("vision_anchors_disabled_in_policy", step_index=step_index)

    visual = ev.get("visual") if isinstance(ev.get("visual"), dict) else {}
    frames_map = visual.get("frames") if isinstance(visual.get("frames"), dict) else {}
    if not frames_map:
        # Recordings captured before 5-frame extraction shipped: fall back to the
        # single full_screenshot frame, labeled as before_near.
        fallback_rel = str(visual.get("full_screenshot") or "").strip()
        frames_map = {"before_near": fallback_rel} if fallback_rel else {}
    if not frames_map:
        raise VisionAnchorGenerationError("full_screenshot_path_missing", step_index=step_index)

    bbox = visual.get("bbox") if isinstance(visual.get("bbox"), dict) else {}
    viewport = str(visual.get("viewport") or "")
    vcfg = _vision_cfg(policy)
    hi = float(vcfg.get("highlight_alpha", 0.35))

    frame_hashes: list[str] = []
    frames: list[tuple[str, str]] = []
    for label in _FRAME_LABELS_ORDER:
        rel_path = str(frames_map.get(label) or "").strip()
        if not rel_path:
            continue
        try:
            abs_path = resolve_screenshot_path(session_root, rel_path)
        except VisionAnchorGenerationError:
            continue
        if not abs_path.is_file():
            continue
        raw_bytes = abs_path.read_bytes()
        image_bytes = _apply_bbox_highlight(raw_bytes, bbox, viewport, highlight_alpha=hi)
        frame_hashes.append(hashlib.sha256(image_bytes).hexdigest())
        frames.append((label, base64.standard_b64encode(image_bytes).decode("ascii")))

    if not frames:
        raise VisionAnchorGenerationError("screenshot_file_missing:all_frames", step_index=step_index)

    prompt_ver = str(vcfg.get("prompt_version", "1"))
    cache_key = hashlib.sha256(
        json.dumps(
            {"h": frame_hashes, "bbox": bbox, "intent": final_intent, "pv": prompt_ver},
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()

    cache = _read_cache()
    if cache_key in cache:
        entry = cache[cache_key]
        if isinstance(entry, dict) and entry.get("anchor_sentence"):
            return dict(entry)

    labels_present = ", ".join(l for l, _ in frames)
    user_text = (
        "Image size and target bounding box (CSS px): "
        f"x={bbox.get('x')}, y={bbox.get('y')}, w={bbox.get('w')}, h={bbox.get('h')}. "
        f"Viewport (CSS px): {viewport or 'unknown'}.\n"
        f"Frames present: {labels_present}.\n"
        f"User intent hint (snake_case): {final_intent or 'unknown'}"
    )

    return _PreparedFramesetRequest(cache_key=cache_key, user_text=user_text, frames=frames)


_WAVE_BACKOFFS_S = (1.0, 4.0, 4.0)  # mirrors services/llm_proxy_client.py's _RETRY_BACKOFFS_S shape


def prefetch_vision_anchors_parallel(
    items: list[tuple[int, dict[str, Any], str]],
    *,
    session_root: Path,
    policy: dict[str, Any],
) -> None:
    """Best-effort parallel prefetch for a compile's whole set of upcoming vision-
    anchor requests — one anchor_vision_frameset call per step (5 frames each),
    up to llm_anchor_vision_max_concurrent_steps in flight at once, instead of
    firing them one at a time. A step whose call raises ProxyUnavailable (pool
    exhausted/rate-limited) is requeued into the next wave after a short backoff;
    a step failing for any other reason is dropped (never retried).

    ``items`` is (step_index, event, final_intent) for every step that will need
    a vision anchor. Cache hits and preparation failures are skipped here —
    generate_anchors_for_step_or_raise's own per-step call remains the source of
    truth and handles both cases (and any step this function couldn't prefetch)
    exactly as it always has. This function never raises: any failure here just
    means less of the per-step work got prefetched, not that the compile breaks.
    """
    prepared: dict[int, _PreparedFramesetRequest] = {}
    for step_index, ev, final_intent in items:
        try:
            result = _prepare_frameset_vision_request(
                ev, session_root=session_root, final_intent=final_intent, policy=policy, step_index=step_index
            )
        except VisionAnchorGenerationError:
            continue
        if isinstance(result, _PreparedFramesetRequest):
            prepared[step_index] = result

    if not prepared:
        return

    cache = _read_cache()
    cache_lock = threading.Lock()
    max_workers = max(1, int(settings.llm_anchor_vision_max_concurrent_steps))
    max_retries = max(0, int(settings.llm_anchor_vision_max_wave_retries))

    pending: dict[int, _PreparedFramesetRequest] = dict(prepared)
    wave = 0
    while pending and wave <= max_retries:
        if wave > 0:
            time.sleep(_WAVE_BACKOFFS_S[min(wave - 1, len(_WAVE_BACKOFFS_S) - 1)])
        wave += 1
        requeue: dict[int, _PreparedFramesetRequest] = {}
        with ThreadPoolExecutor(max_workers=min(max_workers, len(pending))) as ex:
            futs = {ex.submit(_prefetch_one_step, req, policy): step_index for step_index, req in pending.items()}
            done, _pending_futs = wait(set(futs), timeout=settings.llm_vision_timeout_ms / 1000.0 + 30.0)
            for fut in done:
                step_index = futs[fut]
                try:
                    outcome = fut.result()
                except Exception:  # noqa: BLE001 — never let one worker kill the wave
                    continue
                if outcome.get("requeue"):
                    requeue[step_index] = pending[step_index]
                elif outcome.get("finalized"):
                    with cache_lock:
                        cache[pending[step_index].cache_key] = outcome["finalized"]
            # Futures that never showed up in `done` (deadline hit) are dropped, not
            # requeued — a wave-level timeout means the pool is likely unhealthy; let
            # the retry ceiling (and the eventual per-step raise at build time) handle
            # it, not an unbounded number of extra waves.
        pending = requeue

    _write_cache(cache)


def _prefetch_one_step(req: "_PreparedFramesetRequest", policy: dict[str, Any]) -> dict[str, Any]:
    """Worker: run one step's frameset call. Returns {"finalized": dict} on success,
    {"requeue": True} on a transient (ProxyUnavailable) failure — the signal that the
    provider pool was exhausted/rate-limited, see services/llm_proxy_client.py — or {}
    to drop the step from prefetch entirely (any other error: quota, malformed
    response, etc. — never retried)."""
    payload = {
        "frames": [{"label": l, "image_base64": b, "image_mime": "image/jpeg"} for l, b in req.frames],
        "user_text": req.user_text,
    }
    try:
        data = call_llm("anchor_vision_frameset", payload, settings.llm_vision_timeout_ms)
    except ProxyUnavailable:
        return {"requeue": True}
    except Exception:  # noqa: BLE001 — non-transient, drop from prefetch
        return {}
    if not isinstance(data, dict):
        return {}
    finalized = finalize_vision_frameset(data.get("chosen_frame"), data.get("anchor_sentence"), policy)
    if not finalized.get("anchor_sentence"):
        return {}
    return {"finalized": finalized}


def generate_anchors_for_step_or_raise(
    ev: dict[str, Any],
    *,
    session_root: Path,
    final_intent: str,
    policy: dict[str, Any],
    step_index: int,
) -> dict[str, Any]:
    """Return {"chosen_frame", "anchor_sentence", "anchor_phrases"} or raise
    VisionAnchorGenerationError."""
    prepared = _prepare_frameset_vision_request(
        ev, session_root=session_root, final_intent=final_intent, policy=policy, step_index=step_index
    )
    if isinstance(prepared, dict):
        return prepared
    cache_key = prepared.cache_key

    payload = {
        "frames": [{"label": l, "image_base64": b, "image_mime": "image/jpeg"} for l, b in prepared.frames],
        "user_text": prepared.user_text,
    }
    err_lines: list[str] = []
    try:
        data = call_llm(
            "anchor_vision_frameset",
            payload,
            settings.llm_vision_timeout_ms,
            error_detail=err_lines,
        )
    except ProxyUnavailable as exc:
        # The proxy client already retried this with backoff and the cloud router
        # already failed over across its whole pool before raising — surface it the
        # same way an exhausted-but-not-raising call used to (below), so the existing
        # VisionAnchorGenerationError / vision_anchor_fallback_on_exhaustion handling
        # in build.py doesn't need to know this can now also arrive as an exception.
        raise VisionAnchorGenerationError(
            "vision_llm_request_failed",
            step_index=step_index,
            hint="; ".join(exc.error_detail) if exc.error_detail else str(exc),
        ) from exc
    if not isinstance(data, dict):
        joined = "; ".join(err_lines) if err_lines else ""
        if joined:
            raise VisionAnchorGenerationError(
                "vision_llm_request_failed",
                step_index=step_index,
                hint=joined,
            )
        raise VisionAnchorGenerationError("vision_llm_empty_response", step_index=step_index)

    finalized = finalize_vision_frameset(data.get("chosen_frame"), data.get("anchor_sentence"), policy)
    if not finalized.get("anchor_sentence"):
        raise VisionAnchorGenerationError("vision_llm_invalid_anchor_sentence", step_index=step_index)

    cache = _read_cache()
    cache[cache_key] = finalized
    _write_cache(cache)
    return finalized


def get_chosen_frame_image(
    ev: dict[str, Any],
    *,
    session_root: Path,
    final_intent: str,
    policy: dict[str, Any],
    step_index: int,
) -> tuple[str, str] | None:
    """Re-derive and encode ONLY the frame the vision-anchor stage already
    chose for this step (for the workflow-review multimodal call) — never all
    5. `final_intent` must match what generate_anchors_for_step_or_raise used
    for this step so the cache lookup hits and no LLM call happens here.

    Returns (image_base64, image_mime) or None when there's no cached choice
    (vision anchors disabled/failed for this step, or its frame file is
    missing) — the review call just sends text for it, same treatment as any
    step with no anchor."""
    try:
        prepared = _prepare_frameset_vision_request(
            ev, session_root=session_root, final_intent=final_intent, policy=policy, step_index=step_index
        )
    except VisionAnchorGenerationError:
        return None
    if not isinstance(prepared, dict):
        return None  # cache miss: the anchor call never completed for this step
    chosen_label = str(prepared.get("chosen_frame") or "")
    if not chosen_label:
        return None

    visual = ev.get("visual") if isinstance(ev.get("visual"), dict) else {}
    frames_map = visual.get("frames") if isinstance(visual.get("frames"), dict) else {}
    if not frames_map:
        fallback_rel = str(visual.get("full_screenshot") or "").strip()
        frames_map = {"before_near": fallback_rel} if fallback_rel else {}
    rel_path = str(frames_map.get(chosen_label) or "").strip()
    if not rel_path:
        return None
    try:
        abs_path = resolve_screenshot_path(session_root, rel_path)
    except VisionAnchorGenerationError:
        return None
    if not abs_path.is_file():
        return None

    bbox = visual.get("bbox") if isinstance(visual.get("bbox"), dict) else {}
    viewport = str(visual.get("viewport") or "")
    hi = float(_vision_cfg(policy).get("highlight_alpha", 0.35))
    image_bytes = _apply_bbox_highlight(abs_path.read_bytes(), bbox, viewport, highlight_alpha=hi)
    return base64.standard_b64encode(image_bytes).decode("ascii"), "image/jpeg"


def generate_anchors_from_image_bytes(
    image_bytes: bytes,
    intent: str,
    step_index: int,
    *,
    policy: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Generate vision anchors from raw image bytes (no session_root or bbox needed).

    Returns [] on any failure so callers can fall back to keyword anchors.
    """
    pol: dict[str, Any] = policy if isinstance(policy, dict) else get_policy_bundle().data
    vcfg = _vision_cfg(pol)
    if not bool(vcfg.get("enabled", True)):
        return []

    try:
        image_bytes = _bounded_jpeg_bytes(image_bytes)
        with Image.open(io.BytesIO(image_bytes)) as _im:
            bw, bh = int(_im.size[0]), int(_im.size[1])
    except Exception:
        return []

    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    prompt_ver = str(vcfg.get("prompt_version", "1"))
    cache_key = hashlib.sha256(
        json.dumps(
            {
                "h": hashlib.sha256(image_bytes).hexdigest(),
                "intent": intent,
                "pv": prompt_ver,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()

    cache = _read_cache()
    if cache_key in cache:
        entry = cache[cache_key]
        if isinstance(entry, dict) and entry.get("anchors"):
            return [dict(a) for a in entry["anchors"]]

    user_text = (
        "Look at this UI screenshot. Identify the most prominent interactive element.\n\n"
        f"Image size (pixels): {bw}x{bh}.\n"
        f"User intent hint (snake_case): {intent or 'unknown'}\n\n"
        "Describe the target element in one short, human-friendly phrase (primary_phrase). "
        "Add up to three secondary anchors: section, parent, or nearby labeled controls — "
        "each with relation inside, above, below, or near.\n"
        "Relation direction is TARGET relative to ANCHOR:\n"
        "- above means the target is above the anchor text/control.\n"
        "- below means the target is below the anchor text/control.\n"
        "- inside means the target is inside the named section/parent.\n"
        "- near means close by without a clear vertical relation.\n"
        "Avoid DOM jargon (no div/container/element-only). Return JSON only."
    )

    payload = {
        "user_text": user_text,
        "image_base64": image_b64,
        "image_mime": "image/jpeg",
    }
    data = call_llm("anchor_vision", payload, settings.llm_vision_timeout_ms)
    if not isinstance(data, dict):
        return []

    primary = str(data.get("primary_phrase") or data.get("primary") or "").strip()
    sec_raw = data.get("secondary")
    if not isinstance(sec_raw, list):
        sec_raw = []

    try:
        finalized = finalize_vision_anchors(primary, sec_raw, pol)
    except Exception:
        return []

    if finalized:
        cache[cache_key] = {"anchors": finalized}
        _write_cache(cache)
    return finalized
