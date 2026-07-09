"""Plugin CRUD, build, installer, and publish command handlers."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from services import bootstrap as _bootstrap_pkg
from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.storage.plugin_store import get_plugin as _get_plugin
from handlers.protocol import (
    _CommandError,
    _event_sink,
    _plugin_company_slug,
    _runtime_result_text,
    _safe_id,
    _stage_runtime_auth,
    _validate_release_notes,
    _validate_release_version,
)
from handlers.status import derive_workflow_stage

class PluginsMixin:
    def cmd_create_plugin(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import create_plugin as _create

        name = str(payload.get("name") or "").strip()
        if not name:
            raise _CommandError("invalid_input", "name is required")
        target_url = str(payload.get("target_url") or "about:blank").strip()
        plugin = _create(name=name, target_url=target_url)
        return {"plugin": plugin.model_dump(mode="json")}

    def cmd_list_plugins(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import list_plugins as _list

        plugins = _list()
        result = []
        for p in plugins:
            data = p.model_dump(mode="json")
            for wf_data, wf in zip(data["workflows"], p.workflows):
                wf_data["stage"] = derive_workflow_stage(wf)
            result.append(data)
        return {"plugins": result}

    def cmd_get_plugin(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import get_plugin
        from conxa_core.storage.json_store import read_skill

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        data = plugin.model_dump(mode="json")
        for wf_data, wf in zip(data["workflows"], plugin.workflows):
            step_count = 0
            if wf.skill_id:
                try:
                    skill = read_skill(wf.skill_id)
                    if skill:
                        step_count = len((skill.get("skills") or [{}])[0].get("steps") or [])
                except Exception:
                    pass
            wf_data["step_count"] = step_count
            wf_data["stage"] = derive_workflow_stage(wf)
        return {"plugin": data}

    def cmd_list_workflows(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import get_plugin

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        workflows = []
        for wf in plugin.workflows:
            wf_data = wf.model_dump(mode="json")
            wf_data["stage"] = derive_workflow_stage(wf)
            workflows.append(wf_data)
        return {
            "plugin_id": plugin_id,
            "workflows": workflows,
        }

    def cmd_build_plugin(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        from conxa_compile.plugin_builder import build_plugin

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        version = str(payload.get("version") or "0.1.0")
        return build_plugin(plugin_id, version=version, realtime_sink=_event_sink(rid))

    def cmd_publish_skill_pack(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Publish a skill-pack release to Conxa Cloud — the primary, mandatory
        release-management action. Skill Pack Publishing owns version history,
        release notes, and publishing limits; Build Installer (below) becomes a
        secondary, advanced action that requires a release to already exist."""
        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = _get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        company_slug = str(payload.get("company_slug") or "").strip()
        if company_slug:
            company_slug = _safe_id(company_slug, "company_slug")
        else:
            company_slug = _plugin_company_slug(plugin)
            if not company_slug:
                raise _CommandError("invalid_plugin", "Built plugin is missing a runtime company slug.")
        version = _validate_release_version(payload.get("version"))
        release_notes = _validate_release_notes(payload.get("release_notes"))

        # Invariant: auth.json must never leave the machine, including via publish.
        from conxa_core.config import settings as _settings
        skill_pack_dir = Path(_settings.data_dir) / "skill-packs" / company_slug
        if skill_pack_dir.exists() and any(skill_pack_dir.rglob("auth.json")):
            raise _CommandError(
                "auth_file_in_build_input",
                "Refusing to publish: auth.json found under the built skill pack.",
            )

        sink = _event_sink(rid)
        publish_info = self._publish_skill_pack(
            company_slug=company_slug,
            plugin=plugin,
            version=version,
            release_notes=release_notes,
            sink=sink,
        )
        if not publish_info:
            raise _CommandError(
                "cloud_publish_failed",
                "Skill pack publish did not complete. Check your Conxa Cloud connection and sign-in.",
            )
        return publish_info

    def cmd_list_skill_pack_versions(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Release history for the Skill Pack Publishing page — version, release
        notes, and publish timestamp per prior release of this company's slug.

        Takes plugin_id (like cmd_publish_skill_pack/cmd_build_installer) rather
        than requiring the caller to already know the runtime company_slug, which
        differs from Plugin.slug (an auto-generated, ID-suffixed value) and isn't
        otherwise available client-side.
        """
        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = _get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        company_slug = str(payload.get("company_slug") or "").strip()
        if company_slug:
            company_slug = _safe_id(company_slug, "company_slug")
        else:
            company_slug = _plugin_company_slug(plugin)
            if not company_slug:
                raise _CommandError("invalid_plugin", "Built plugin is missing a runtime company slug.")
        generation = self._installer_generation()
        return self._cloud_json(f"/api/v1/plugins/{generation}/{quote(company_slug)}/skill-packs/versions")

    def cmd_build_installer(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Package the already-published skill pack into a distributable NSIS
        installer. Advanced/secondary action — routine skill-pack updates never
        need this; see cmd_publish_skill_pack. Installer upload to the cloud is
        optional: a failure there is reported as a warning, not a build failure."""
        from pathlib import Path
        from services.installer_builder import build_installer

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = _get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        company_slug = str(payload.get("company_slug") or "").strip()
        if company_slug:
            company_slug = _safe_id(company_slug, "company_slug")
        else:
            company_slug = _plugin_company_slug(plugin)
            if not company_slug:
                raise _CommandError("invalid_plugin", "Built plugin is missing a runtime company slug.")
        version = _validate_release_version(payload.get("version"))
        release_notes = _validate_release_notes(payload.get("release_notes"))

        # Invariant: auth.json must never enter the installer input. Captured
        # auth lives under the plugin state dir, but the installer stages only
        # the built skill pack.
        from conxa_core.config import settings as _settings
        skill_pack_dir = Path(_settings.data_dir) / "skill-packs" / company_slug
        if skill_pack_dir.exists() and any(skill_pack_dir.rglob("auth.json")):
            raise _CommandError(
                "auth_file_in_build_input",
                "Refusing to build: auth.json found under the built skill pack.",
            )

        pack_path = skill_pack_dir / "pack.json"
        published = pack_path.is_file() and bool(json.loads(pack_path.read_text(encoding="utf-8")).get("sync_token"))
        if not published:
            raise _CommandError(
                "skill_pack_not_published",
                "Publish a skill pack release before building an installer.",
            )

        logo_path = str(payload.get("logo_path") or "").strip() or None
        sink = _event_sink(rid)
        result = build_installer(
            plugin_id,
            company_slug=company_slug,
            logo_path=logo_path,
            version=version,
            release_notes=release_notes,
            realtime_sink=sink,
        )
        result["installed_runtime_path"] = (
            r"C:\Program Files\Conxa\runtime\conxa-runtime.exe"
            if sys.platform == "win32"
            else str(Path.home() / ".conxa" / "runtime" / "runtime")
        )
        sink(
            {
                "kind": "installer_build",
                "message": (
                    f"Post-install check: restart Claude, confirm Conxa MCP tools are available, "
                    f"run list_skills, then execute a skill. Runtime path: {result['installed_runtime_path']}"
                ),
            }
        )
        try:
            result = self._upload_installer_for_download(
                company_slug=company_slug,
                result=result,
                release_notes=release_notes,
                sink=sink,
            )
        except _CommandError as exc:
            # Installer upload is optional (requirement: Conxa will host/build installers
            # centrally). A failed or skipped upload never fails the build — the local
            # installer and the already-published skill pack are unaffected either way.
            result = dict(result)
            result["cloud_upload_error"] = exc.code
            result["cloud_upload_error_message"] = exc.message
            sink({
                "kind": "installer_build",
                "message": f"Installer upload skipped: {exc.message}",
                "warning": True,
            })
        return result

    def cmd_test_workflow(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Run a built workflow end-to-end against the local Conxa runtime.

        Validates the workflow is built and compiled, stages the built skill pack
        and captured auth session into a local test runtime, then calls the
        shared MCP runtime's ``execute_skill`` tool over stdio.
        """
        from conxa_compile.conxa_runtime import (
            RuntimeToolError,
            _bootstrap_app_dir,
            ensure_chromium_installed,
            ensure_test_sandbox,
            resolve_runtime_dir,
            sync_skill_pack,
        )
        from conxa_compile.runtime_tool import call_runtime_tool
        from conxa_core.config import settings as _settings
        from conxa_core.storage.plugin_store import (
            get_plugin,
            set_workflow_test_error,
            set_workflow_test_result,
        )

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        inputs = payload.get("inputs") if isinstance(payload.get("inputs"), dict) else {}

        plugin = get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        workflow = next((wf for wf in plugin.workflows if wf.id == workflow_id), None)
        if workflow is None:
            raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
        if not workflow.skill_id:
            raise _CommandError("workflow_not_compiled", "Compile this workflow before testing.")
        if plugin.build is None:
            raise _CommandError("plugin_not_built", "Build the plugin before testing its workflows.")

        sink = _event_sink(rid)
        sink({"kind": "workflow_test", "message": f"Preparing test for {workflow.name!r}…"})

        runtime_dir = resolve_runtime_dir()
        if runtime_dir is None:
            raise _CommandError(
                "runtime_not_found",
                "Conxa runtime not found. Run dependency bootstrap so Build Studio downloads the cloud runtime, or set CONXA_DIR explicitly.",
            )

        company = _plugin_company_slug(plugin)
        if not company:
            raise _CommandError("invalid_plugin", "Built plugin is missing a runtime company slug.")

        data_dir = Path(_settings.data_dir)
        source_dir = data_dir / "skill-packs" / company
        if not source_dir.is_dir():
            raise _CommandError(
                "skill_pack_not_built",
                f"Built skill pack not found: skill-packs/{company}. Run Build Plugin again.",
            )

        try:
            # ── Assemble (or refresh) the customer-faithful sandbox ───────────
            # sandbox/.conxa/ mirrors ~/.conxa/ on a real install; sandbox/data/
            # mirrors ~/AppData/Roaming/Conxa. The sandbox is persistent: the exe
            # and conxa-app are only re-staged when a new dep version was downloaded.
            sink({"kind": "workflow_test", "message": "Preparing test sandbox…"})
            app_dir = _bootstrap_app_dir()
            conxa_dir, test_data_dir = ensure_test_sandbox(runtime_dir, app_dir)

            sink({"kind": "workflow_test", "message": "Staging skill pack for the runtime…"})
            sync_skill_pack(company, source_dir, conxa_dir, data_dir=test_data_dir)
            _stage_runtime_auth(plugin, company, test_data_dir)

            # Chromium is junctioned/symlinked into conxa_dir by ensure_test_sandbox.
            # Still call ensure_chromium_installed to download on first use; after that
            # it's a no-op (fast binary check). Always use the shared deps/chromium so
            # both frozen and dev point at the same managed revision.
            browsers_dir = _bootstrap_pkg.chromium_dir()
            ensure_chromium_installed(
                browsers_dir,
                runtime_dir,
                log_sink=lambda msg: sink({"kind": "workflow_test", "message": msg}),
            )

            sink({"kind": "workflow_test", "message": f"Running {workflow.name!r}…"})
            result = call_runtime_tool(
                runtime_dir,
                "execute_skill",
                {
                    "skill": workflow.slug,
                    "company": company,
                    "inputs": inputs,
                    "watch": not bool(payload.get("headless")),
                },
                conxa_dir=conxa_dir,
                env={"CONXA_DATA_DIR": str(test_data_dir)},
            )
        except (RuntimeToolError, RuntimeError) as exc:
            message = str(exc)
            set_workflow_test_error(plugin_id, workflow_id, message)
            raise _CommandError("workflow_test_failed", message) from exc

        message = _runtime_result_text(result)
        if not message.startswith("Done."):
            failure = message or "Runtime test failed without a result message."
            set_workflow_test_error(plugin_id, workflow_id, failure)
            raise _CommandError("workflow_test_failed", failure)

        set_workflow_test_result(plugin_id, workflow_id, status="passed", inputs=inputs)
        sink({"kind": "workflow_test", "message": message})
        return {"status": "passed", "message": message, "company": company, "skill": workflow.slug}

    def cmd_get_usage(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import urllib.request

        try:
            entitlements = self._cloud_json("/api/v1/entitlements/current")
        except _CommandError as exc:
            entitlements = {
                "entitlements_unavailable": True,
                "error": {"code": exc.code, "message": exc.message},
            }

        try:
            req = urllib.request.Request(f"{self._cloud_api}/api/v1/llm/proxy/usage")
            req.add_header("X-Conxa-Client", os.environ.get("CONXA_PROXY_CLIENT", "build-studio"))
            req.add_header("Authorization", f"Bearer {self._auth_service().get_token()}")
            with urllib.request.urlopen(req, timeout=30) as resp:
                legacy = json.loads(resp.read().decode("utf-8"))
        except Exception:
            legacy = {}
        if "meters" in entitlements:
            return {**entitlements, "legacy_llm_usage": legacy}
        return {**entitlements, "legacy_llm_usage": legacy}

    # ─── helpers ────────────────────────────────────────────────────────────

    def cmd_delete_plugin(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import delete_plugin

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        return {"deleted": bool(delete_plugin(plugin_id))}

    def cmd_delete_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import remove_workflow

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        if remove_workflow(plugin_id, workflow_id) is None:
            raise _CommandError("not_found", "Plugin or workflow not found")
        return {"deleted": True}

    def cmd_re_record_auth(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Clear a plugin's captured auth so the user can record a fresh session.

        Drops the stored ``auth.json`` and resets the plugin back to the
        ``needs_auth`` state; the renderer then drives a new auth recording.
        """
        from pathlib import Path
        from conxa_core.config import settings as _settings
        from conxa_core.storage.plugin_store import get_plugin, save_plugin

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        plugin = get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")

        plugin.auth = None
        plugin.status = "needs_auth"
        save_plugin(plugin)

        auth_file = Path(_settings.data_dir) / "plugins" / plugin_id / "auth" / "auth.json"
        if auth_file.is_file():
            auth_file.unlink()
        return {"status": "needs_auth"}

    def cmd_update_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.plugin_store import get_plugin, save_plugin

        plugin_id = _safe_id(payload.get("plugin_id"), "plugin_id")
        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        plugin = get_plugin(plugin_id)
        if plugin is None:
            raise _CommandError("plugin_not_found", f"No plugin {plugin_id}")
        for wf in plugin.workflows:
            if wf.id == workflow_id:
                if "skill_id" in payload:
                    wf.skill_id = payload["skill_id"]
                if "status" in payload:
                    wf.status = payload["status"]
                save_plugin(plugin)
                return {"plugin_id": plugin_id, "workflow_id": workflow_id,
                        "skill_id": wf.skill_id, "status": wf.status}
        raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")

    # ─── recording status ────────────────────────────────────────────────────

    def cmd_get_recording_status(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = _recorder_registry.get(session_id)
        if sess is None:
            raise _CommandError("session_not_found", f"No session {session_id}")
        return sess.status()

    # ─── skill workflow (human edit) ─────────────────────────────────────────

    def cmd_get_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings
        from conxa_core.storage.json_store import read_skill
        from conxa_compile.editor.workflow_dto import build_workflow_response

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        document = read_skill(skill_id)
        if document is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        asset_base_url = f"file://{Path(settings.data_dir) / 'skills' / skill_id / 'assets'}"
        return build_workflow_response(skill_id, document, asset_base_url=asset_base_url).model_dump(mode="json")

