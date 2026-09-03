"""Local HTTP server that answers window.alert/confirm/prompt without depending on Chromium's
own native-dialog machinery.

Why this exists: recording a native alert/confirm/prompt used to hold Chromium's real dialog
open (via CDP) while asking the human to answer in the Studio's own window. That worked for a
fast alert but not reliably for a confirm/prompt that took the human more than a few seconds to
answer — a live recorded session showed Chromium resolving the dialog on its own (a native
Chromium-internal patience limit for an unacknowledged dialog, not something visible or
controllable from Playwright's driver) before our own dialog.accept() call reached it, leaving
the human having to answer a second, genuinely native box. No amount of sequencing on the Python
side can extend that patience — CDP only offers accept()/dismiss(), never "give me more time".

The fix moves interception earlier: session.py injects DIALOG_OVERRIDE_SCRIPT into every page as
an init script, overriding window.alert/confirm/prompt themselves before the page's own scripts
ever run. The override blocks via a *synchronous* XHR to this server instead of calling the real
native function at all — so the real native dialog never opens, and there is nothing left for
Chromium to grow impatient with. This server simply waits for the human's answer for as long as
it takes (bounded only by the same _JS_DIALOG_TIMEOUT_S-style fallback the old path had).

This does not, and cannot, cover `beforeunload` — its native "leave this page?" prompt is not
one of the three overridable functions (it fires from a `beforeunload` event's return value, not
a callable). That one case still goes through session.py's original CDP-based _on_dialog /
_pending_dialog / _drain_js_dialog_sync path, unchanged.
"""
from __future__ import annotations

import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

# Injected via context.add_init_script, separately from bridge.js — kept standalone so this
# fix's surface stays small and doesn't touch bridge.js's own already-large capture logic.
# {PORT} is substituted with this server's actual bound port before injection.
DIALOG_OVERRIDE_SCRIPT_TEMPLATE = r"""
(function () {
  var PORT = {PORT};
  function ask(type, message, defaultValue) {
    try {
      var xhr = new XMLHttpRequest();
      // Synchronous on purpose: a real alert()/confirm()/prompt() blocks the calling script
      // until answered, and callers of these overrides expect the same contract.
      xhr.open("POST", "http://127.0.0.1:" + PORT + "/dialog", false);
      xhr.send(JSON.stringify({
        type: type,
        message: String(message == null ? "" : message),
        default: defaultValue == null ? "" : String(defaultValue),
        href: String(location.href || "")
      }));
      if (xhr.status !== 200) throw new Error("dialog server returned " + xhr.status);
      return JSON.parse(xhr.responseText);
    } catch (e) {
      // Recorder's local dialog server is unreachable (shouldn't happen mid-recording) — fail
      // closed, the same outcome a human clicking Cancel would produce, never silently accept.
      return { accepted: false, text: "" };
    }
  }
  window.alert = function (message) { ask("alert", message, ""); };
  window.confirm = function (message) { return ask("confirm", message, "").accepted; };
  window.prompt = function (message, defaultValue) {
    var r = ask("prompt", message, defaultValue);
    return r.accepted ? r.text : null;
  };
})();
"""

_DIALOG_TIMEOUT_S = 120.0


class DialogSyncServer:
    """One per recording session, bound to an ephemeral localhost port for its lifetime. The
    page-side override above POSTs to it and blocks (via synchronous XHR) until answered.

    Threading: ThreadingHTTPServer hands each request its own thread, so blocking inside
    _handle_dialog_sync while waiting for a human's answer never stalls any other request —
    including a second dialog opening on a different tab while this one is still pending."""

    def __init__(
        self,
        *,
        on_opened: Callable[[str, str, str, str], None],
        on_answered: Callable[[str, str, str, bool, str, str], None],
        on_timed_out: Callable[[str, str, str, str], None],
    ) -> None:
        # on_opened(request_id, dialog_type, message, default_value): fires the instant a
        #   dialog opens, before waiting for anyone — broadcast it to the Studio.
        # on_answered(request_id, dialog_type, message, accepted, text, href): fires once a
        #   human answered for real — record the step and let the Studio release its window
        #   pin. href is the page's location.href at the moment of the call, since (unlike the
        #   old CDP path) this server has no direct Playwright page reference of its own — it's
        #   the best available signal for which tab a synthetic dialog_accept/dismiss event
        #   should be stamped against in a multi-tab recording.
        # on_timed_out(request_id, dialog_type, message, href): fires past _DIALOG_TIMEOUT_S
        #   with no answer — record a forced-empty accept and tell the Studio to give up
        #   waiting.
        self._on_opened = on_opened
        self._on_answered = on_answered
        self._on_timed_out = on_timed_out
        self._pending: dict[str, threading.Event] = {}
        self._answers: dict[str, tuple[bool, str]] = {}
        self._lock = threading.Lock()
        outer = self

        class _Handler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass  # silence default stderr access logging

            def do_OPTIONS(self) -> None:  # pragma: no cover - CORS preflight; POST body here
                self.send_response(204)  # is text/plain (a "simple" request) so browsers
                self._cors()  # normally skip preflight, but answer it correctly if one arrives.
                self.end_headers()

            def do_POST(self) -> None:
                if self.path != "/dialog":
                    self.send_response(404)
                    self._cors()
                    self.end_headers()
                    return
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b"{}"
                try:
                    body = json.loads(raw or b"{}")
                except Exception:  # noqa: BLE001
                    body = {}
                accepted, text = outer._handle_dialog_sync(
                    str(body.get("type") or "alert"),
                    str(body.get("message") or ""),
                    str(body.get("default") or ""),
                    str(body.get("href") or ""),
                )
                payload = json.dumps({"accepted": accepted, "text": text}).encode("utf-8")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def _cors(self) -> None:
                # The page (https://…) and this server (http://127.0.0.1:PORT) are always
                # cross-origin — without this the browser would block the script from ever
                # reading the response, even though the request itself was sent.
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.port: int = self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def _handle_dialog_sync(
        self, dialog_type: str, message: str, default_value: str, href: str
    ) -> tuple[bool, str]:
        request_id = str(uuid.uuid4())
        event = threading.Event()
        with self._lock:
            self._pending[request_id] = event
        try:
            self._on_opened(request_id, dialog_type, message, default_value)
        except Exception:  # noqa: BLE001
            pass
        answered = event.wait(_DIALOG_TIMEOUT_S)
        with self._lock:
            self._pending.pop(request_id, None)
            answer = self._answers.pop(request_id, None)
        if not answered or answer is None:
            try:
                self._on_timed_out(request_id, dialog_type, message, href)
            except Exception:  # noqa: BLE001
                pass
            return False, ""
        accepted, text = answer
        try:
            self._on_answered(request_id, dialog_type, message, accepted, text, href)
        except Exception:  # noqa: BLE001
            pass
        return accepted, text

    def resolve(self, request_id: str, accepted: bool, text: str) -> bool:
        """Delivers the Studio's answer. Returns False if request_id isn't one of ours (e.g. a
        beforeunload dialog answered through the older CDP path instead) so the caller can fall
        through to that path — see RecordingSession.resolve_js_dialog."""
        with self._lock:
            event = self._pending.get(request_id)
            if event is None:
                return False
            self._answers[request_id] = (accepted, text)
        event.set()
        return True

    def stop(self) -> None:
        try:
            self._httpd.shutdown()
        except Exception:  # noqa: BLE001
            pass
