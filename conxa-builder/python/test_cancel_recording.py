from __future__ import annotations

import os
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
CORE_ROOT = REPO_ROOT / "packages" / "conxa-core"
for path in (ROOT, CORE_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

os.environ.setdefault("SKILL_GROQ_ENABLED", "true")
os.environ.setdefault("SKILL_GROQ_API_KEYS", "test-key")

from handlers.session import SessionMixin  # noqa: E402


class _FakeSession:
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.browser_open = True
        self.stopped = False

    async def stop(self) -> None:
        self.stopped = True
        self.browser_open = False


class _FakeRegistry:
    """Stand-in for conxa_compile.recorder.session.registry — no real Playwright."""

    def __init__(self) -> None:
        self._sessions: dict[str, _FakeSession] = {}

    def add(self, sess: _FakeSession) -> None:
        self._sessions[sess.session_id] = sess

    def get(self, session_id: str):
        return self._sessions.get(session_id)

    def pop(self, session_id: str):
        return self._sessions.pop(session_id, None)

    def all(self):
        return list(self._sessions.values())


class _FakeLoop:
    def run(self, coro):
        # Mirrors backend.py's _Loop.run: actually drive the coroutine to completion.
        import asyncio

        return asyncio.new_event_loop().run_until_complete(coro)


class _FakeBackend(SessionMixin):
    def __init__(self) -> None:
        self._loop = _FakeLoop()
        self._rec_lock = threading.Lock()
        self._active_recording: str | None = None


class CancelRecordingTests(unittest.TestCase):
    """Covers the fix for: closing Chromium then hitting Cancel left the
    active-recording lock held (session.py debounces close detection up to
    ~8s+), so the next start_recording call wrongly raised recording_in_progress.
    cmd_cancel_recording must release the lock immediately regardless of
    session.py's own passive close detection.
    """

    def setUp(self) -> None:
        self.registry = _FakeRegistry()
        patcher = patch("handlers.session._recorder_registry", self.registry)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_cancel_stops_session_and_clears_lock_even_if_browser_still_open(self) -> None:
        backend = _FakeBackend()
        sess = _FakeSession("sess-1")
        self.registry.add(sess)
        backend._active_recording = "sess-1"

        result = backend.cmd_cancel_recording({"session_id": "sess-1"}, "rid-1")

        self.assertEqual(result, {"ok": True})
        self.assertTrue(sess.stopped)
        self.assertIsNone(backend._active_recording)
        self.assertIsNone(self.registry.get("sess-1"))

    def test_cancel_discards_workflow_placeholder(self) -> None:
        backend = _FakeBackend()
        sess = _FakeSession("sess-2")
        self.registry.add(sess)
        backend._active_recording = "sess-2"

        with patch("conxa_core.storage.workflow_store.clear_recording") as mock_clear:
            backend.cmd_cancel_recording(
                {"session_id": "sess-2", "workflow_id": "wf-1"}, "rid-2"
            )
            mock_clear.assert_called_once_with("wf-1")

    def test_cancel_is_a_noop_when_session_already_gone(self) -> None:
        """Simulates the exact repro: browser closed, session already reaped by
        session.py's own detection before Cancel is clicked. Must still clear a
        stale lock instead of erroring."""
        backend = _FakeBackend()
        backend._active_recording = "sess-3"

        result = backend.cmd_cancel_recording({"session_id": "sess-3"}, "rid-3")

        self.assertEqual(result, {"ok": True})
        self.assertIsNone(backend._active_recording)


class ShutdownOpenSessionsTests(unittest.TestCase):
    """Covers the fix for: force-killing/Ctrl+C'ing the backend left any open
    RecordingSession's Playwright thread torn down mid-callback (greenlet
    'cannot switch to a different thread' spam on every dev restart).
    backend.py's process-exit path must stop() every still-registered session
    the same way cmd_stop_recording does, before the interpreter tears down."""

    def test_stops_every_open_session(self) -> None:
        from backend import _shutdown_open_sessions

        registry = _FakeRegistry()
        sess_a = _FakeSession("sess-a")
        sess_b = _FakeSession("sess-b")
        registry.add(sess_a)
        registry.add(sess_b)

        with patch("conxa_compile.recorder.session.registry", registry):
            _shutdown_open_sessions(_FakeBackend())

        self.assertTrue(sess_a.stopped)
        self.assertTrue(sess_b.stopped)

    def test_one_bad_session_does_not_block_the_rest(self) -> None:
        from backend import _shutdown_open_sessions

        class _BoomSession(_FakeSession):
            async def stop(self) -> None:
                raise RuntimeError("boom")

        registry = _FakeRegistry()
        boom = _BoomSession("sess-boom")
        ok = _FakeSession("sess-ok")
        registry.add(boom)
        registry.add(ok)

        with patch("conxa_compile.recorder.session.registry", registry):
            _shutdown_open_sessions(_FakeBackend())  # must not raise

        self.assertTrue(ok.stopped)


if __name__ == "__main__":
    unittest.main()
