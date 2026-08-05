from __future__ import annotations

from conxa_compile.recorder import session as recorder_session
from conxa_compile.recorder.session import RecordingSession


def _payload(action: str = "click") -> dict:
    return {
        "action": {"action": action, "timestamp": "2026-01-01T00:00:00Z", "value": None},
        "target": {"tag": "button", "id": None, "classes": [], "inner_text": "Save", "role": "button", "aria_label": None, "name": None},
        "selectors": {"css": "button", "xpath": "/button[1]", "text_based": 'text="Save"', "aria": '[role="button"][name="Save"]'},
        "context": {"parent": "body", "siblings": [], "index_in_parent": 0, "form_context": None},
        "semantic": {"normalized_text": "save", "role": "button", "input_type": None, "intent_hint": "activate_control"},
        "anchors": [],
        "visual_placeholder": {"bbox": {"x": 1, "y": 1, "w": 20, "h": 10}, "viewport": "1280x720", "scroll_position": "0,0"},
        "page": {"url": "https://example.com", "title": "Example"},
        "state_change": {"before": "", "after": ""},
    }


def test_payload_capture_error_is_recorded_without_raising(monkeypatch) -> None:
    sess = RecordingSession(session_id="safe-capture")

    def fail_capture(*_args, **_kwargs):
        raise ValueError("bad event")

    monkeypatch.setattr(sess, "_consume_payload_sync", fail_capture)

    sess._consume_payload_safe_sync({"action": {"action": "hover"}})

    assert sess.binding_errors == ["event_capture_error:hover: bad event"]


def test_bridge_script_injects_hover_capture_option() -> None:
    script = recorder_session._load_bridge_script(capture_hover=True)

    assert 'window.__SKILL_CAPTURE_OPTIONS__ = {"capture_hover": true};' in script


def test_registry_sets_hover_capture_flag() -> None:
    sess = recorder_session.registry.create(capture_hover=True)
    try:
        assert sess.capture_hover is True
    finally:
        recorder_session.registry.pop(sess.session_id)


def test_status_exposes_current_url_and_ignores_blank_urls() -> None:
    sess = RecordingSession(session_id="current-url")

    sess._remember_current_url("about:blank")
    assert sess.status()["current_url"] == ""

    sess._remember_current_url("https://example.com/app?team=abc#leads")

    assert sess.status()["current_url"] == "https://example.com/app?team=abc#leads"


def test_ensure_bridge_installs_missing_child_frame() -> None:
    sess = RecordingSession(session_id="frame-bridge")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class FakeFrame:
        def __init__(self, installed: bool) -> None:
            self.installed = installed
            self.calls: list[str] = []

        def evaluate(self, script: str) -> dict | None:
            self.calls.append(script)
            if "hasWin: !!window.__SKILL_BRIDGE_V1__" in script:
                return {"hasWin": self.installed, "hasDoc": self.installed}
            self.installed = True
            return None

    class FakePage:
        frames: list[FakeFrame]

        def __init__(self) -> None:
            self.frames = [FakeFrame(installed=True), FakeFrame(installed=False)]

        def is_closed(self) -> bool:
            return False

    page = FakePage()

    sess._ensure_bridge_installed_sync(page)

    assert len(page.frames[0].calls) == 1
    assert "hasWin: !!window.__SKILL_BRIDGE_V1__" in page.frames[0].calls[0]
    assert len(page.frames[1].calls) == 2
    assert "hasWin: !!window.__SKILL_BRIDGE_V1__" in page.frames[1].calls[0]
    assert page.frames[1].calls[1] == sess._bridge_script
    assert page.frames[1].installed is True
    assert sess.binding_errors == []


