"""The a11y snapshot must actually be captured, on a real Playwright page.

Regression: `_capture_a11y_async` ran `page.locator("body").aria_snapshot()` inside a
`threading.Thread` to bound it to 2s. Playwright's SYNC api is greenlet-based and bound to the
thread that created the session, so every one of those calls raised

    Cannot switch to a different thread

and the method returned None. a11y capture was therefore dead on arrival for every event of
every recording, and the only visible trace was a single `a11y_capture_error` line in the
session's recorder_diag.json.

The damage was downstream and silent: with no a11y tree on disk,
`identity_bundle.generate_deterministic_signals` cannot run `resolves_to_nothing()` on a
role+name selector, so a FABRICATED accessible name — `captureAssociatedLabel`'s last-resort
"nearest surrounding text" walk naming a react-select input after the "State and City" heading
above it — shipped as the bundle's highest-durability (0.95) signal and matched nothing at
replay. The step failed as "element not found (resolve miss)".

A mock page cannot catch this: the whole bug is that the real client is thread-affine. The test
must drive an actual browser.
"""
from __future__ import annotations

import threading

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright

from conxa_compile.recorder.session import RecordingSession

PAGE_HTML = """
<main>
  <h2>State and City</h2>
  <button>Submit</button>
  <input aria-label="Search" />
</main>
"""


@pytest.fixture()
def live_page():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(PAGE_HTML)
        try:
            yield page
        finally:
            browser.close()


def test_a11y_snapshot_is_captured_from_a_real_page(live_page) -> None:
    sess = RecordingSession(session_id="a11y-capture")

    tree = sess._capture_a11y_snapshot(live_page)

    assert tree is not None, "a11y capture returned nothing — the snapshot is dead again"
    snapshot = tree["aria_snapshot"]
    assert "button" in snapshot and "Submit" in snapshot
    assert not sess.binding_errors, f"capture logged errors: {sess.binding_errors}"


def test_capture_runs_on_the_calling_thread(live_page) -> None:
    # The bug was structural, not incidental: any hand-off to another thread reintroduces it.
    # Pin the property directly so a future "let's make this async again" refactor fails here
    # rather than silently in production.
    captured_on: list[int] = []
    original = type(live_page).locator

    def spy(self, *args, **kwargs):
        captured_on.append(threading.get_ident())
        return original(self, *args, **kwargs)

    type(live_page).locator = spy
    try:
        RecordingSession(session_id="a11y-thread")._capture_a11y_snapshot(live_page)
    finally:
        type(live_page).locator = original

    assert captured_on, "aria_snapshot never reached the page"
    assert captured_on[0] == threading.get_ident(), (
        "aria_snapshot ran on a different thread than the Playwright session — "
        "the sync API is greenlet-bound and this always raises"
    )


def test_capture_failure_is_reported_not_swallowed(live_page, monkeypatch) -> None:
    sess = RecordingSession(session_id="a11y-fail")
    monkeypatch.setattr(
        type(live_page), "locator",
        lambda self, *a, **k: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    assert sess._capture_a11y_snapshot(live_page) is None
    assert any("a11y_capture_error" in e for e in sess.binding_errors)
    assert any("boom" in e for e in sess.binding_errors)


def test_capture_is_bounded_by_a_native_timeout(live_page) -> None:
    # The timeout must reach Playwright itself — that is what replaced the thread.
    seen: dict = {}
    original = type(live_page.locator("body")).aria_snapshot

    def spy(self, **kwargs):
        seen.update(kwargs)
        return original(self, **kwargs)

    type(live_page.locator("body")).aria_snapshot = spy
    try:
        RecordingSession(session_id="a11y-timeout")._capture_a11y_snapshot(live_page)
    finally:
        type(live_page.locator("body")).aria_snapshot = original

    assert seen.get("timeout") == RecordingSession.A11Y_CAPTURE_TIMEOUT_MS
