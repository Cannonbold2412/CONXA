"""Playwright-backed recording session (Phase 1 — capture only, no execution)."""

from __future__ import annotations

import asyncio
import copy
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, SimpleQueue
from typing import Any

if os.environ.get("SKILL_ENVIRONMENT") == "production" or os.environ.get("RENDER"):
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "0")

from playwright.sync_api import sync_playwright

from conxa_core.config import settings
from conxa_core.metrics.store import metrics
from conxa_core.models.events import RecordedEvent
from conxa_compile.policy.bundle import get_policy_bundle
from conxa_compile.policy.timing import resolve_event_timing
from conxa_core.sanitize import scrub_surrogates as _sanitize_surrogates
from conxa_core.storage import snapshots as snapshot_store


from conxa_compile.recorder.frame_utils import (
    _frame_context_and_offset_sync,
    _frame_element_attrs_and_rect,
    _frame_parent,
    _frame_url,
    _load_bridge_script,
    _typing_target_key,
    _viewport_string_from_page,
    format_startup_error,
    is_blank_url,
)

# Both is_connected() and context.pages have been observed to read "gone" for
# several real seconds — not just one flaky tick — while the browser is still
# open and busy loading a heavy same-page iframe (e.g. HubSpot's "Create new"
# object-builder embed). Ending the recording on the first bad reading silently
# truncates it mid-session. Require the bad reading to persist across this many
# consecutive 0.2s loop ticks before treating it as a real close/crash — a
# genuine close is unaffected, it just confirms a few seconds later. Measured
# against real HubSpot recordings, the 8s (40-tick) window was consistently
# exhausted by that specific panel's load time, so this is now 20s.
_NO_PAGES_GRACE_TICKS = 100  # ~20s at the loop's 0.2s cadence


