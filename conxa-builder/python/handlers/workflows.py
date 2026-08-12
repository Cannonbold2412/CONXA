"""Workflow CRUD, skill-package build, installer, and publish command handlers."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from services import bootstrap as _bootstrap_pkg
from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.workspace import LOCAL_WORKSPACE_ID
from handlers.protocol import (
    _CommandError,
    _event_sink,
    _runtime_result_text,
    _safe_id,
    _stage_runtime_auth,
    _validate_release_notes,
    _validate_release_version,
)
from handlers.status import derive_workflow_stage


def _redact_sensitive_test_inputs(skill_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Never let a `sensitive`-flagged input's value reach persisted test history.

    The "Sensitive (mask value)" checkbox was written into skill.json/inputs.json at every
    prior stage but read by nothing — this is its runtime consumer (audit H-5). Redacted to
    "" rather than dropped so the field still round-trips as declared (just empty, so it
    doesn't silently re-prefill a secret in the test form on the next run).
    """
    from conxa_core.storage.json_store import read_skill

    doc = read_skill(skill_id) or {}
    declared = doc.get("inputs") if isinstance(doc.get("inputs"), list) else []
    sensitive_ids = {
        str(i.get("id") or i.get("name") or "").strip().lower()
        for i in declared
        if isinstance(i, dict) and i.get("sensitive")
    }
    if not sensitive_ids:
        return inputs
    return {k: ("" if str(k).strip().lower() in sensitive_ids else v) for k, v in inputs.items()}


