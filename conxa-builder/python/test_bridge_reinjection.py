"""Real Chromium + real bridge.js + real RecordingSession — no fabricated event dicts.

Regression for: HubSpot's contact-creation panel replaces an iframe's content via
document.open()/document.write() instead of navigating (its micro-frontend pattern).
That swap fires no Playwright navigation event, so add_init_script never re-runs, and
the old flag-pair reinstall check in session.py could read a false "still installed"
(the document expando survives the swap even though the swap wipes the document's own
event listeners) — leaving typed input in the swapped-in content silently uncaptured.
Confirmed against a real user recording: 6 top-level clicks captured, zero `type`
events, even though the user typed into the (iframe-hosted) form.

Fix: bridge.js now patches Document.prototype.open/write/writeln to re-attach its
document-scoped listeners synchronously, in-page, the moment a swap happens — no
poll cadence, no race window.
"""
from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from queue import Empty

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
CORE_ROOT = REPO_ROOT / "packages" / "conxa-core"
for path in (ROOT, CORE_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from playwright.sync_api import sync_playwright  # noqa: E402

from conxa_compile.recorder.session import RecordingSession  # noqa: E402
from conxa_compile.recorder.frame_utils import (  # noqa: E402
    _frame_context_and_offset_sync,
    _load_bridge_script,
)

# The iframe's own script replaces its content via document.open()/write() ~150ms after
# load — no navigation, no framenavigated event. The real input only exists post-swap.
_TOP_HTML = """<!doctype html>
<html><body>
<iframe id="panel" srcdoc="
  &lt;div&gt;loading…&lt;/div&gt;
  &lt;script&gt;
    setTimeout(function () {
      document.open();
      document.write('&lt;input id=&quot;first&quot; type=&quot;text&quot;&gt;');
      document.close();
    }, 150);
  &lt;/script&gt;
"></iframe>
</body></html>"""


class BridgeReinjectionTests(unittest.TestCase):
    """Drives a real RecordingSession's browser directly (single-threaded, no
    RecordingSession.start()'s background thread — a script can't play the human
    otherwise; there's no GUI-automation tool in this environment). A lightweight
    binding sink (no nested Playwright calls) avoids the reentrancy deadlock the
    real _binding_sink_sync would hit if invoked from inside an in-flight action —
    frame-chain extraction runs afterward, using the exact same real function.
    """

    def _record(self, session_id: str) -> list[dict]:
        sess = RecordingSession(session_id=session_id, start_url="about:blank")
        captured: list[tuple[dict, object]] = []

        def _lightweight_sink(source, payload):
            if payload.get("_trace"):
                return
            captured.append((dict(payload), source.get("frame")))

        sess._playwright = sync_playwright().start()
        sess._browser = sess._playwright.chromium.launch(headless=True)
        try:
            sess._context = sess._browser.new_context()
            # Required by _finalize_payload_sync for non-auth sessions (raises otherwise) —
            # real recordings set these in _run_sync_recorder right after context creation.
            sess._video_session_start = time.monotonic()
            sess._video_session_start_wall_ms = int(time.time() * 1000)
            sess._bridge_script = _load_bridge_script(capture_hover=False)
            sess._context.expose_binding("__skillReport", _lightweight_sink)
            sess._context.add_init_script(sess._bridge_script)
            sess._context.on("page", sess._on_context_page)
            sess._page = sess._context.new_page()
            sess._page.set_content(_TOP_HTML)
            sess._ensure_bridge_installed_sync(sess._page)

            # Let the iframe's own timer fire the document.open()/write() swap.
            sess._page.wait_for_timeout(400)

            panel = next(f for f in sess._page.frames if f != sess._page.main_frame)
            panel.wait_for_selector("#first", timeout=5000)
            panel.click("#first")
            panel.type("#first", "Alice", delay=20)
            # bridge.js debounces "type" reporting (input_debounce_ms, default 350ms).
            sess._page.wait_for_timeout(600)

            for payload, src_frame in captured:
                frame_context, frame_offset = _frame_context_and_offset_sync(src_frame)
                if frame_context:
                    payload["frame"] = frame_context
                    payload["_frame_offset"] = frame_offset
                sess._consume_payload_safe_sync(payload, sess._page)
        finally:
            sess._context.close()
            sess._browser.close()
            sess._playwright.stop()

        return [e.model_dump(mode="json") for e in sess._materialized]

    def test_typing_after_document_open_write_swap_is_captured(self) -> None:
        events = self._record("test-bridge-reinjection-open-write")
        type_events = [e for e in events if (e.get("action") or {}).get("action") == "type"]
        self.assertEqual(
            len(type_events), 1,
            f"expected exactly one captured 'type' event after the document.open()/write() "
            f"swap, got {len(type_events)} (all events: {events})",
        )
        ev = type_events[0]
        self.assertEqual(ev["action"]["value"], "Alice")
        chain = (ev.get("frame") or {}).get("chain") or []
        self.assertTrue(chain, "typed event should resolve to the iframe, not top-level")

    def test_repeated_swaps_capture_once_each_no_duplicates(self) -> None:
        # Same fixture, but type immediately after the first swap, wait, then confirm
        # a second manual swap (still same frame) also re-attaches cleanly with no
        # leftover duplicate listeners from the first install.
        session_id = "test-bridge-reinjection-repeat"
        sess = RecordingSession(session_id=session_id, start_url="about:blank")
        captured: list[tuple[dict, object]] = []

        def _lightweight_sink(source, payload):
            if payload.get("_trace"):
                return
            captured.append((dict(payload), source.get("frame")))

        sess._playwright = sync_playwright().start()
        sess._browser = sess._playwright.chromium.launch(headless=True)
        try:
            sess._context = sess._browser.new_context()
            # Required by _finalize_payload_sync for non-auth sessions (raises otherwise) —
            # real recordings set these in _run_sync_recorder right after context creation.
            sess._video_session_start = time.monotonic()
            sess._video_session_start_wall_ms = int(time.time() * 1000)
            sess._bridge_script = _load_bridge_script(capture_hover=False)
            sess._context.expose_binding("__skillReport", _lightweight_sink)
            sess._context.add_init_script(sess._bridge_script)
            sess._context.on("page", sess._on_context_page)
            sess._page = sess._context.new_page()
            sess._page.set_content(_TOP_HTML)
            sess._ensure_bridge_installed_sync(sess._page)
            sess._page.wait_for_timeout(400)

            panel = next(f for f in sess._page.frames if f != sess._page.main_frame)
            panel.wait_for_selector("#first", timeout=5000)

            # A second swap, triggered manually from the test (mirrors a micro-frontend
            # re-rendering the same panel a second time).
            panel.evaluate(
                '() => { document.open(); document.write(\'<input id="second" type="text">\'); document.close(); }'
            )
            panel.wait_for_selector("#second", timeout=5000)
            panel.click("#second")
            panel.type("#second", "Bob", delay=20)
            sess._page.wait_for_timeout(600)

            for payload, src_frame in captured:
                frame_context, frame_offset = _frame_context_and_offset_sync(src_frame)
                if frame_context:
                    payload["frame"] = frame_context
                    payload["_frame_offset"] = frame_offset
                sess._consume_payload_safe_sync(payload, sess._page)
        finally:
            sess._context.close()
            sess._browser.close()
            sess._playwright.stop()

        events = [e.model_dump(mode="json") for e in sess._materialized]
        type_events = [e for e in events if (e.get("action") or {}).get("action") == "type"]
        self.assertEqual(
            len(type_events), 1,
            f"expected exactly one 'type' event (no duplicates across two swaps), "
            f"got {len(type_events)}: {type_events}",
        )
        self.assertEqual(type_events[0]["action"]["value"], "Bob")


if __name__ == "__main__":
    unittest.main()
