"""Studio-side client for the Human Review Copilot's diagnosis-and-repair task (BUILD-26 stage b).

One call per conversation turn — there is no multi-turn *session* on this call path
(`ProxyBody` carries no `messages` field — every task builds a fresh `[system, user]` pair per
call), so the whole conversation lives in the renderer and is flattened into one payload each
turn; this module stays stateless either way. Two LLM calls make up one turn (BUILD-26 stage c):
a streamed `copilot_reply` call for the prose the reviewer reads live, and the existing
`copilot_diagnose` call for proposals — kept as two calls, not one, because `copilot_diagnose`'s
JSON-object contract can't be streamed cleanly (see `conxa_core.llm.client`'s `copilot_reply` and
`copilot_diagnose` branches for both prompts).
"""

from __future__ import annotations

import json
from typing import Any, Callable

from conxa_core.config import settings

from conxa_compile.llm.anchor_vision_llm import _bounded_jpeg_bytes
from conxa_compile.llm.client import call_llm, stream_llm
from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded


def _format_transcript(transcript: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for turn in transcript:
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role") or "user").strip() or "user"
        text = str(turn.get("text") or "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines)


def _llm_reply_text(data: dict[str, Any] | None) -> str:
    """Pull the reviewer's prose out of whatever envelope the model/router handed back.

    Streamed `copilot_reply` is `{text, output}`. JSON `copilot_diagnose` is `{reply, proposals}`.
    Providers that ignore json_object mode fall through `_normalize_openai_response` as
    `{text, output}` with no `reply` key — that is still the answer, not a failed turn."""
    if not isinstance(data, dict):
        return ""
    for key in ("reply", "text", "output"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _encode_screenshot(path: str | None) -> str | None:
    """Read + downscale a screenshot for the vision call, matching
    region_selector_vision.py's own read → downscale → base64 shape exactly. Missing/unreadable
    is the same as "no screenshot" — the graceful-degrade case, never an error."""
    if not path:
        return None
    try:
        import base64
        from pathlib import Path

        raw = Path(path).read_bytes()
        return base64.standard_b64encode(_bounded_jpeg_bytes(raw)).decode("ascii")
    except Exception:  # noqa: BLE001 — an unreadable image degrades to text-only, never an error
        return None


def copilot_turn(
    *,
    evidence: dict[str, Any],
    transcript: list[dict[str, Any]],
    message: str,
    screenshot_path: str | None = None,
    model: str | None = None,
    on_delta: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """One turn of the Human Review copilot conversation.

    Two calls, not one (BUILD-26 stage c): a streamed ``copilot_reply`` call produces the prose
    the reviewer reads live via ``on_delta`` (skipped — falls back to the non-streamed reply
    below — when ``on_delta`` is None, e.g. an older caller that hasn't wired streaming yet), and
    the existing ``copilot_diagnose`` call still runs for proposals (its own ``reply`` field is
    ignored once a streamed reply exists, since it's the same answer generated twice — kept
    only as the reply's fallback source when streaming is unavailable or came back empty).

    Returns ``{"reply": str, "proposals": list[dict]}``. Graceful-empty on any failure —
    matching `workflow_intent.py` / `workflow_semantics.py` — **except** QuotaExceeded /
    EntitlementBlocked / CloudUnreachable, which propagate so the caller
    (`handlers/copilot.py`) can surface an actionable message ("your Human Edit pool is
    exhausted") instead of the panel going silently mute — the same carve-out
    `region_selector_vision.py` makes.
    """
    user_text = (
        "Evidence about the workflow and (if relevant) its most recent test failure:\n"
        f"{json.dumps(evidence, ensure_ascii=False, default=str)}\n\n"
    )
    history = _format_transcript(transcript)
    if history:
        user_text += f"Conversation so far:\n{history}\n\n"
    user_text += f"Reviewer's message: {message}"

    payload: dict[str, Any] = {"user_text": user_text}
    image_b64 = _encode_screenshot(screenshot_path)
    if image_b64:
        payload["image_base64"] = image_b64
        payload["image_mime"] = "image/jpeg"
    else:
        # No screenshot on disk, or no vision provider will ever see it either way — say so
        # explicitly rather than silently sending a bare question, per the plan's graceful-
        # degrade note ("diagnosis quality drops; nothing breaks").
        user_text += "\n\n(No failure screenshot is available for this turn.)"
        payload["user_text"] = user_text
    if model:
        payload["model"] = model

    streamed_parts: list[str] = []
    if on_delta is not None:
        def _forward_delta(chunk: str) -> None:
            if chunk:
                streamed_parts.append(chunk)
            on_delta(chunk)

        stream_err_lines: list[str] = []
        try:
            stream_result = stream_llm(
                "copilot_reply", payload, settings.llm_vision_timeout_ms,
                on_delta=_forward_delta, error_detail=stream_err_lines,
            )
        except (QuotaExceeded, EntitlementBlocked, CloudUnreachable):
            raise
        except Exception:  # noqa: BLE001 — streaming failure falls back to the non-streamed reply below
            stream_result = None
        streamed_reply = "".join(streamed_parts).strip() or _llm_reply_text(
            stream_result if isinstance(stream_result, dict) else None
        )
    else:
        streamed_reply = ""

    err_lines: list[str] = []
    try:
        data = call_llm(
            "copilot_diagnose", payload, settings.llm_vision_timeout_ms, error_detail=err_lines
        )
    except (QuotaExceeded, EntitlementBlocked, CloudUnreachable):
        raise
    except Exception:  # noqa: BLE001 — any other failure degrades to an empty turn, never a crash
        data = None

    if not isinstance(data, dict):
        return {"reply": streamed_reply, "proposals": []}

    reply = streamed_reply or _llm_reply_text(data)
    raw_proposals = data.get("proposals")
    proposals = [p for p in raw_proposals if isinstance(p, dict)] if isinstance(raw_proposals, list) else []
    return {"reply": reply, "proposals": proposals}
