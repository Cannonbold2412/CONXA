"""Auth/deps/onboarding and recording-session command handlers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from services import bootstrap as _bootstrap_pkg
from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.storage.workflow_store import get_workflow as _get_workflow
from handlers.protocol import _CommandError, _event_sink, _safe_id

class SessionMixin:
    def cmd_ping(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        return {"ok": True, "pid": os.getpid()}

    def cmd_deps_status(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Fast offline check — returns which deps are already present."""
        return _bootstrap_pkg.check_status()

    def cmd_deps_check(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Fetch the cloud manifest and return which deps are outdated.

        Pass {"force": true} to bypass the 24 h TTL cache.
        Returns {"outdated": [{"dep": str, "installed": str|None, "available": str}]}
        """
        force = bool(payload.get("force", False))
        outdated = _bootstrap_pkg.check_for_updates(self._cloud_api, force=force)
        return {"outdated": outdated}

    def cmd_deps_apply(self, _payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Apply all pending dependency updates.

        Downloads, verifies, and atomically installs each outdated dep.
        Streams progress events. Returns {"ok": true} on success.
        """
        return _bootstrap_pkg.ensure_all(self._cloud_api, on_event=_event_sink(rid))

    def cmd_bootstrap(self, _payload: dict[str, Any], rid: str) -> dict[str, Any]:
        return _bootstrap_pkg.ensure_all(self._cloud_api, on_event=_event_sink(rid))

    def cmd_login(self, _payload: dict[str, Any], rid: str) -> dict[str, Any]:
        return {"identity": self._auth_service().login(on_event=_event_sink(rid))}

    def cmd_logout(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        self._auth_service().logout()
        return {"ok": True}

    def cmd_whoami(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        return {"identity": self._auth_service().current_identity()}

    def cmd_start_recording(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import re
        from pathlib import Path
        from conxa_core.config import settings as _settings

        with self._rec_lock:
            if self._active_recording is not None:
                stale = _recorder_registry.get(self._active_recording)
                if stale is not None and stale.browser_open:
                    raise _CommandError(
                        "recording_in_progress",
                        "You already have a recording in progress. Finish or close that "
                        "browser window before starting a new one.",
                    )
                # The previous session's browser is already gone (closed, crashed, or the
                # app was reloaded before stop_recording ran) but nothing cleared the lock —
                # release it instead of permanently blocking new recordings.
                if stale is not None:
                    _recorder_registry.pop(self._active_recording)
                self._active_recording = None

            workflow_id_raw = payload.get("workflow_id")
            workflow_id = _safe_id(workflow_id_raw, "workflow_id") if workflow_id_raw else ""

            if workflow_id:
                # Workflow recording (auth is captured once at the group level —
                # see handlers/groups.py's cmd_start_group_app_auth — so this
                # path only ever records the workflow itself, seeded with the
                # group's merged session).
                from conxa_core.storage.group_store import get_group
                from conxa_core.storage.storage_state import merge_storage_states

                workflow = _get_workflow(workflow_id)
                if not workflow:
                    raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
                group = get_group(workflow.group_id) if workflow.group_id else None
                if group is None or not group.apps or any(not a.captured_at for a in group.apps):
                    raise _CommandError("auth_required", "Authenticate every app in this workflow's group before recording.")

                states = []
                for app in group.apps:
                    if app.storage_state_path and Path(app.storage_state_path).is_file():
                        import json as _json
                        states.append(_json.loads(Path(app.storage_state_path).read_text(encoding="utf-8")))
                merged = merge_storage_states(states)

                import json as _json
                workflow_dir = Path(_settings.data_dir) / "workflows" / workflow_id
                workflow_dir.mkdir(parents=True, exist_ok=True)
                merged_path = workflow_dir / "merged_group_state.json"
                merged_path.write_text(_json.dumps(merged), encoding="utf-8")
                storage_state_path = str(merged_path)
                storage_state_autosave = ""

                start_url = str((workflow.protected_url or workflow.target_url or "about:blank")).strip()
                url_variables = payload.get("url_variables")
                if isinstance(url_variables, dict) and url_variables:
                    pattern = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")
                    start_url = pattern.sub(
                        lambda m: str(url_variables.get(m.group(1)) or m.group(0)),
                        start_url,
                    )
            else:
                start_url = str(payload.get("start_url") or "about:blank")
                storage_state_path = str(payload.get("storage_state_path") or "")
                storage_state_autosave = str(payload.get("storage_state_autosave_path") or "")

            sess = _recorder_registry.create(
                start_url=start_url,
                storage_state_path=storage_state_path,
                storage_state_autosave_path=storage_state_autosave,
                capture_hover=bool(payload.get("capture_hover")),
            )
            try:
                self._loop.run(sess.start())
            except RuntimeError as exc:
                _recorder_registry.pop(sess.session_id)
                raise _CommandError("recorder_launch_failed", str(exc)) from exc
            result = {"session_id": sess.session_id, "start_url": start_url}
            if workflow_id:
                from conxa_core.storage.workflow_store import set_recording

                updated = set_recording(workflow_id, sess.session_id)
                if updated is None:
                    self._loop.run(sess.stop())
                    _recorder_registry.pop(sess.session_id)
                    raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
                result["workflow_id"] = updated.id
            self._active_recording = sess.session_id
            return result

    def cmd_cancel_recording(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Discard an in-progress recording the user cancelled from the UI.

        Unlike cmd_stop_recording, this never saves anything — it force-stops the
        session (even if the browser is still open) and drops any workflow
        placeholder created at start_recording. This exists because closing the
        recorder's Chromium window doesn't clear the active-recording lock right
        away: session.py debounces the close for up to ~8s (plus a shutdown drain)
        before it flips browser_open to False on its own. Without this handler, a
        user who closes the browser and hits Cancel — instead of waiting for that
        auto-save/detection — leaves the lock held, so the very next
        start_recording attempt fails with "recording_in_progress" even though the
        browser is already gone.
        """
        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = _recorder_registry.get(session_id)
        if sess is not None:
            self._loop.run(sess.stop())
            _recorder_registry.pop(session_id)
        with self._rec_lock:
            if self._active_recording == session_id:
                self._active_recording = None

        workflow_id_raw = str(payload.get("workflow_id") or "").strip()
        if workflow_id_raw:
            from conxa_core.storage.workflow_store import clear_recording

            clear_recording(_safe_id(workflow_id_raw, "workflow_id"))
        return {"ok": True}

    def cmd_stop_recording(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        registry = _recorder_registry

        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = registry.get(session_id)
        if sess is None:
            raise _CommandError("session_not_found", f"No session {session_id}")
        workflow_id = str(payload.get("workflow_id") or "").strip()

        # sess.stop() joins the recorder's background thread, which owns Playwright's
        # sync API on its own thread — Playwright's sync driver only allows the thread
        # that started it to touch its objects. Touching sess._context / sess._page
        # from this (RPC) thread before that join completes throws "Cannot switch to
        # a different thread". Join first; the thread's own final storage_state save
        # (session.py's forced autosave right before its teardown) already wrote
        # the file on the correct thread, so nothing else needs to touch it here.
        events = sess.snapshot_events()
        self._loop.run(sess.stop())
        with self._rec_lock:
            if self._active_recording == session_id:
                self._active_recording = None
        if workflow_id:
            from conxa_core.storage.workflow_store import clear_recording

            workflow_id = _safe_id(workflow_id, "workflow_id")
            if len(events) == 0:
                clear_recording(workflow_id)
                raise _CommandError("empty_recording", "No workflow actions were recorded.")
            return {
                "session_id": session_id,
                "event_count": len(events),
                "workflow_id": workflow_id,
                "status": "recorded",
                "workflow_kind": "workflow",
            }
        return {"session_id": session_id, "event_count": len(events)}