def test_ensure_bridge_reinstalls_doc_listeners_when_only_doc_flag_stale() -> None:
    """Bridge already installed once in this realm (hasWin) but the document-scoped
    listener flag is stale (hasDoc false) — e.g. bridge.js's own Document.prototype
    open/write/writeln patch didn't take for some reason. The pump-loop backstop must
    call the exposed reinstall hook, not re-run (and duplicate listeners from) the
    whole bridge script."""
    sess = RecordingSession(session_id="frame-bridge-reinstall")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class FakeFrame:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def evaluate(self, script: str) -> dict | None:
            self.calls.append(script)
            if "hasWin: !!window.__SKILL_BRIDGE_V1__" in script:
                return {"hasWin": True, "hasDoc": False}
            return None

    frame = FakeFrame()
    sess._ensure_bridge_installed_in_frame_sync(frame)

    assert len(frame.calls) == 2
    assert "hasWin: !!window.__SKILL_BRIDGE_V1__" in frame.calls[0]
    assert "__SKILL_REINSTALL_DOC__" in frame.calls[1]
    assert frame.calls[1] != sess._bridge_script


def test_ensure_bridge_retries_through_transient_detach_then_succeeds() -> None:
    """HubSpot-style embedded panels (e.g. the Create Contact object-builder-ui iframe) churn
    through several attach/navigate/detach cycles before settling — a real recording's diagnostic
    log showed the same frame failing 'Frame was detached'/'Execution context was destroyed' on
    every single check for its entire practical lifetime, only stabilizing once there was no time
    left to matter. A single check has no better than a coin-flip's chance of landing inside the
    stable window between churns; the retry loop must keep trying through transient failures
    within one call instead of waiting for the next external trigger."""
    sess = RecordingSession(session_id="frame-churn-retry")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class ChurningFrame:
        def __init__(self, fail_count: int) -> None:
            self.fail_count = fail_count
            self.calls = 0
            self.installed = False

        def evaluate(self, script: str) -> dict | None:
            self.calls += 1
            if self.calls <= self.fail_count:
                raise Exception("Frame.evaluate: Frame was detached")
            if "hasWin: !!window.__SKILL_BRIDGE_V1__" in script:
                return {"hasWin": self.installed, "hasDoc": self.installed}
            self.installed = True
            return None

    frame = ChurningFrame(fail_count=3)
    sess._ensure_bridge_installed_in_frame_sync(frame)

    assert frame.installed is True
    assert sess.binding_errors == [], "should not report an error once a retry succeeds"


def test_ensure_bridge_gives_up_after_max_attempts_on_persistent_churn() -> None:
    sess = RecordingSession(session_id="frame-churn-exhausted")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class AlwaysDetachedFrame:
        def __init__(self) -> None:
            self.calls = 0

        def evaluate(self, script: str) -> dict | None:
            self.calls += 1
            raise Exception("Frame.evaluate: Frame was detached")

    frame = AlwaysDetachedFrame()
    sess._ensure_bridge_installed_in_frame_sync(frame)

    assert frame.calls == sess._BRIDGE_INSTALL_MAX_ATTEMPTS
    assert len(sess.binding_errors) == 1
    assert "Frame was detached" in sess.binding_errors[0]


def test_ensure_bridge_does_not_retry_non_transient_errors() -> None:
    sess = RecordingSession(session_id="frame-real-error")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class BrokenFrame:
        def __init__(self) -> None:
            self.calls = 0

        def evaluate(self, script: str) -> dict | None:
            self.calls += 1
            raise Exception("SyntaxError: unexpected token")

    frame = BrokenFrame()
    sess._ensure_bridge_installed_in_frame_sync(frame)

    assert frame.calls == 1, "a non-transient error should not trigger the churn retry loop"
    assert len(sess.binding_errors) == 1


def test_frame_ready_installs_bridge_immediately() -> None:
    sess = RecordingSession(session_id="frame-ready")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class FakeFrame:
        def __init__(self) -> None:
            self.installed = False
            self.calls: list[str] = []

        def evaluate(self, script: str) -> dict | None:
            self.calls.append(script)
            if "hasWin: !!window.__SKILL_BRIDGE_V1__" in script:
                return {"hasWin": self.installed, "hasDoc": self.installed}
            self.installed = True
            return None

    frame = FakeFrame()

    sess._on_frame_ready(frame)

    assert len(frame.calls) == 2
    assert "hasWin: !!window.__SKILL_BRIDGE_V1__" in frame.calls[0]
    assert frame.calls[1] == sess._bridge_script
    assert frame.installed is True


