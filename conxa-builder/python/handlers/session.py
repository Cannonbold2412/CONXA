"""Auth/deps/onboarding and recording-session command handlers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from services import bootstrap as _bootstrap_pkg
from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.storage.plugin_store import get_plugin as _get_plugin
from handlers.protocol import _CommandError, _event_sink, _is_rejected_protected_url, _safe_id

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

            plugin_id_raw = payload.get("plugin_id")
            plugin_id = _safe_id(plugin_id_raw, "plugin_id") if plugin_id_raw else ""
            workflow_name = payload.get("workflow_name")

            if plugin_id:
                plugin = _get_plugin(plugin_id)
                if not plugin:
                    raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
                auth_mode = (workflow_name == "__auth__")
                plugin_dir = Path(_settings.data_dir) / "plugins" / plugin_id
                auth_state_path = str(plugin_dir / "auth" / "auth.json")
                storage_state_path = auth_state_path
                storage_state_autosave = str(plugin_dir / "auth" / "auth.json") if auth_mode else ""
                if auth_mode:
                    start_url = str(plugin.target_url or "about:blank")
                else:
                    workflow_name = str(workflow_name or "").strip()
                    if not workflow_name:
                        raise _CommandError("invalid_input", "workflow_name is required")
                    if plugin.status != "ready" or plugin.auth is None:
                        raise _CommandError("auth_required", "Record auth before creating workflows.")
                    storage_state_path = str(plugin.auth.storage_state_path or auth_state_path)
                    if not Path(storage_state_path).is_file():
                        raise _CommandError("auth_required", "Saved auth session is missing. Re-record auth first.")
                    start_url = str((plugin.protected_url or plugin.target_url or "about:blank")).strip()
                    url_variables = payload.get("url_variables")
                    if isinstance(url_variables, dict) and url_variables:
                        pattern = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")
                        start_url = pattern.sub(
                            lambda m: str(url_variables.get(m.group(1)) or m.group(0)),
                            start_url,
                        )
            else:
                start_url = str(payload.get("start_url") or "about:blank")
                auth_mode = bool(payload.get("auth_mode"))
                storage_state_path = str(payload.get("storage_state_path") or "")
                storage_state_autosave = str(payload.get("storage_state_autosave_path") or "")

            sess = _recorder_registry.create(
                start_url=start_url,
                storage_state_path=storage_state_path,
                storage_state_autosave_path=storage_state_autosave,
                auth_mode=auth_mode,
                capture_hover=bool(payload.get("capture_hover")),
            )
            try:
                self._loop.run(sess.start())
            except RuntimeError as exc:
                _recorder_registry.pop(sess.session_id)
                raise _CommandError("recorder_launch_failed", str(exc)) from exc
            result = {"session_id": sess.session_id, "start_url": start_url}
            if plugin_id and not auth_mode:
                from conxa_core.storage.plugin_store import add_workflow

                added = add_workflow(plugin_id, str(workflow_name), sess.session_id)
                if added is None:
                    self._loop.run(sess.stop())
                    _recorder_registry.pop(sess.session_id)
                    raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
                _plugin, workflow = added
                result["workflow_id"] = workflow.id
            self._active_recording = sess.session_id
            return result

    def cmd_stop_recording(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        registry = _recorder_registry

        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = registry.get(session_id)
        if sess is None:
            raise _CommandError("session_not_found", f"No session {session_id}")
        plugin_id = str(payload.get("plugin_id") or "").strip()
        auth_mode = bool(payload.get("auth_mode"))
        storage_state_path = ""
        if auth_mode:
            if not plugin_id:
                raise _CommandError("invalid_input", "plugin_id is required")
            plugin_id = _safe_id(plugin_id, "plugin_id")
            plugin = _get_plugin(plugin_id)
            if plugin is None:
                raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")

            from conxa_core.config import settings as _settings

            storage_state_path = str(Path(_settings.data_dir) / "plugins" / plugin_id / "auth" / "auth.json")

        # sess.stop() joins the recorder's background thread, which owns Playwright's
        # sync API on its own thread — Playwright's sync driver only allows the thread
        # that started it to touch its objects. Touching sess._context / sess._page
        # from this (RPC) thread before that join completes throws "Cannot switch to
        # a different thread". Join first; the thread's own final storage_state save
        # (session.py's forced autosave right before its teardown) already wrote
        # auth.json on the correct thread, so nothing else needs to touch it here.
        events = sess.snapshot_events()
        self._loop.run(sess.stop())
        with self._rec_lock:
            if self._active_recording == session_id:
                self._active_recording = None
        final_url = str(getattr(sess, "current_url", "") or "")
        if auth_mode:
            from conxa_core.storage.plugin_store import set_plugin_auth

            storage_state_saved = Path(storage_state_path).is_file()
            if not storage_state_saved:
                raise _CommandError("auth_capture_failed", "Auth browser closed before a session could be saved.")
            protected_url = final_url if not _is_rejected_protected_url(final_url) else None
            updated = set_plugin_auth(plugin_id, session_id, storage_state_path, protected_url=protected_url)
            if updated is None:
                raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
            return {
                "session_id": session_id,
                "event_count": len(events),
                "plugin_status": updated.status,
                "storage_state_saved": storage_state_saved,
                "protected_url": updated.protected_url,
            }
        workflow_id = str(payload.get("workflow_id") or "").strip()
        if plugin_id and workflow_id:
            from conxa_core.storage.plugin_store import remove_workflow

            plugin_id = _safe_id(plugin_id, "plugin_id")
            workflow_id = _safe_id(workflow_id, "workflow_id")
            if len(events) == 0:
                remove_workflow(plugin_id, workflow_id)
                raise _CommandError("empty_recording", "No workflow actions were recorded.")
            return {
                "session_id": session_id,
                "event_count": len(events),
                "workflow_id": workflow_id,
                "status": "recorded",
                "workflow_kind": "workflow",
            }
        return {"session_id": session_id, "event_count": len(events)}