class WorkflowsMixin:
    def cmd_create_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import ensure_default_group, get_group
        from conxa_core.storage.workflow_store import create_workflow as _create

        name = str(payload.get("name") or "").strip()
        if not name:
            raise _CommandError("invalid_input", "name is required")
        target_url = str(payload.get("target_url") or "about:blank").strip()

        group_id = str(payload.get("group_id") or "").strip()
        if group_id:
            group_id = _safe_id(group_id, "group_id")
            if get_group(group_id) is None:
                raise _CommandError("group_not_found", f"No group {group_id}")
        else:
            group_id = ensure_default_group().id

        workflow = _create(name=name, target_url=target_url, group_id=group_id)
        return {"workflow": workflow.model_dump(mode="json")}

    def cmd_list_workflows(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.workflow_store import list_workflows as _list

        workflows = _list()
        result = []
        for wf in workflows:
            data = wf.model_dump(mode="json")
            data["stage"] = derive_workflow_stage(wf)
            result.append(data)
        return {"workflows": result}

    def cmd_get_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.workflow_store import get_workflow
        from conxa_core.storage.json_store import read_skill

        # The Human Edit page also uses cmd_get_workflow(skill_id=...) for a compiled
        # skill's editor payload — that lookup is disambiguated in handlers/workflow_editor.py.
        # This one is the Workflow-entity lookup used by the Workflow page.
        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        workflow = get_workflow(workflow_id)
        if workflow is None:
            raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
        data = workflow.model_dump(mode="json")
        step_count = 0
        if workflow.skill_id:
            try:
                skill = read_skill(workflow.skill_id)
                if skill:
                    step_count = len((skill.get("skills") or [{}])[0].get("steps") or [])
            except Exception:
                pass
        data["step_count"] = step_count
        data["stage"] = derive_workflow_stage(workflow)
        return {"workflow": data}

    def cmd_get_skill_pack(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Read-only status for the Publish / Build Installer pages: is the
        workspace's shared skill package built yet, and what's in it."""
        from conxa_core.storage.skill_pack_store import get_skill_pack
        from conxa_core.storage.workflow_store import list_workflows

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        pack = get_skill_pack(workspace_id)
        workflows = [
            {"id": wf.id, "name": wf.name, "slug": wf.slug, "skill_id": wf.skill_id,
             "signed_off": wf.signed_off, "last_test_status": wf.last_test_status}
            for wf in list_workflows(workspace_id)
        ]
        return {
            "skill_pack": pack.model_dump(mode="json") if pack is not None else None,
            "workflows": workflows,
        }

    def cmd_build_skill_package(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        from conxa_compile.skill_package_builder import build_skill_package

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        company_name = str(payload.get("company_name") or "").strip() or None
        version = str(payload.get("version") or "0.1.0")
        return build_skill_package(
            workspace_id,
            company_name=company_name,
            version=version,
            realtime_sink=_event_sink(rid),
        )

    def cmd_publish_skill_pack(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Publish a skill-pack release to Conxa Cloud — the primary, mandatory
        release-management action. Skill Pack Publishing owns version history,
        release notes, and publishing limits; Build Installer (below) becomes a
        secondary, advanced action that requires a release to already exist.

        Workspace-scoped: publishes the ONE shared skill pack every workflow in
        this workspace compiles into, not a per-workflow package."""
        from conxa_core.storage.skill_pack_store import get_skill_pack

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        pack = get_skill_pack(workspace_id)
        if pack is None:
            raise _CommandError("skill_pack_not_found", f"No skill pack built yet for workspace {workspace_id}")
        company_slug = str(payload.get("company_slug") or "").strip()
        company_slug = _safe_id(company_slug, "company_slug") if company_slug else pack.company_slug
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
            company_name=pack.company_name,
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
        notes, and publish timestamp per prior release of this company's slug."""
        from conxa_core.storage.skill_pack_store import get_skill_pack

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        company_slug = str(payload.get("company_slug") or "").strip()
        if company_slug:
            company_slug = _safe_id(company_slug, "company_slug")
        else:
            pack = get_skill_pack(workspace_id)
            if pack is None:
                raise _CommandError("skill_pack_not_found", f"No skill pack built yet for workspace {workspace_id}")
            company_slug = pack.company_slug
        generation = self._installer_generation()
        return self._cloud_json(f"/api/v1/workflows/{generation}/{quote(company_slug)}/skill-packs/versions")

    def cmd_build_installer(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Package the already-published skill pack into a distributable NSIS
        installer. Advanced/secondary action — routine skill-pack updates never
        need this; see cmd_publish_skill_pack. Installer upload to the cloud is
        optional: a failure there is reported as a warning, not a build failure."""
        from pathlib import Path
        from services.installer_builder import build_installer
        from conxa_core.storage.skill_pack_store import get_skill_pack

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        pack = get_skill_pack(workspace_id)
        if pack is None:
            raise _CommandError("skill_pack_not_found", f"No skill pack built yet for workspace {workspace_id}")
        company_slug = str(payload.get("company_slug") or "").strip()
        company_slug = _safe_id(company_slug, "company_slug") if company_slug else pack.company_slug
        version = _validate_release_version(payload.get("version"))
        release_notes = _validate_release_notes(payload.get("release_notes"))

        # Invariant: auth.json must never enter the installer input. Captured
        # auth lives under each workflow's own state dir, but the installer stages
        # only the built skill pack.
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
        if logo_path:
            # Custom installer icons are a paid-plan capability (see docs/PRD.md
            # §11) — Build Studio has no local plan awareness, so ask the cloud.
            # Any doubt (call fails, plan missing) defaults to Free, i.e. no icon.
            try:
                plan = str(self._cloud_json("/api/v1/entitlements/current").get("plan") or "free")
            except Exception:
                plan = "free"
            if plan == "free":
                logo_path = None
        sink = _event_sink(rid)
        result = build_installer(
            workspace_id,
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
        """Run a workflow end-to-end against the local Conxa runtime.

        Validates the workflow is compiled, stages the workspace's built skill pack
        and this workflow's captured auth session into a local test runtime, then
        calls the shared MCP runtime's ``execute_skill`` tool over stdio.
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
        from conxa_core.storage.skill_pack_store import get_skill_pack
        from conxa_core.storage.workflow_store import (
            get_workflow,
            set_workflow_test_error,
            set_workflow_test_result,
        )

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        inputs = payload.get("inputs") if isinstance(payload.get("inputs"), dict) else {}

        workflow = get_workflow(workflow_id)
        if workflow is None:
            raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
        if not workflow.skill_id:
            raise _CommandError("workflow_not_compiled", "Compile this workflow before testing.")
        pack = get_skill_pack(workspace_id)
        if pack is None or pack.build is None:
            raise _CommandError("skill_package_not_built", "Build the skill package before testing its workflows.")
        # Backend mirror of the UI's isStaleTest guard (PluginWorkflowTests.tsx) — edited_at is
        # bumped on every skill.json write (json_store.write_skill → invalidate_workflow_test_by_skill),
        # so this catches edits made after the last build regardless of which caller skipped the
        # UI check (a state race, a non-UI caller, etc).
        if workflow.edited_at is not None and workflow.edited_at > pack.build.last_built_at:
            raise _CommandError(
                "workflow_stale",
                "This workflow was edited after the last build. Rebuild the skill package before testing.",
            )

        sink = _event_sink(rid)
        sink({"kind": "workflow_test", "message": f"Preparing test for {workflow.name!r}…"})

        is_frozen = getattr(sys, "frozen", False)

        runtime_dir = resolve_runtime_dir()
        if runtime_dir is None:
            message = (
                "Conxa runtime not found. Run dependency bootstrap so Build Studio downloads it."
                if is_frozen
                else "Local dev runtime not built yet. Run scripts\\build-runtime-local.ps1 first "
                "(writes into deps\\conxa-runtime\\, same place a download would)."
            )
            raise _CommandError("runtime_not_found", message)

        company = pack.company_slug

        data_dir = Path(_settings.data_dir)
        source_dir = data_dir / "skill-packs" / company
        if not source_dir.is_dir():
            raise _CommandError(
                "skill_pack_not_built",
                f"Built skill pack not found: skill-packs/{company}. Run Build Skill Package again.",
            )

        try:
            # ── Assemble (or refresh) the customer-faithful sandbox ───────────
            # sandbox/.conxa/ mirrors ~/.conxa/ on a real install; sandbox/data/
            # mirrors ~/AppData/Roaming/Conxa. The sandbox is persistent: the exe
            # and conxa-app are only re-staged when a new version appears in deps/
            # (a download in Production; scripts/build-runtime-local.ps1 /
            # build-app-local.ps1 writing there directly in Dev).
            sink({"kind": "workflow_test", "message": "Preparing test sandbox…"})
            app_dir = _bootstrap_app_dir()
            conxa_dir, test_data_dir = ensure_test_sandbox(runtime_dir, app_dir)

            if not (conxa_dir / "conxa-app" / "current" / "server.js").is_file():
                message = (
                    "Conxa app layer not found. Run dependency bootstrap so Build Studio downloads it."
                    if is_frozen
                    else "Local dev app layer not built yet. Run scripts\\build-app-local.ps1 first "
                    "(writes into deps\\conxa-app\\, same place a download would)."
                )
                raise _CommandError("runtime_app_not_built", message)

            sink({"kind": "workflow_test", "message": "Staging skill pack for the runtime…"})
            sync_skill_pack(company, source_dir, conxa_dir, data_dir=test_data_dir)
            _stage_runtime_auth(workflow, company, test_data_dir)

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
            set_workflow_test_error(workflow_id, message)
            raise _CommandError("workflow_test_failed", message) from exc

        message = _runtime_result_text(result)
        if not message.startswith("Done."):
            failure = message or "Runtime test failed without a result message."
            set_workflow_test_error(workflow_id, failure)
            raise _CommandError("workflow_test_failed", failure)

        set_workflow_test_result(
            workflow_id, status="passed",
            inputs=_redact_sensitive_test_inputs(workflow.skill_id, inputs),
        )
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

    def cmd_delete_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.workflow_store import delete_workflow

        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        return {"deleted": bool(delete_workflow(workflow_id))}

    def cmd_update_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import get_group
        from conxa_core.storage.workflow_store import get_workflow, save_workflow

        workflow_id = _safe_id(payload.get("workflow_id"), "workflow_id")
        workflow = get_workflow(workflow_id)
        if workflow is None:
            raise _CommandError("workflow_not_found", f"No workflow {workflow_id}")
        if "skill_id" in payload:
            workflow.skill_id = payload["skill_id"]
        if "status" in payload:
            workflow.status = payload["status"]
        if "name" in payload:
            name = str(payload["name"] or "").strip()
            if not name:
                raise _CommandError("invalid_input", "name cannot be empty")
            workflow.name = name  # slug is frozen at creation — it's the runtime skill key
        if "group_id" in payload:
            group_id = _safe_id(payload["group_id"], "group_id")
            group = get_group(group_id)
            if group is None:
                raise _CommandError("group_not_found", f"No group {group_id}")
            workflow.group_id = group_id
            workflow.status = "ready" if all(a.captured_at for a in group.apps) and group.apps else (
                "needs_auth" if group.apps else workflow.status
            )
        save_workflow(workflow)
        return {"workflow_id": workflow_id, "skill_id": workflow.skill_id, "status": workflow.status, "group_id": workflow.group_id, "name": workflow.name}

    # ─── recording status ────────────────────────────────────────────────────

    def cmd_get_recording_status(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = _recorder_registry.get(session_id)
        if sess is None:
            raise _CommandError("session_not_found", f"No session {session_id}")
        return sess.status()

    # ─── skill workflow (human edit) ─────────────────────────────────────────

    def cmd_get_skill_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
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