def test_frame_lifecycle_logs_attach_navigate_detach_even_when_frame_is_gone() -> None:
    """Diagnostic-only log (recorder_diag.json's frame_lifecycle) — event-driven, not sampled
    like frame_snapshots, so it catches a frame that attaches and detaches faster than any
    polling interval could observe. Must not blow up once the frame is actually gone."""
    sess = RecordingSession(session_id="frame-lifecycle")
    sess._bridge_script = "window.__SKILL_BRIDGE_V1__ = true;"

    class FakeFrame:
        def __init__(self, url: str, parent: "FakeFrame | None" = None) -> None:
            self.url = url
            self.parent_frame = parent

        def evaluate(self, script: str) -> dict | None:
            if "hasWin: !!window.__SKILL_BRIDGE_V1__" in script:
                return {"hasWin": True, "hasDoc": True}
            return None

    top = FakeFrame("https://app-na2.hubspot.com/contacts/1")
    child = FakeFrame("https://app-na2.hubspot.com/object-builder/1/embed", parent=top)

    sess._on_frame_attached(child)
    sess._on_frame_navigated(child)
    sess._on_frame_detached(child)

    kinds = [(e["kind"], e["url"], e["parent_url"]) for e in sess._frame_lifecycle]
    assert kinds == [
        ("attached", child.url, top.url),
        ("navigated", child.url, top.url),
        ("detached", child.url, top.url),
    ]
    assert all(isinstance(e["ts"], int) for e in sess._frame_lifecycle)

    # A frame that's already gone (evaluate/parent_frame raise) must not crash the logger.
    class DeadFrame:
        @property
        def url(self) -> str:
            raise RuntimeError("Frame was detached")

        @property
        def parent_frame(self) -> None:
            raise RuntimeError("Frame was detached")

    sess._on_frame_detached(DeadFrame())
    assert len(sess._frame_lifecycle) == 4
    assert sess._frame_lifecycle[-1]["kind"] == "detached"
    assert sess._frame_lifecycle[-1]["url"] == ""


def test_binding_source_child_frame_adds_frame_context() -> None:
    sess = RecordingSession(session_id="frame-context")

    class FakeElement:
        def evaluate(self, script: str) -> dict:
            if "getBoundingClientRect" in script:
                return {"x": 42, "y": 18, "w": 600, "h": 720}
            return {
                "id": "object-builder-ui",
                "data-test-id": "object-builder-ui-iframe",
                "data-selenium-test": "associate-panel-iframe",
                "name": "",
                "title": "",
                "aria-label": "",
                "src": "https://app-na2.hubspot.com/object-builder/246242636/0-1/embed?",
            }

    class FakeFrame:
        def __init__(self, parent: object | None, url: str = "") -> None:
            self.parent_frame = parent
            self.url = url

        def frame_element(self) -> FakeElement:
            return FakeElement()

    class FakePage:
        pass

    payload = _payload()
    src_frame = FakeFrame(
        object(),
        "https://app-na2.hubspot.com/object-builder/246242636/0-1/embed?",
    )
    sess._binding_sink_sync(
        {
            "page": FakePage(),
            "frame": src_frame,
        },
        payload,
    )

    # _binding_sink_sync must NOT compute frame context itself — that requires Playwright
    # sync-API calls, and this callback runs from inside Playwright's own dispatcher while
    # delivering an expose_binding call; a nested blocking call there is a reentrancy hazard
    # that can deadlock forever with no exception raised. It only passes the raw frame
    # through; extraction happens later, from the plain pump-loop drain (see
    # _consume_payload_sync), which is never invoked from inside that dispatch.
    queued_payload, _page, queued_frame = sess._pending_payloads.get_nowait()
    assert queued_frame is src_frame
    assert "frame" not in queued_payload
    assert "_frame_offset" not in queued_payload

    frame_context, frame_offset = recorder_session._frame_context_and_offset_sync(queued_frame)
    # Cutover: frame chain carries durability-ranked fingerprint signals, not a single selector.
    chain0 = frame_context["chain"][0]
    signals = chain0["fingerprint"]["signals"]
    selectors = [s["selector"] for s in signals]
    # Highest-durability frame signal is a test-id attribute selector.
    assert signals[0]["selector"].startswith("iframe[data-")
    assert 'iframe[data-test-id="object-builder-ui-iframe"]' in selectors
    assert 'iframe[id="object-builder-ui"]' in selectors
    assert frame_offset == {"x": 42.0, "y": 18.0}