@dataclass
class RecordingSession:
    """
    Owns one browser context + page, drains in-page events into structured JSON.

    Threading: Playwright calls `expose_binding` from the driver thread; we forward
    payloads into an asyncio.Queue via call_soon_threadsafe for a single consumer.
    """

    session_id: str
    start_url: str = "about:blank"
    data_root: Path = field(default_factory=lambda: settings.data_dir)
    storage_state_path: str = ""  # if set, browser context is restored from this Playwright storage_state file
    storage_state_autosave_path: str = ""  # if set, periodically persist context storage_state while open
    # Video recording is MANDATORY for non-auth sessions; no flag to disable.
    # auth_mode sessions are exempt (no video, no bridge, no events — see auth_mode field).
    _video_session_start: float = 0.0  # monotonic time when recording started; events.timestamp_ms is relative to this
    _video_session_start_wall_ms: int = 0  # wall-clock ms-since-epoch at video start (for ISO timestamp → relative ms conversion)
    _playwright: Any = None
    _browser: Any = None
    _context: Any = None
    _page: Any = None
    _thread: threading.Thread | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _stop_requested: threading.Event = field(default_factory=threading.Event)
    _startup_done: threading.Event = field(default_factory=threading.Event)
    _startup_error: str = ""
    _seq: int = 0
    _materialized: list[RecordedEvent] = field(default_factory=list)
    _pending_payloads: SimpleQueue = field(default_factory=SimpleQueue)
    _last_enqueue_at: float = 0.0
    _last_storage_state_save_at: float = 0.0
    _bridge_script: str = ""
    _bridge_install_error_keys: set[str] = field(default_factory=set)
    _frame_diag_seen: set[str] = field(default_factory=set)
    _traces: list[dict] = field(default_factory=list)
    _frame_snapshots: list[dict] = field(default_factory=list)
    # Event-driven (not sampled) frame attach/navigate/detach log — complements the periodic
    # _frame_snapshots, which only sees a frame if it's still around at the ~1s sample tick.
    # This catches a frame that attaches and detaches faster than any polling interval.
    _frame_lifecycle: list[dict] = field(default_factory=list)
    # Wall-clock (monotonic) of each frame's most recent attach/navigate event, keyed by Python
    # object identity (stable for the frame's lifetime, unlike its URL which is empty mid-
    # transition). Used to defer bridge-install checks away from the exact instant a frame is
    # least stable — see _BRIDGE_INSTALL_SETTLE_S.
    _frame_last_transition_ts: dict[int, float] = field(default_factory=dict)
    _pump_tick: int = 0
    _no_pages_streak: int = 0
    binding_errors: list[str] = field(default_factory=list)
    browser_open: bool = False
    ended_by_user: bool = False
    wait_for_url: str = ""
    reached_wait_url: bool = False
    auth_mode: bool = False  # skip bridge/events — only capture storage state
    capture_hover: bool = False
    current_url: str = ""
    # Phase 2: dedup state for DOM snapshots. Maps short bridge signature -> snapshot_ref.
    _snapshot_refs_by_sig: dict[str, str] = field(default_factory=dict)
    _last_snapshot_hash: str = ""
    _last_snapshot_ref: str = ""
    # A11y capture: one-strike degradation if slow (> 500ms).
    _last_a11y_capture_time: float = 0.0
    _a11y_skip_count: int = 0

    def _remember_current_url(self, url: str) -> None:
        value = str(url or "").strip()
        if not value or is_blank_url(value):
            return
        self.current_url = value

    def _remember_page_url_sync(self, page: Any | None) -> None:
        if page is None:
            return
        try:
            if page.is_closed():
                return
            self._remember_current_url(page.url)
        except Exception:  # noqa: BLE001
            pass

    def _url_matches_wait_target(self, url: str) -> bool:
        if not self.wait_for_url or not url:
            return False
        # Exclude start URL and any query-param/fragment/sub-path variant of it
        # (e.g. login pages that append ?returnUrl=... before auth completes)
        start_base = self.start_url.split("?")[0].split("#")[0]
        if url.startswith(start_base):
            return False
        import re as _re
        prefix = _re.split(r"\{\{", self.wait_for_url, maxsplit=1)[0]
        return bool(prefix) and url.startswith(prefix)

    def _shutdown_playwright_sync(self) -> None:
        if self._context is not None:
            self._context.close()
            self._context = None
        if self._browser is not None:
            self._browser.close()
            self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None
        self._page = None
        try:
            self._finalize_video_recording_sync()
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"frame_extraction_error: {exc!s}")

    def _finalize_video_recording_sync(self) -> None:
        """Rename Playwright's auto-generated .webm to recording.webm + extract frames.

        Auth-mode sessions are exempt (they don't record video). For non-auth
        sessions, missing video or frame-extraction failure raises — silent
        degradation is no longer allowed.
        """
        if self.auth_mode:
            return
        session_dir = self.data_root / "sessions" / self.session_id
        if not session_dir.is_dir():
            raise RuntimeError(f"session_dir missing at finalize: {session_dir}")

        target = session_dir / "recording.webm"
        webm_files = sorted(
            (p for p in session_dir.iterdir() if p.suffix == ".webm" and p.name != "recording.webm"),
            key=lambda p: p.stat().st_mtime,
        )
        if webm_files:
            latest = webm_files[-1]
            latest.replace(target)
        elif not target.is_file():
            raise RuntimeError(
                f"recording.webm not produced by Playwright in {session_dir}. "
                "Check that the browser context was launched with record_video_dir and the "
                "session closed cleanly via context.close()."
            )

        events_path = session_dir / "events.jsonl"
        if not events_path.is_file():
            with self._lock:
                event_count = len(self._materialized)
            if event_count == 0:
                self.binding_errors.append("video_frame_extraction_skipped:no_events")
                return
            raise FileNotFoundError(f"events.jsonl not found in {session_dir}")

        from conxa_compile.recorder.frame_extractor import extract_frames_for_session
        # Raises on missing ffmpeg, missing video, missing events, or per-frame failure.
        extract_frames_for_session(session_dir)

    def _compute_event_timestamp_ms(self, action: dict[str, Any]) -> int | None:
        """Convert ISO 8601 action.timestamp to ms offset from video start (None on parse error)."""
        ts_iso = str((action or {}).get("timestamp") or "")
        if not ts_iso:
            return None
        try:
            from datetime import datetime, timezone
            # Bridge.js produces e.g. "2025-02-15T14:32:10.123Z" — replace Z with +00:00 for fromisoformat
            iso_clean = ts_iso.replace("Z", "+00:00")
            dt = datetime.fromisoformat(iso_clean)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            wall_ms = int(dt.timestamp() * 1000)
            offset = wall_ms - self._video_session_start_wall_ms
            return max(0, offset)
        except (ValueError, TypeError):
            return None

    def _autosave_storage_state_sync(self, *, force: bool = False) -> None:
        if not self.storage_state_autosave_path or self._context is None:
            return
        # context.storage_state() is a live CDP round-trip. If the browser has already
        # disconnected (e.g. the user just closed the only window and the process is
        # mid-teardown), this call can block indefinitely waiting for a response that
        # will never arrive — freezing this thread forever and leaving browser_open
        # stuck True, since the finally block that clears it never gets reached.
        # Skip rather than risk that hang; the last successful periodic save (or lack
        # of one) is the best we can do once the connection is already gone.
        if self._browser is None or not self._browser.is_connected():
            return
        now = time.monotonic()
        if not force and now - self._last_storage_state_save_at < 6.0:
            return
        try:
            path = Path(self.storage_state_autosave_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            self._context.storage_state(path=str(path))
            self._last_storage_state_save_at = now
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"storage_state_autosave_error: {exc!s}")

    def _open_pages_sync(self) -> list[Any]:
        if self._context is None:
            return []
        try:
            return [page for page in self._context.pages if not page.is_closed()]
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"page_list_error: {exc!s}")
            return []

    def _active_page_sync(self) -> Any | None:
        if self._page is not None:
            try:
                if not self._page.is_closed():
                    self._remember_page_url_sync(self._page)
                    return self._page
            except Exception:  # noqa: BLE001
                pass
        pages = self._open_pages_sync()
        if pages:
            self._page = pages[-1]
            self._remember_page_url_sync(self._page)
            return self._page
        return None

    def _remember_bridge_install_error(self, message: str) -> None:
        key = str(message or "").strip()[:240]
        if not key or key in self._bridge_install_error_keys:
            return
        self._bridge_install_error_keys.add(key)
        self.binding_errors.append(f"bridge_frame_install_error: {key}")

    def _ensure_bridge_installed_sync(self, page: Any) -> None:
        if self.auth_mode or not self._bridge_script or page is None:
            return
        try:
            if page.is_closed():
                return
        except Exception:  # noqa: BLE001
            return
        frames = []
        try:
            frames = list(getattr(page, "frames", []) or [])
        except Exception as exc:  # noqa: BLE001
            self._remember_bridge_install_error(str(exc))
            return
        for frame in frames:
            self._ensure_bridge_installed_in_frame_sync(frame)

    def _log_bridge_attempt(self, url: str, outcome: str) -> None:
        # Deliberately NOT deduplicated (unlike _remember_bridge_install_error) — only logged for
        # frames that need install/reinstall or fail, so it stays small for well-behaved frames
        # while capturing the full timing/repeat-count pattern for a frame that keeps failing.
        if len(self._frame_lifecycle) >= 2000:
            return
        self._frame_lifecycle.append({
            "kind": "bridge_attempt",
            "url": url,
            "parent_url": None,
            "ts": int(time.time() * 1000),
            "outcome": outcome,
        })

    # HubSpot-style embedded panels (e.g. the "Create Contact" object-builder-ui iframe) can
    # churn through several attach/navigate/detach cycles before settling — confirmed via
    # recorder_diag.json's bridge_attempt log across several real recordings: the same frame
    # fails every single check ("Frame was detached"/"Execution context was destroyed") for its
    # entire practical interactive lifetime, only happening to stabilize right as the session
    # ends, too late for anything typed earlier to have been captured. A single check racing
    # that churn has no better than a coin-flip's chance of landing inside a stable window; a
    # short in-place retry loop does, since the churn cycle itself is typically tens of
    # milliseconds — much shorter than the ~200ms gap between external pump ticks/frame events.
    _BRIDGE_INSTALL_MAX_ATTEMPTS = 5
    _BRIDGE_INSTALL_RETRY_DELAY_S = 0.05
    # How long to stay away from a frame after it attaches/navigates before calling
    # frame.evaluate() into it at all. Playwright's sync-API evaluate() has no timeout and is
    # thread-affine (no safe cross-thread watchdog is possible), so a call that lands on a frame
    # mid-churn can hang the recorder's single pump thread forever with no exception raised —
    # confirmed across multiple real HubSpot recordings where the whole recorder went silent the
    # instant a check landed right on/near an attach event for a heavy, rapidly re-parenting
    # iframe. bridge.js's own add_init_script + in-page Document.prototype reinstall patch already
    # handle injection with zero Python round-trip, so this polling check is only a backstop —
    # there's no real cost to letting a freshly-transitioned frame settle first.
    #
    # 0.3s was tried first and wasn't enough — real recordings show HubSpot's object-builder-ui
    # panel can keep re-navigating/re-parenting for several seconds before settling (one session's
    # bridge_attempt log showed ~38 failed attempts before it ever stabilized), and even a
    # deliberately slow, ~52s-paced recording attempt never recovered on its own afterward. Widened
    # to 2.5s to clear that window; _on_frame_navigated refreshes the timestamp on every further
    # navigation, so a frame still actively churning keeps deferring rather than getting checked
    # exactly once at a fixed offset from its first attach.
    _BRIDGE_INSTALL_SETTLE_S = 2.5

    def _ensure_bridge_installed_in_frame_sync(self, frame: Any) -> None:
        if self.auth_mode or not self._bridge_script or frame is None:
            return
        last_transition = self._frame_last_transition_ts.get(id(frame))
        if last_transition is not None and (time.monotonic() - last_transition) < self._BRIDGE_INSTALL_SETTLE_S:
            return
        try:
            frame_url_for_log = _frame_url(frame)
        except Exception:  # noqa: BLE001
            frame_url_for_log = ""
        last_exc: Exception | None = None
        for attempt in range(self._BRIDGE_INSTALL_MAX_ATTEMPTS):
            try:
                # Check both window flag AND document flag. The window flag persists across
                # document.open() (HubSpot micro-frontend pattern) but the document flag does
                # not always — bridge.js's own Document.prototype.open/write/writeln patch is
                # the primary defense against that swap (re-attaches listeners synchronously,
                # in-page, the moment it happens), so this check is now just a backstop for the
                # rare frame where that patch didn't take.
                state = frame.evaluate("""
                    () => ({
                        hasWin: !!window.__SKILL_BRIDGE_V1__,
                        hasDoc: !!(document && document.__SKILL_BRIDGE_DOC_V1__),
                    })
                """)
                bridge_action_taken = False
                if not state.get("hasWin"):
                    frame.evaluate(self._bridge_script)
                    self._log_bridge_attempt(frame_url_for_log, "installed_fresh")
                    bridge_action_taken = True
                elif not state.get("hasDoc"):
                    # Bridge already installed once in this realm — reinstall via the exposed
                    # hook (reuses the persisted closures from the original install) rather than
                    # re-running the whole script, which would recreate fresh closures and
                    # duplicate listeners instead of replacing the stale ones. The hook's return
                    # value (listener count) confirms real listeners were actually attached, not
                    # just that the call didn't throw.
                    listener_count = frame.evaluate(
                        "() => (typeof window.__SKILL_REINSTALL_DOC__ === 'function')"
                        " ? window.__SKILL_REINSTALL_DOC__() : -1"
                    )
                    self._log_bridge_attempt(
                        frame_url_for_log, f"reinstalled_doc (listener_count={listener_count})"
                    )
                    bridge_action_taken = True
                # Emit one diagnostic per unique frame URL so failures are visible. Deferred to a
                # tick where the frame is already stable (no install/reinstall just happened this
                # call) — two more evaluate() calls immediately after reinstalling into a frame
                # that's still mid-churn (e.g. HubSpot's object-builder-ui) is exactly the
                # highest-risk moment for a call that never returns rather than raising.
                if not bridge_action_taken:
                    frame_url = _frame_url(frame)
                    if frame_url and frame_url not in self._frame_diag_seen:
                        self._frame_diag_seen.add(frame_url)
                        try:
                            bridge_ok = frame.evaluate("() => !!window.__SKILL_BRIDGE_V1__")
                            binding_ok = frame.evaluate("() => typeof window.__skillReport === 'function'")
                            if not bridge_ok:
                                self.binding_errors.append(f"frame_bridge_missing:{frame_url}")
                            if not binding_ok:
                                self.binding_errors.append(f"frame_binding_missing:{frame_url}")
                        except Exception:  # noqa: BLE001
                            self.binding_errors.append(f"frame_diag_error:{frame_url}")
                return
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                self._log_bridge_attempt(
                    frame_url_for_log,
                    f"attempt {attempt + 1}/{self._BRIDGE_INSTALL_MAX_ATTEMPTS} failed: {exc!s}"[:200],
                )
                msg = str(exc).lower()
                transient = "detached" in msg or "destroyed" in msg or "navigation" in msg
                if not transient or attempt == self._BRIDGE_INSTALL_MAX_ATTEMPTS - 1:
                    break
                time.sleep(self._BRIDGE_INSTALL_RETRY_DELAY_S)
        if last_exc is not None:
            self._remember_bridge_install_error(str(last_exc))

    def _log_frame_lifecycle(self, kind: str, frame: Any) -> None:
        # A frame mid-detach can raise on nearly any access (this is the exact "Frame was
        # detached"/"Execution context was destroyed" failure mode this log exists to catch) —
        # guard each lookup individually so the event itself is still recorded even when its
        # url/parent can't be resolved, rather than dropping the whole entry.
        if len(self._frame_lifecycle) >= 2000:
            return
        try:
            url = _frame_url(frame)
        except Exception:  # noqa: BLE001
            url = ""
        try:
            parent = _frame_parent(frame)
            parent_url = _frame_url(parent) if parent else None
        except Exception:  # noqa: BLE001
            parent_url = None
        self._frame_lifecycle.append({
            "kind": kind,
            "url": url,
            "parent_url": parent_url,
            "ts": int(time.time() * 1000),
        })

    def _on_frame_ready(self, frame: Any) -> None:
        self._ensure_bridge_installed_in_frame_sync(frame)

    def _on_frame_attached(self, frame: Any) -> None:
        self._frame_last_transition_ts[id(frame)] = time.monotonic()
        self._log_frame_lifecycle("attached", frame)
        self._on_frame_ready(frame)

    def _on_frame_navigated(self, frame: Any) -> None:
        self._frame_last_transition_ts[id(frame)] = time.monotonic()
        self._log_frame_lifecycle("navigated", frame)
        self._on_frame_ready(frame)

    def _on_frame_detached(self, frame: Any) -> None:
        self._log_frame_lifecycle("detached", frame)

    def _consume_payload_safe_sync(
        self, payload: dict[str, Any], src_page: Any | None = None, src_frame: Any | None = None
    ) -> None:
        try:
            self._consume_payload_sync(payload, src_page, src_frame)
        except Exception as exc:  # noqa: BLE001
            raw_action = payload.get("action") if isinstance(payload, dict) else {}
            action = str((raw_action or {}).get("action") or "")
            suffix = f":{action}" if action else ""
            self.binding_errors.append(f"event_capture_error{suffix}: {exc!s}")

    async def start(self) -> None:
        self._stop_requested.clear()
        self._startup_done.clear()
        self._startup_error = ""
        self.browser_open = False
        self.ended_by_user = False
        self._thread = threading.Thread(target=self._run_sync_recorder, daemon=True)
        self._thread.start()

        while not self._startup_done.is_set():
            await asyncio.sleep(0.05)

        if self._startup_error:
            raise RuntimeError(self._startup_error)

    def _on_browser_disconnected(self) -> None:
        self.browser_open = False
        self.ended_by_user = True
        self._stop_requested.set()

    def _binding_sink_sync(self, source: Any, payload: dict[str, Any]) -> None:
        try:
            payload_copy = copy.deepcopy(payload)
            # Trace payloads go to the diagnostics list, not the event queue.
            if payload_copy.get("_trace"):
                if len(self._traces) < 5000:
                    self._traces.append(payload_copy)
                return
            src_page = source.get("page") if isinstance(source, dict) else None
            src_frame = source.get("frame") if isinstance(source, dict) else None
            # Do NOT call _frame_context_and_offset_sync (or any other Playwright sync-API
            # call) here — this callback is invoked by Playwright's dispatcher while
            # delivering an expose_binding call, and a nested blocking call to the same
            # dispatcher from inside that delivery is a reentrancy hazard that can deadlock
            # forever with no exception raised (confirmed: every captured iframe-sourced
            # event across many real HubSpot recordings silently vanished right here, since
            # this was the only extra Playwright call in the path from browser to
            # events.jsonl for any event with a non-top-level source frame — top-level
            # clicks, which skip this call entirely, always worked fine). Deferred to
            # _consume_payload_sync, which runs from the plain pump-loop drain, not from
            # inside a callback the dispatcher is still in the middle of delivering.
            self._pending_payloads.put((payload_copy, src_page, src_frame))
            self._last_enqueue_at = time.monotonic()
        except Exception as exc:  # noqa: BLE001 — recorder must never crash from page callback
            self.binding_errors.append(f"binding_error: {exc!s}")

    def _delete_visual_assets(self, session_dir: Path, event: RecordedEvent) -> None:
        visual = event.visual
        for rel in (visual.full_screenshot, visual.element_snapshot):
            if not rel:
                continue
            try:
                p = (session_dir / rel).resolve()
                p.unlink(missing_ok=True)
            except Exception:
                # Best effort cleanup; recorder should never fail due to file deletion.
                continue

    def _write_diagnostics_sync(self, session_dir: Path) -> None:
        """Write binding_errors, traces, a frame tree snapshot, and the event-driven frame
        lifecycle log to recorder_diag.json."""
        frame_tree: list[dict] = []
        try:
            page = self._active_page_sync()
            if page is not None and not page.is_closed():
                for fr in list(getattr(page, "frames", []) or []):
                    entry: dict = {"url": _frame_url(fr)}
                    parent = _frame_parent(fr)
                    entry["parent_url"] = _frame_url(parent) if parent else None
                    try:
                        info = fr.evaluate(
                            "() => ({ bridge: !!window.__SKILL_BRIDGE_V1__, binding: typeof window.__skillReport === 'function', isTop: window === window.top })"
                        )
                        entry.update(info if isinstance(info, dict) else {})
                    except Exception:
                        entry["eval_error"] = True
                    if parent is not None:
                        try:
                            attrs, rect = _frame_element_attrs_and_rect(fr)
                            entry["iframe_attrs"] = {
                                k: attrs.get(k) for k in ("id", "data-test-id", "data-selenium-test", "name", "sandbox", "src")
                            }
                            entry["iframe_rect"] = rect
                        except Exception:
                            pass
                    frame_tree.append(entry)
        except Exception:  # noqa: BLE001
            pass
        out = session_dir / "recorder_diag.json"
        diag = {
            "binding_errors": self.binding_errors,
            "traces": self._traces,
            "frame_tree": frame_tree,
            "frame_snapshots": self._frame_snapshots,
            "frame_lifecycle": self._frame_lifecycle,
        }
        try:
            out.write_text(json.dumps(diag, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

    def _rewrite_events_jsonl(self, session_dir: Path) -> None:
        out = session_dir / "events.jsonl"
        with out.open("w", encoding="utf-8") as f:
            for ev in self._materialized:
                f.write(json.dumps(ev.model_dump(mode="json"), ensure_ascii=False) + "\n")
        self._write_diagnostics_sync(session_dir)

    def _should_merge_typing(self, prev: RecordedEvent, curr: RecordedEvent) -> bool:
        if prev.action.action != "type" or curr.action.action != "type":
            return False
        return _typing_target_key(prev) == _typing_target_key(curr)

    def _consume_payload_sync(
        self, payload: dict[str, Any], src_page: Any | None = None, src_frame: Any | None = None
    ) -> None:
        # Frame-chain/geometry extraction needs Playwright sync-API calls (walking the
        # ancestor chain via frame.evaluate()); safe here since this runs from the plain
        # pump-loop drain, never from inside the expose_binding callback that first received
        # this payload (see _binding_sink_sync for why it can't be done there).
        if src_frame is not None:
            frame_context, frame_offset = _frame_context_and_offset_sync(src_frame)
            if frame_context:
                payload["frame"] = frame_context
                payload["_frame_offset"] = frame_offset
        session_dir = self.data_root / "sessions" / self.session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        page_for_visuals = src_page or self._active_page_sync()
        event = self._finalize_payload_sync(page_for_visuals, session_dir, payload)
        with self._lock:
            if self._materialized and self._should_merge_typing(self._materialized[-1], event):
                prev = self._materialized[-1]
                self._delete_visual_assets(session_dir, prev)
                self._materialized[-1] = event
            else:
                self._materialized.append(event)
        self._rewrite_events_jsonl(session_dir)
        metrics.inc("events_captured")

    def _capture_a11y_async(self, page: Any) -> dict[str, Any] | None:
        """Capture a11y tree in a thread with 2s timeout. Returns tree dict or None on failure/timeout."""
        if not settings.snapshot_capture_a11y:
            return None
        result = {"tree": None, "elapsed": 0.0}
        def _capture():
            start = time.time()
            try:
                result["tree"] = page.accessibility.snapshot()
                result["elapsed"] = time.time() - start
            except Exception:
                result["elapsed"] = time.time() - start
        thread = threading.Thread(target=_capture, daemon=True)
        thread.start()
        thread.join(timeout=2.0)
        if thread.is_alive():
            return None
        tree = result.get("tree")
        elapsed = result.get("elapsed", 0.0)
        self._last_a11y_capture_time = elapsed
        if elapsed > 0.5:
            self._a11y_skip_count = 3
        return tree if isinstance(tree, dict) else None

    def _capture_dom_snapshot_sync(self, page: Any, dom_sig_short: str) -> dict[str, Any]:
        """Capture (and dedupe) the full DOM + a11y tree for the current page.

        Returns dict with keys: ref, dom_hash, dom_path, a11y_path. Empty on failure.
        Skips capture if the short bridge signature matches the previous one (dedup).
        """
        if not settings.snapshot_dedup_enabled:
            return {}
        if page is None:
            return {}
        try:
            if page.is_closed():
                return {}
        except Exception:  # noqa: BLE001
            return {}

        # Dedup fast path: same short signature as last action → reuse ref.
        if dom_sig_short and dom_sig_short == getattr(self, "_last_dom_sig_short", ""):
            return {
                "ref": self._last_snapshot_ref,
                "dom_hash": self._last_snapshot_hash,
                "dom_path": snapshot_store.relative_blob_path(self.session_id, self._last_snapshot_hash, "html.gz") if self._last_snapshot_hash else None,
                "a11y_path": snapshot_store.relative_blob_path(self.session_id, self._last_snapshot_hash, "a11y.json") if self._last_snapshot_hash else None,
            }

        # Capture full HTML.
        try:
            html = page.content()
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"dom_snapshot_error: {exc!s}")
            return {}

        h, _ = snapshot_store.save_dom_snapshot(self.session_id, html or "")

        # Capture a11y tree (best-effort, may be unavailable on some pages).
        a11y_path_str: str | None = None
        if settings.snapshot_capture_a11y and self._a11y_skip_count == 0:
            tree = self._capture_a11y_async(page)
            if tree is not None:
                try:
                    if snapshot_store.save_a11y_snapshot(self.session_id, tree, h):
                        a11y_path_str = snapshot_store.relative_blob_path(self.session_id, h, "a11y.json")
                except Exception as exc:  # noqa: BLE001
                    self.binding_errors.append(f"a11y_snapshot_error: {exc!s}")
        if self._a11y_skip_count > 0:
            self._a11y_skip_count -= 1

        # Assign ref (UUID) per unique hash so events can join back to a snapshot.
        if h == self._last_snapshot_hash and self._last_snapshot_ref:
            ref = self._last_snapshot_ref
        else:
            ref = snapshot_store.new_snapshot_ref()
        self._last_snapshot_hash = h
        self._last_snapshot_ref = ref
        if dom_sig_short:
            self._last_dom_sig_short = dom_sig_short  # type: ignore[attr-defined]

        return {
            "ref": ref,
            "dom_hash": h,
            "dom_path": snapshot_store.relative_blob_path(self.session_id, h, "html.gz"),
            "a11y_path": a11y_path_str,
        }

    def _finalize_payload_sync(self, page, session_dir: Path, payload: dict[str, Any]) -> RecordedEvent:
        payload = _sanitize_surrogates(payload)
        self._seq += 1
        seq = self._seq
        vph = dict(payload.get("visual_placeholder") or {})
        bbox = dict(vph.get("bbox") or {"x": 0, "y": 0, "w": 0, "h": 0})
        frame_offset = payload.get("_frame_offset") if isinstance(payload.get("_frame_offset"), dict) else {}
        if frame_offset:
            try:
                bbox["x"] = int(round(float(bbox.get("x") or 0) + float(frame_offset.get("x") or 0)))
                bbox["y"] = int(round(float(bbox.get("y") or 0) + float(frame_offset.get("y") or 0)))
                if page is not None and not page.is_closed():
                    viewport = _viewport_string_from_page(page)
                    if viewport:
                        vph["viewport"] = viewport
            except (TypeError, ValueError):
                pass
        action = payload["action"]
        action_name = str((action or {}).get("action") or "")
        # Screenshots are no longer captured synchronously during recording.
        # full_screenshot and element_snapshot are set at session shutdown by
        # frame_extractor.py after extracting 5 frames per action from recording.webm.
        full_rel: str | None = None
        el_rel: str | None = None
        pol = get_policy_bundle().data
        timing = resolve_event_timing(action_name, pol)

        # Phase 2: capture full DOM + a11y snapshot (deduped by hash).
        dom_sig_short = str(payload.get("dom_signature_short") or "")
        snapshot_info: dict[str, Any] = {}
        try:
            snapshot_info = self._capture_dom_snapshot_sync(page, dom_sig_short)
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"snapshot_capture_error:{action_name}: {exc!s}")

        timestamp_ms: int | None = None
        if not self.auth_mode:
            if not self._video_session_start_wall_ms:
                raise RuntimeError(
                    "video session start time not initialized; non-auth sessions must record video"
                )
            timestamp_ms = self._compute_event_timestamp_ms(action)
        body = {
            "action": action,
            "target": payload["target"],
            "selectors": payload["selectors"],
            "context": payload["context"],
            "semantic": payload["semantic"],
            "anchors": payload.get("anchors") or [],
            "visual": {
                "full_screenshot": full_rel,
                "element_snapshot": el_rel,
                "bbox": bbox,
                "viewport": vph.get("viewport") or "",
                "scroll_position": vph.get("scroll_position") or "0,0",
                "timestamp_ms": timestamp_ms,
                "frames": {},
            },
            "page": payload["page"],
            "state_change": payload.get("state_change") or {"before": "", "after": ""},
            "timing": timing,
            "extras": {"sequence": seq, "session_id": self.session_id},
            "frame": payload.get("frame") if isinstance(payload.get("frame"), dict) else {},
            # Phase 2 signals.
            "ancestors": payload.get("ancestors") or [],
            "surrounding_text": str(payload.get("surrounding_text") or ""),
            "snapshot": {
                "ref": str(snapshot_info.get("ref") or ""),
                "dom_hash": str(snapshot_info.get("dom_hash") or ""),
                "dom_path": snapshot_info.get("dom_path"),
                "a11y_path": snapshot_info.get("a11y_path"),
            },
        }
        return RecordedEvent.model_validate(body)

    def _make_synthetic_payload(self, kind: str, value_str: str) -> dict[str, Any]:
        """Build a minimal bridge-compatible payload dict for Playwright-side events."""
        page_url = ""
        try:
            page = self._active_page_sync()
            if page is not None and not page.is_closed():
                page_url = page.url
        except Exception:  # noqa: BLE001
            pass
        return {
            "action": {
                "action": kind,
                "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                "value": value_str,
            },
            "target": {"tag": "", "id": None, "classes": [], "inner_text": "", "role": None, "aria_label": None, "name": None},
            "selectors": {"css": "", "xpath": "", "text_based": "", "aria": ""},
            "context": {"parent": "", "siblings": [], "index_in_parent": 0, "form_context": None},
            "semantic": {"normalized_text": "", "role": "", "input_type": None, "intent_hint": ""},
            "anchors": [],
            "visual_placeholder": {"bbox": {"x": 0, "y": 0, "w": 0, "h": 0}, "viewport": "", "scroll_position": "0,0"},
            "page": {"url": page_url, "title": ""},
            "state_change": {"before": "", "after": ""},
            # Phase 2 defaults (synthetic events have no bridge signals).
            "ancestors": [],
            "surrounding_text": "",
            "dom_signature_short": "",
        }

    def _enqueue_synthetic(self, kind: str, value_str: str) -> None:
        try:
            payload = self._make_synthetic_payload(kind, value_str)
            self._pending_payloads.put((payload, None, None))
            self._last_enqueue_at = time.monotonic()
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"synthetic_event_error:{kind}: {exc!s}")

    def _on_download(self, download: Any) -> None:
        try:
            value = json.dumps({"url": download.url, "suggested_filename": download.suggested_filename})
            self._enqueue_synthetic("download_observed", value)
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"download_event_error: {exc!s}")

    def _on_dialog(self, dialog: Any) -> None:
        try:
            value = json.dumps({"type": dialog.type, "message": dialog.message})
            try:
                dialog.accept()
            except Exception:  # noqa: BLE001
                pass
            self._enqueue_synthetic("dialog_accept", value)
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"dialog_event_error: {exc!s}")

    def _on_popup(self, popup: Any) -> None:
        try:
            url = ""
            try:
                url = popup.url
                self._remember_current_url(url)
            except Exception:  # noqa: BLE001
                pass
            self._enqueue_synthetic("popup", json.dumps({"url": url}))
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"popup_event_error: {exc!s}")

    def _on_file_chooser(self, _fc: Any) -> None:
        try:
            self._enqueue_synthetic("file_chooser_opened", "")
        except Exception as exc:  # noqa: BLE001
            self.binding_errors.append(f"file_chooser_event_error: {exc!s}")

    def _on_page_navigated(self, page: Any, frame: Any) -> None:
        try:
            parent = getattr(frame, "parent_frame", None)
            parent = parent() if callable(parent) else parent
            if parent is not None:
                return
        except Exception:  # noqa: BLE001
            return
        self._page = page
        self._remember_page_url_sync(page)

    def _attach_page_listeners(self, page: Any) -> None:
        page.on("download", self._on_download)
        page.on("dialog", self._on_dialog)
        page.on("popup", self._on_popup)
        page.on("filechooser", self._on_file_chooser)
        page.on("framenavigated", lambda frame: self._on_page_navigated(page, frame))
        if not self.auth_mode:
            page.on("frameattached", self._on_frame_attached)
            page.on("framenavigated", self._on_frame_navigated)
            page.on("framedetached", self._on_frame_detached)

    def _on_context_page(self, page: Any) -> None:
        self._page = page
        self._attach_page_listeners(page)

    def _run_sync_recorder(self) -> None:
        try:
            import sys as _sys
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--disable-session-crashed-bubble",
                    "--disable-infobars",
                    "--no-first-run",
                ]
            )
            self.browser_open = True
            # Allow Chromium to steal the foreground on Windows despite focus-lock
            if _sys.platform == "win32":
                try:
                    import ctypes
                    ctypes.windll.user32.AllowSetForegroundWindow(-1)
                except Exception:
                    pass
            self._browser.on("disconnected", lambda _: self._on_browser_disconnected())
            ctx_kwargs: dict[str, Any] = {}
            if self.storage_state_path and Path(self.storage_state_path).is_file():
                ctx_kwargs["storage_state"] = self.storage_state_path
            if not self.auth_mode:
                # Video recording is mandatory for non-auth sessions.
                session_dir = self.data_root / "sessions" / self.session_id
                session_dir.mkdir(parents=True, exist_ok=True)
                ctx_kwargs["record_video_dir"] = str(session_dir)
                ctx_kwargs["record_video_size"] = {"width": 1280, "height": 720}
            self._context = self._browser.new_context(**ctx_kwargs)
            if not self.auth_mode:
                import time as _time
                self._video_session_start = _time.monotonic()
                self._video_session_start_wall_ms = int(_time.time() * 1000)
            if not self.auth_mode:
                self._bridge_script = _load_bridge_script(capture_hover=self.capture_hover)
                self._context.expose_binding("__skillReport", self._binding_sink_sync)
                self._context.add_init_script(self._bridge_script)
                self._context.on("page", self._on_context_page)
            self._page = self._context.new_page()
            try:
                self._page.goto(self.start_url, wait_until="load", timeout=30000)
                self._remember_page_url_sync(self._page)
            except Exception as goto_err:
                self.binding_errors.append(f"navigation_error: {goto_err!s}")
            try:
                self._page.bring_to_front()
            except Exception:
                pass
            if not self.auth_mode:
                page = self._active_page_sync()
                if page is not None:
                    self._ensure_bridge_installed_sync(page)
                    bridge_ok = page.evaluate("() => !!window.__SKILL_BRIDGE_V1__")
                    binding_ok = page.evaluate("() => typeof window.__skillReport === 'function'")
                    if not bridge_ok:
                        self.binding_errors.append("bridge_not_loaded_on_start_page")
                    if not binding_ok:
                        self.binding_errors.append("binding_not_available_on_start_page")
                else:
                    self.binding_errors.append("start_page_closed")
            self._startup_done.set()

            while not self._stop_requested.is_set():
                # Pump the Playwright sync driver so binding callbacks are delivered
                # continuously while recording (not only around teardown calls).
                # Skip in auth_mode — no bridge callbacks to pump.
                if not self.auth_mode:
                    for page in self._open_pages_sync():
                        try:
                            self._log_bridge_attempt("<pump>", "tick_frame_check_begin")
                            self._ensure_bridge_installed_sync(page)
                            self._log_bridge_attempt("<pump>", "tick_page_eval_begin")
                            page.evaluate("() => 0")
                            self._log_bridge_attempt("<pump>", "tick_page_eval_done")
                        except Exception as exc:  # noqa: BLE001
                            self.binding_errors.append(f"pump_error: {exc!s}")
                    # Take a lightweight frame topology snapshot every 5th tick (~1 s)
                    # so recorder_diag.json captures which iframes exist during recording,
                    # not just at session end when transient iframes may be gone.
                    self._pump_tick += 1
                    if self._pump_tick % 5 == 0 and len(self._frame_snapshots) < 300:
                        try:
                            page = self._active_page_sync()
                            if page is not None and not page.is_closed():
                                self._frame_snapshots.append({
                                    "ts": int(time.time() * 1000),
                                    "frames": [
                                        {
                                            "url": _frame_url(fr),
                                            "parent_url": _frame_url(_frame_parent(fr)) if _frame_parent(fr) else None,
                                        }
                                        for fr in list(getattr(page, "frames", []) or [])
                                    ],
                                })
                        except Exception:  # noqa: BLE001
                            pass
                # Throttled to every 6s (see _autosave_storage_state_sync) instead of
                # every loop tick — frequent saves while auth_mode is what caused visible
                # window flicker during active login. This periodic call is also the
                # safety net that keeps a recent save on disk before the risky moment of
                # the browser actually closing (see the connection guard in that method).
                self._log_bridge_attempt("<pump>", "tick_autosave_begin")
                self._autosave_storage_state_sync()
                self._log_bridge_attempt("<pump>", "tick_autosave_done")
                self._log_bridge_attempt("<pump>", "tick_page_url_sweep_begin")
                for page in self._open_pages_sync():
                    self._remember_page_url_sync(page)
                self._log_bridge_attempt("<pump>", "tick_page_url_sweep_done")
                if self.wait_for_url and not self.reached_wait_url:
                    try:
                        for page in self._open_pages_sync():
                            current_url = page.url
                            self._remember_current_url(current_url)
                            if self._url_matches_wait_target(current_url):
                                self._autosave_storage_state_sync(force=True)
                                self.reached_wait_url = True
                                self._stop_requested.set()
                                break
                    except Exception:  # noqa: BLE001
                        pass
                if not self.auth_mode:
                    try:
                        payload, src_page, src_frame = self._pending_payloads.get_nowait()
                        self._consume_payload_safe_sync(payload, src_page, src_frame)
                    except Empty:
                        pass
                if not self._browser.is_connected() or not self._open_pages_sync():
                    # A heavy same-page iframe load (e.g. HubSpot's "Create new" object
                    # panel) can make both of these read "gone" for several real seconds
                    # while the browser is still open and busy — is_connected() has been
                    # observed to flicker under CDP/network pressure just like the page
                    # list does. Debounce both under one streak so neither ends the
                    # recording on a single bad tick; a real close/crash still confirms
                    # well within the grace window.
                    self._no_pages_streak += 1
                    # Log the streak's shape (not just its eventual give-up) — on the first tick
                    # and then every ~10th tick while it continues — so recorder_diag.json shows
                    # how long a "pages look gone" stretch actually lasted even when it resolves
                    # on its own well under the give-up threshold, instead of being invisible.
                    if self._no_pages_streak == 1 or self._no_pages_streak % 10 == 0:
                        try:
                            connected = self._browser.is_connected()
                        except Exception as exc:  # noqa: BLE001
                            connected = f"raised: {exc!s}"
                        if len(self._frame_lifecycle) < 2000:
                            self._frame_lifecycle.append({
                                "kind": "no_pages_tick",
                                "url": self.current_url,
                                "parent_url": None,
                                "ts": int(time.time() * 1000),
                                "streak": self._no_pages_streak,
                                "browser_connected": connected,
                            })
                    if self._no_pages_streak >= _NO_PAGES_GRACE_TICKS:
                        try:
                            still_connected = self._browser.is_connected()
                        except Exception as exc:  # noqa: BLE001
                            still_connected = f"is_connected() raised: {exc!s}"
                        self.binding_errors.append(
                            f"recorder_gave_up: streak={self._no_pages_streak} "
                            f"browser_connected={still_connected} current_url={self.current_url!r}"
                        )
                        self.ended_by_user = True
                        break
                else:
                    if self._no_pages_streak > 0 and len(self._frame_lifecycle) < 2000:
                        self._frame_lifecycle.append({
                            "kind": "no_pages_resolved",
                            "url": self.current_url,
                            "parent_url": None,
                            "ts": int(time.time() * 1000),
                            "streak": self._no_pages_streak,
                        })
                    self._no_pages_streak = 0
                time.sleep(0.2)

            if not self.auth_mode:
                # Stop waits for a short "idle queue" condition so delayed
                # Playwright binding callbacks can still be consumed.
                shutdown_start = time.monotonic()
                while True:
                    for page in self._open_pages_sync():
                        try:
                            self._ensure_bridge_installed_sync(page)
                            page.evaluate("() => 0")
                        except Exception:
                            pass
                    drained = 0
                    try:
                        while True:
                            payload, src_page, src_frame = self._pending_payloads.get_nowait()
                            drained += 1
                            self._consume_payload_safe_sync(payload, src_page, src_frame)
                    except Empty:
                        pass
                    elapsed = time.monotonic() - shutdown_start
                    idle_for = time.monotonic() - self._last_enqueue_at if self._last_enqueue_at else elapsed
                    if elapsed >= 5.0 and idle_for >= 1.0 and drained == 0:
                        break
                    time.sleep(0.05)
                # Final diagnostics snapshot after all events are drained.
                session_dir = self.data_root / "sessions" / self.session_id
                session_dir.mkdir(parents=True, exist_ok=True)
                self._write_diagnostics_sync(session_dir)
            self._autosave_storage_state_sync(force=True)
        except Exception as exc:  # noqa: BLE001
            self._startup_error = format_startup_error(exc)
            self.binding_errors.append(f"start_error: {exc!s}")
            self._startup_done.set()
        finally:
            self.browser_open = False
            self._shutdown_playwright_sync()

    async def stop(self) -> None:
        self._stop_requested.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._thread = None
        self.browser_open = False

    def status(self) -> dict[str, Any]:
        with self._lock:
            event_count = len(self._materialized)
        return {
            "session_id": self.session_id,
            "browser_open": self.browser_open,
            "event_count": event_count,
            "ended_by_user": self.ended_by_user,
            "binding_errors": self.binding_errors,
            "reached_wait_url": self.reached_wait_url,
            "capture_hover": self.capture_hover,
            "current_url": self.current_url,
        }

    def snapshot_events(self) -> list[dict[str, Any]]:
        with self._lock:
            return [e.model_dump(mode="json") for e in self._materialized]


class SessionRegistry:
    """In-memory MVP registry (swap for Redis/DB in production)."""

    def __init__(self) -> None:
        self._sessions: dict[str, RecordingSession] = {}

    def create(
        self,
        start_url: str = "about:blank",
        storage_state_path: str = "",
        storage_state_autosave_path: str = "",
        wait_for_url: str = "",
        auth_mode: bool = False,
        capture_hover: bool = False,
    ) -> RecordingSession:
        sid = str(uuid.uuid4())
        sess = RecordingSession(
            session_id=sid,
            start_url=start_url,
            storage_state_path=storage_state_path,
            storage_state_autosave_path=storage_state_autosave_path,
            wait_for_url=wait_for_url,
            auth_mode=auth_mode,
            capture_hover=capture_hover,
        )
        self._sessions[sid] = sess
        return sess

    def get(self, session_id: str) -> RecordingSession | None:
        return self._sessions.get(session_id)

    def pop(self, session_id: str) -> RecordingSession | None:
        """Remove a session without stopping the browser (used on failed start)."""
        return self._sessions.pop(session_id, None)

    async def remove(self, session_id: str) -> bool:
        sess = self._sessions.get(session_id)
        if not sess:
            return False
        await sess.stop()
        return True


registry = SessionRegistry()
