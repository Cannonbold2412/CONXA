"""Vision-only anchor generation at compile time (multimodal LLM)."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from conxa_compile.compiler.step_anchors import finalize_vision_anchors
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
    """A cache-miss vision-anchor request, ready to send — either as one
    anchor_vision call or grouped into a batched anchor_vision_batch call."""

    __slots__ = ("cache_key", "user_text", "image_b64")

    def __init__(self, cache_key: str, user_text: str, image_b64: str) -> None:
        self.cache_key = cache_key
        self.user_text = user_text
        self.image_b64 = image_b64


def _prepare_vision_request(
    ev: dict[str, Any],
    *,
    session_root: Path,
    final_intent: str,
    policy: dict[str, Any],
    step_index: int,
) -> list[dict[str, Any]] | _PreparedVisionRequest:
    """Shared prep for both the single-step and batched paths: resolve the
    screenshot, apply the highlight, compute the cache key, and check the
    cache. Returns cached anchors directly on a hit, or a _PreparedVisionRequest
    to actually send on a miss. Raises VisionAnchorGenerationError for anything
    that can't be prepared at all (missing/unreadable screenshot, disabled)."""
    if os.environ.get("CONXA_DISABLE_VISION_ANCHORS", "").strip().lower() in ("1", "true", "yes"):
        raise VisionAnchorGenerationError("llm_anchor_vision_disabled", step_index=step_index)
    if not bool(_vision_cfg(policy).get("enabled", True)):
        raise VisionAnchorGenerationError("vision_anchors_disabled_in_policy", step_index=step_index)

    visual = ev.get("visual") if isinstance(ev.get("visual"), dict) else {}
    rel_path = str(visual.get("full_screenshot") or "").strip()
    if not rel_path:
        raise VisionAnchorGenerationError("full_screenshot_path_missing", step_index=step_index)

    abs_path = resolve_screenshot_path(session_root, rel_path)
    if not abs_path.is_file():
        raise VisionAnchorGenerationError(f"screenshot_file_missing:{rel_path}", step_index=step_index)

    raw_bytes = abs_path.read_bytes()
    bbox = visual.get("bbox") if isinstance(visual.get("bbox"), dict) else {}
    viewport = str(visual.get("viewport") or "")
    vcfg = _vision_cfg(policy)
    hi = float(vcfg.get("highlight_alpha", 0.35))
    image_bytes = _apply_bbox_highlight(raw_bytes, bbox, viewport, highlight_alpha=hi)
    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    prompt_ver = str(vcfg.get("prompt_version", "1"))
    cache_key = hashlib.sha256(
        json.dumps(
            {
                "h": hashlib.sha256(image_bytes).hexdigest(),
                "bbox": bbox,
                "intent": final_intent,
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

    try:
        with Image.open(io.BytesIO(image_bytes)) as _im_sz:
            bw, bh = int(_im_sz.size[0]), int(_im_sz.size[1])
    except Exception:
        raise VisionAnchorGenerationError("screenshot_unreadable", step_index=step_index) from None

    user_text = (
        "Look at this UI screenshot. The highlighted region is the target element.\n\n"
        f"Image size (pixels): {bw}x{bh}. Viewport (CSS px): {viewport or 'unknown'}.\n"
        f"Target bounding box (CSS px): x={bbox.get('x')}, y={bbox.get('y')}, "
        f"w={bbox.get('w')}, h={bbox.get('h')}.\n"
        f"User intent hint (snake_case): {final_intent or 'unknown'}\n\n"
        "Describe what the target is in one short, human-friendly phrase (primary_phrase). "
        "Add up to three secondary anchors: section, parent, or nearby labeled controls — "
        "each with relation inside, above, below, or near.\n"
        "Relation direction is TARGET relative to ANCHOR:\n"
        "- above means the highlighted target is above the anchor text/control.\n"
        "- below means the highlighted target is below the anchor text/control.\n"
        "- inside means the highlighted target is inside the named section/parent.\n"
        "- near means close by without a clear vertical relation.\n"
        "Examples: if the highlighted target is below an Email label, return "
        '{"element":"email label","relation":"below"}. '
        "If the highlighted target is above a Password input or Sign in button, return "
        '{"element":"password input","relation":"above"} or '
        '{"element":"sign in button","relation":"above"}.\n'
        "Avoid DOM jargon (no div/container/element-only). Return JSON only."
    )

    return _PreparedVisionRequest(cache_key=cache_key, user_text=user_text, image_b64=image_b64)


def prefetch_vision_anchors_batch(
    items: list[tuple[int, dict[str, Any], str]],
    *,
    session_root: Path,
    policy: dict[str, Any],
) -> None:
    """Best-effort batch prefetch for a compile's whole set of upcoming vision-
    anchor requests — several images per anchor_vision_batch call instead of one
    request per step, so a large workflow doesn't fire 40+ serial vision calls
    (fewer round trips, fewer chances to land on a drained provider pool).

    ``items`` is (step_index, event, final_intent) for every step that will need
    a vision anchor. Cache hits and preparation failures are skipped here —
    generate_anchors_for_step_or_raise's own per-step call remains the source of
    truth and handles both cases (and any group this function couldn't batch)
    exactly as it always has. This function never raises: any failure here just
    means less of the per-step work got prefetched, not that the compile breaks.
    """
    prepared: list[_PreparedVisionRequest] = []
    for step_index, ev, final_intent in items:
        try:
            result = _prepare_vision_request(
                ev, session_root=session_root, final_intent=final_intent, policy=policy, step_index=step_index
            )
        except VisionAnchorGenerationError:
            continue
        if isinstance(result, _PreparedVisionRequest):
            prepared.append(result)

    if not prepared:
        return

    batch_size = max(1, int(settings.llm_anchor_vision_batch_size))
    cache = _read_cache()
    cache_dirty = False
    for i in range(0, len(prepared), batch_size):
        group = prepared[i : i + batch_size]
        payload = {
            "items": [
                {"image_base64": p.image_b64, "image_mime": "image/jpeg", "user_text": p.user_text}
                for p in group
            ]
        }
        try:
            data = call_llm("anchor_vision_batch", payload, settings.llm_vision_timeout_ms)
        except Exception:  # noqa: BLE001 — best-effort prefetch (incl. ProxyUnavailable), never fatal
            continue
        if not isinstance(data, dict):
            continue
        results = data.get("results")
        if not isinstance(results, list):
            continue
        # Ordering isn't contractually guaranteed by the model — a misaligned
        # response just means those entries stay uncached and fall through to
        # the normal single-image call later, not a correctness problem.
        for prepared_item, item_result in zip(group, results):
            if not isinstance(item_result, dict):
                continue
            primary = str(item_result.get("primary_phrase") or item_result.get("primary") or "").strip()
            sec_raw = item_result.get("secondary")
            if not isinstance(sec_raw, list):
                sec_raw = []
            finalized = finalize_vision_anchors(primary, sec_raw, policy)
            if not finalized or str(finalized[0].get("relation") or "") != "target" or not str(
                finalized[0].get("element") or ""
            ).strip():
                continue
            cache[prepared_item.cache_key] = {"anchors": finalized}
            cache_dirty = True
    if cache_dirty:
        _write_cache(cache)


def generate_anchors_for_step_or_raise(
    ev: dict[str, Any],
    *,
    session_root: Path,
    final_intent: str,
    policy: dict[str, Any],
    step_index: int,
) -> list[dict[str, Any]]:
    """Return vision-only anchors or raise VisionAnchorGenerationError."""
    prepared = _prepare_vision_request(
        ev, session_root=session_root, final_intent=final_intent, policy=policy, step_index=step_index
    )
    if isinstance(prepared, list):
        return prepared
    cache_key = prepared.cache_key

    payload = {
        "user_text": prepared.user_text,
        "image_base64": prepared.image_b64,
        "image_mime": "image/jpeg",
    }
    err_lines: list[str] = []
    try:
        data = call_llm(
            "anchor_vision",
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

    primary = str(data.get("primary_phrase") or data.get("primary") or "").strip()
    sec_raw = data.get("secondary")
    if not isinstance(sec_raw, list):
        sec_raw = []

    finalized = finalize_vision_anchors(primary, sec_raw, policy)
    if not finalized or str(finalized[0].get("relation") or "") != "target" or not str(
        finalized[0].get("element") or ""
    ).strip():
        raise VisionAnchorGenerationError("vision_llm_invalid_primary_phrase", step_index=step_index)

    cache = _read_cache()
    cache[cache_key] = {"anchors": finalized}
    _write_cache(cache)
    return finalized


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