def test_frame_offset_adjusts_visual_bbox_before_capture(tmp_path) -> None:
    # Screenshots are no longer taken synchronously; we verify the bbox offset adjustment
    # and viewport capture happen correctly in _finalize_payload_sync.
    sess = RecordingSession(session_id="frame-bbox", data_root=tmp_path)
    sess._video_session_start_wall_ms = 1

    class FakePage:
        viewport_size = {"width": 1280, "height": 720}

        def is_closed(self) -> bool:
            return False

    payload = _payload()
    payload["_frame_offset"] = {"x": 50, "y": 20}
    payload["frame"] = {
        "chain": [
            {
                "selector": 'iframe[id="object-builder-ui"]',
                "fallback_selectors": [],
                "url": "",
                "url_pattern": "",
            }
        ]
    }

    event = sess._finalize_payload_sync(FakePage(), tmp_path / "sessions" / sess.session_id, payload)

    assert event.visual.bbox == {"x": 51, "y": 21, "w": 20, "h": 10}
    assert event.visual.viewport == "1280x720"
    assert event.frame.chain[0]["selector"] == 'iframe[id="object-builder-ui"]'
    # full_screenshot is None during recording; frame extractor sets it at shutdown.
    assert event.visual.full_screenshot is None


def test_visual_capture_is_deferred_to_frame_extraction(tmp_path) -> None:
    # Screenshots are no longer captured synchronously during recording.
    # full_screenshot and element_snapshot are always None until frame_extractor runs at shutdown.
    sess = RecordingSession(session_id="visual-fallback", data_root=tmp_path)
    sess._video_session_start_wall_ms = 1

    class FakePage:
        def is_closed(self) -> bool:
            return False

    sess._page = FakePage()
    sess._consume_payload_sync(_payload())

    assert len(sess.snapshot_events()) == 1
    assert sess.snapshot_events()[0]["visual"]["full_screenshot"] is None
    assert sess.snapshot_events()[0]["visual"]["element_snapshot"] is None
    # No visual capture errors — capture is deferred, not attempted during recording.
    assert not any(err.startswith("visual_capture_error:") for err in sess.binding_errors)


def test_finalize_video_file_renames_webm_without_touching_events(tmp_path) -> None:
    # Frame extraction moved to compile time (see handlers/compile.py and
    # frame_extractor.py) so it can be retried per-event on recompile.
    # Finalize at recorder shutdown now only renames Playwright's raw .webm —
    # it no longer needs or touches events.jsonl at all.
    sess = RecordingSession(session_id="empty-video", data_root=tmp_path)
    session_dir = tmp_path / "sessions" / sess.session_id
    session_dir.mkdir(parents=True)
    raw_video = session_dir / "playwright-output.webm"
    raw_video.write_bytes(b"video")

    sess._finalize_video_file_sync()

    assert not raw_video.exists()
    assert (session_dir / "recording.webm").read_bytes() == b"video"
    assert not (session_dir / "events.jsonl").exists()
    assert sess.binding_errors == []


def test_no_filechooser_listener_is_registered() -> None:
    """Regression guard for uploads being unrecordable.

    Attaching a Playwright "filechooser" listener switches on interception: the native OS file
    picker never opens, the user cannot choose a file, the input's change event never fires, and
    bridge.js therefore never emits upload_intent. Recording is always headed, so the real dialog
    must be allowed through. Re-adding a listener here silently breaks every upload workflow.
    """
    sess = RecordingSession(session_id="no-filechooser")
    registered: list[str] = []

    class _FakePage:
        def on(self, event: str, _handler) -> None:
            registered.append(event)

    sess._attach_page_listeners(_FakePage())

    assert "filechooser" not in registered
    # The other page-level listeners must still be wired, or this test would pass vacuously.
    assert {"download", "dialog", "popup", "framenavigated"} <= set(registered)
