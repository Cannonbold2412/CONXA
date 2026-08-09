"""Pipeline and compile command handlers."""

from __future__ import annotations

from typing import Any

from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.progress import job_event_scope
from handlers.protocol import _CommandError, _event_sink, _safe_id

class CompileMixin:
    def cmd_run_pipeline(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.pipeline.run import run_pipeline
        from conxa_core.storage.session_events import read_session_events
        registry = _recorder_registry

        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = registry.get(session_id)
        raw = sess.snapshot_events() if sess else read_session_events(session_id)
        normalized = run_pipeline(raw)
        return {"session_id": session_id, "event_count": len(normalized)}

    def cmd_compile(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        import time as _time
        from conxa_compile.compiler.build import compile_skill_package
        from conxa_compile.pipeline.run import run_pipeline
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_core.storage.plugin_store import get_plugin, save_plugin
        from conxa_core.storage.session_events import read_session_events, session_events_path
        from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded
        registry = _recorder_registry

        session_id = _safe_id(payload.get("session_id"), "session_id")
        plugin_id = str(payload.get("plugin_id") or "").strip()
        plugin = None
        workflow = None
        if plugin_id:
            plugin_id = _safe_id(plugin_id, "plugin_id")
            plugin = get_plugin(plugin_id)
            if plugin is None:
                raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
            workflow = next((wf for wf in plugin.workflows if wf.session_id == session_id), None)
            if workflow is None:
                raise _CommandError("workflow_not_found", f"No workflow recorded for session {session_id}")

        title = str(payload.get("skill_title") or "").strip()
        if not title and workflow is not None:
            title = workflow.name.strip()
        if not title:
            raise _CommandError("invalid_input", "skill_title is required")

        usage_class = "compile"
        reservation_id: str | None = None
        reservation_committed = False

        sink = _event_sink(rid)

        def _log(message: str, level: str = "info") -> None:
            sink({"phase": "compile_log", "message": message, "level": level, "ts": _time.time()})

        workflow_id = str(getattr(workflow, "id", "") or "")
        reservation_id = self._compile_reservation_id(rid, plugin_id, workflow_id, session_id)
        _log("Reserving one compile credit...")
        reserve = self._reserve_compile_credit(
            reservation_id=reservation_id,
            plugin_id=plugin_id,
            workflow_id=workflow_id,
            session_id=session_id,
        )
        sink({"phase": "quota", "meter": "compile_credits", "status": "reserved", **reserve})

        sink({"phase": "pipeline_start"})
        sink({"phase": "compile_step", "step": "normalize", "status": "running"})
        _log("Loading session events…")

        try:
            sess = registry.get(session_id)
            if sess is not None:
                # recording.webm is renamed into place in the recorder thread's
                # shutdown path (session.py:_finalize_video_file_sync). Wait for
                # that to finish before extracting frames from it.
                thread = getattr(sess, '_thread', None)
                if thread is not None and thread.is_alive():
                    _log("Waiting for recording to finalize…")
                    thread.join(timeout=30)
                    if thread.is_alive():
                        _log("Recording finalize still running after 30 s — compiling without frames.", level="warn")

            session_dir = session_events_path(session_id).parent
            if (session_dir / "recording.webm").is_file():
                from conxa_compile.recorder.frame_extractor import extract_frames_for_session

                def _on_frame_progress(done: int, total: int) -> None:
                    _log(f"Extracted frames for event {done}/{total}.")

                try:
                    _, frame_failures = extract_frames_for_session(
                        session_dir, on_progress=_on_frame_progress
                    )
                except Exception as exc:  # noqa: BLE001
                    # Session-wide extraction problem (missing ffmpeg, corrupt video, etc.) —
                    # compile continues with DOM-only anchors rather than blocking.
                    _log(f"Warning: frame_extraction_error: {exc!s}", level="warn")
                else:
                    for idx, message in frame_failures:
                        _log(f"Warning: frame_extraction_error: event {idx + 1}: {message}", level="warn")

            raw = read_session_events(session_id)
        except Exception:
            if reservation_id and not reservation_committed:
                self._release_compile_credit(reservation_id)
            raise
        if not raw:
            if reservation_id and not reservation_committed:
                self._release_compile_credit(reservation_id)
            raise _CommandError("no_events", "No recorded events for this session.")

        if reservation_id:
            _log("Committing compile credit before LLM-assisted compiler work...")
            try:
                commit = self._commit_compile_credit(reservation_id)
                reservation_committed = True
                sink({"phase": "quota", "meter": "compile_credits", "status": "committed", **commit})
            except Exception:
                self._release_compile_credit(reservation_id)
                raise

        self._install_proxy_router(sink=sink, usage_class=usage_class)
        _log(f"Running normalization pipeline on {len(raw)} events…")
        try:
            normalized = run_pipeline(raw)
        except (CloudUnreachable, EntitlementBlocked, QuotaExceeded) as exc:
            _log(str(exc), level="error")
            sink({"phase": "compile_error", "message": str(exc), "failed_step": "normalize"})
            if isinstance(exc, EntitlementBlocked):
                raise _CommandError(exc.code, self._entitlement_error_message(exc.code)) from exc
            if isinstance(exc, QuotaExceeded):
                raise _CommandError("quota_exceeded", str(exc)) from exc
            raise _CommandError("cloud_unreachable", str(exc)) from exc
        except Exception as exc:
            _log(str(exc), level="error")
            sink({"phase": "compile_error", "message": str(exc), "failed_step": "normalize"})
            raise

        _log(f"Pipeline produced {len(normalized)} normalized events")
        sink({"phase": "pipeline_done", "event_count": len(normalized)})
        for step in ("normalize", "dedupe", "enrich"):
            sink({"phase": "compile_step", "step": step, "status": "done"})
        sink({"phase": "compile_step", "step": "selectors", "status": "running"})

        skill_id = f"skill_{session_id}"
        existing = read_skill(skill_id)
        version = int((existing.get("meta") or {}).get("version") or 0) + 1 if existing else 1

        _log("Starting compiler — generating selectors, assertions, recovery blocks…")
        sink({"phase": "compiler_start"})
        try:
            with job_event_scope(rid):
                package = compile_skill_package(
                    normalized,
                    skill_id=skill_id,
                    source_session_id=session_id,
                    title=title,
                    version=version,
                )
        except (CloudUnreachable, EntitlementBlocked, QuotaExceeded) as exc:
            _log(str(exc), level="error")
            sink({"phase": "compile_error", "message": str(exc), "failed_step": "selectors"})
            if isinstance(exc, EntitlementBlocked):
                raise _CommandError(exc.code, self._entitlement_error_message(exc.code)) from exc
            if isinstance(exc, QuotaExceeded):
                raise _CommandError("quota_exceeded", str(exc)) from exc
            raise _CommandError("cloud_unreachable", str(exc)) from exc
        except Exception as exc:
            _log(str(exc), level="error")
            sink({"phase": "compile_error", "message": str(exc), "failed_step": "selectors"})
            raise

        write_skill(skill_id, package.model_dump(mode="json"))
        step_count = len(package.skills[0].steps)
        sink({"phase": "compiler_done", "step_count": step_count})
        for step in ("selectors", "assertions", "recovery", "package"):
            sink({"phase": "compile_step", "step": step, "status": "done"})
            _log(f"Completed: {step}")
        compile_report = package.compile_report or {}
        if plugin is not None and workflow is not None:
            workflow.skill_id = skill_id
            workflow.status = "compiled"
            workflow.compile_status = compile_report.get("status")
            workflow.compile_min_confidence = compile_report.get("min_confidence")
            workflow.compile_steps_with_warnings = compile_report.get("steps_with_warnings")
            save_plugin(plugin)
        _log(f"Skill packaged: {skill_id} (version {version}, {step_count} steps)")
        sink({"phase": "compile_done", "skill_id": skill_id, "version": version, "step_count": step_count})
        return {
            "skill_id": skill_id,
            "version": version,
            "step_count": step_count,
            "compile_status": compile_report.get("status"),
            "compile_min_confidence": compile_report.get("min_confidence"),
            "compile_steps_with_warnings": compile_report.get("steps_with_warnings"),
        }

