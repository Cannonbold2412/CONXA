"""Workflow Group command handlers.

A WorkflowGroup is a business-domain folder ("Sales") that owns both a set of
workflows and the authenticated applications those workflows need — auth is
captured once per app, at the group level, and shared by every workflow in
the group. See conxa_core.models.workflow.WorkflowGroup and
conxa_core.storage.group_store.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from conxa_compile.recorder.session import registry as _recorder_registry
from conxa_core.storage.group_store import DEFAULT_GROUP_NAME
from conxa_core.workspace import LOCAL_WORKSPACE_ID, workspace_dir_slug
from handlers.protocol import _CommandError, _safe_id

# How many workflow names a group summary carries, so a group card can show
# what's inside it. Three plus a "+N more" line is what fits a folder card
# without clipping; the full list lives on the group page.
WORKFLOW_PREVIEW_LIMIT = 3

# How long a probe verdict (checked_at) is trusted before an app reads as
# "unverified" again. Matches handlers/session.py's recording-gate TTL — the
# two exist for different reasons (this one drives the badge, that one bounds
# probe cost) but there's no reason for them to disagree on what "recently
# checked" means.
_VERIFIED_TTL_S = 600


def _has_captured_session(auth_path: Path) -> bool:
    """Cheap validity check for a just-finished auth recording: does the saved
    storage state actually contain a session, not just an empty shell? Distinct
    from cmd_check_group_app_auth's live probe — this only guards against the
    "closed the login window before signing in" case, where Playwright still
    writes a storage-state file but it has no cookies or localStorage."""
    if not auth_path.is_file():
        return False
    try:
        import json as _json

        data = _json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if not isinstance(data, dict):
        return False
    if data.get("cookies"):
        return True
    for origin in data.get("origins") or []:
        if isinstance(origin, dict) and origin.get("localStorage"):
            return True
    return False


def group_auth_status(group) -> dict[str, Any]:
    """Per-app readiness for a group, plus the id of the first app still
    needing attention (used by both the setup wizard and the run gate).

    "state" (missing/expired/ready) is trusted from captured_at/last_error
    alone — cheap, used on every page load; it is NOT itself a live probe
    (that used to launch a headless browser on every group-page open and
    could wedge the whole backend — see FIX.md). "verified" is the honest
    signal: true only when checked_at is set and within _VERIFIED_TTL_S,
    i.e. an actual headless probe confirmed the session recently — via the
    recording gate (handlers/session.py) or the user-initiated "Check now"
    action (cmd_check_group_app_auth below). A "ready" app with verified
    false has a session on disk that has simply never been (recently)
    tested — the UI should read that differently from a freshly-confirmed one."""
    now = time.time()
    apps = []
    first_missing = None
    for app in group.apps:
        if not app.captured_at:
            state = "missing"
        elif app.last_error:
            state = "expired"
        else:
            state = "ready"
        verified = bool(app.checked_at) and (now - app.checked_at) <= _VERIFIED_TTL_S
        apps.append({
            "id": app.id,
            "name": app.name,
            "login_url": app.login_url,
            "success_url": app.success_url,
            "state": state,
            "captured_at": app.captured_at,
            "checked_at": app.checked_at,
            "verified": verified,
            "last_error": app.last_error,
        })
        if state != "ready" and first_missing is None:
            first_missing = app.id
    return {
        "group_id": group.id,
        "apps": apps,
        "apps_total": len(group.apps),
        "apps_authenticated": sum(1 for a in apps if a["state"] == "ready"),
        "ready": first_missing is None,
        "first_missing_app_id": first_missing,
    }


class GroupsMixin:
    def _sync_group_to_cloud(self, group, workspace_id: str = "") -> bool:
        """Best-effort upsert of this group onto Cloud's Skill Packages index.
        Returns True if Cloud accepted the write. Local CRUD must never fail
        because Cloud is down or the user is signed out."""
        from urllib.parse import quote

        from conxa_core.storage.skill_pack_store import get_skill_pack

        ws = workspace_id or getattr(group, "workspace_id", "") or LOCAL_WORKSPACE_ID
        slug = workspace_dir_slug(ws)
        display_name = ""

        pack = get_skill_pack(ws)
        if pack is not None:
            display_name = pack.display_name

        if not display_name:
            display_name = "Local workspace"

        try:
            generation = self._installer_generation()
            self._cloud_json(
                f"/api/v1/workflows/{generation}/{quote(slug)}/groups/{quote(group.id)}",
                method="PUT",
                body={
                    "group_name": group.name,
                    "display_name": display_name,
                },
            )
        except Exception:
            return False
        return True

    def cmd_list_groups(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import list_groups
        from conxa_core.storage.workflow_store import list_workflows
        from handlers.status import derive_workflow_stage

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        groups = list_groups(workspace_id)
        for g in groups:
            if g.name == DEFAULT_GROUP_NAME:
                continue
            if not self._sync_group_to_cloud(g, workspace_id):
                break
        workflows = list_workflows(workspace_id)
        counts: dict[str, int] = {}
        # Per-group lifecycle breakdown and a short preview of the workflows inside,
        # so a group card can show its contents without a second round-trip.
        # Free — these workflows are already loaded.
        stages: dict[str, dict[str, int]] = {}
        previews: dict[str, list[dict[str, str]]] = {}
        for wf in workflows:
            counts[wf.group_id] = counts.get(wf.group_id, 0) + 1
            bucket = stages.setdefault(wf.group_id, {})
            stage = derive_workflow_stage(wf)
            bucket[stage] = bucket.get(stage, 0) + 1
            preview = previews.setdefault(wf.group_id, [])
            if len(preview) < WORKFLOW_PREVIEW_LIMIT:
                preview.append({"id": wf.id, "name": wf.name, "stage": stage})

        result = []
        for g in groups:
            # The Default group exists only as a landing spot for workflows with no
            # group of their own (migrations, reassignment on delete). Empty, it is
            # noise — hide it rather than making every workspace start with a folder
            # nobody asked for.
            if g.name == DEFAULT_GROUP_NAME and not counts.get(g.id):
                continue
            status = group_auth_status(g)
            result.append({
                "id": g.id,
                "slug": g.slug,
                "name": g.name,
                "workflow_count": counts.get(g.id, 0),
                "stages": stages.get(g.id, {}),
                "workflow_preview": previews.get(g.id, []),
                "apps_total": status["apps_total"],
                "apps_authenticated": status["apps_authenticated"],
                "ready": status["ready"],
                "created_at": g.created_at,
                "updated_at": g.updated_at,
            })
        return {"groups": result}

    def cmd_get_group(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import get_group
        from conxa_core.storage.workflow_store import list_workflows
        from handlers.status import derive_workflow_stage

        group_id = _safe_id(payload.get("group_id"), "group_id")
        group = get_group(group_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        workflows = []
        for wf in list_workflows():
            if wf.group_id != group_id:
                continue
            data = wf.model_dump(mode="json")
            data["stage"] = derive_workflow_stage(wf)
            # Which of the group's apps this workflow actually touches — same
            # matcher (and same inputs: start URLs + recorded hosts) as build-time
            # required_apps, so the card's platform chips can never disagree with
            # runtime auth gating. visited_hosts is captured at stop_recording, so
            # chips appear before the first compile.
            from conxa_core.storage.group_store import apps_for_workflow

            touched = apps_for_workflow(group.apps, wf.target_url, wf.protected_url, *wf.visited_hosts)
            data["used_apps"] = [{"id": a.id, "name": a.name} for a in touched]
            workflows.append(data)
        return {"group": group.model_dump(mode="json"), "auth": group_auth_status(group), "workflows": workflows}

    def cmd_create_group(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import create_group

        name = str(payload.get("name") or "").strip()
        if not name:
            raise _CommandError("invalid_input", "name is required")
        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        group = create_group(name, workspace_id=workspace_id)
        self._sync_group_to_cloud(group, workspace_id)
        return {"group": group.model_dump(mode="json")}

    def cmd_rename_group(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import get_group, save_group

        group_id = _safe_id(payload.get("group_id"), "group_id")
        name = str(payload.get("name") or "").strip()
        if not name:
            raise _CommandError("invalid_input", "name is required")
        group = get_group(group_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        group.name = name
        group = save_group(group)
        self._sync_group_to_cloud(group, group.workspace_id)
        return {"group": group.model_dump(mode="json")}

    def cmd_delete_group(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Delete a group, reassigning its workflows to Default rather than
        deleting them — a group is an organizing folder, not the workflow's
        owner in the destructive sense."""
        from conxa_core.storage.group_store import delete_group, ensure_default_group, get_group
        from conxa_core.storage.workflow_store import list_workflows, save_workflow

        group_id = _safe_id(payload.get("group_id"), "group_id")
        group = get_group(group_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        if group.name == "Default":
            raise _CommandError("cannot_delete_default", "The Default group cannot be deleted.")

        default_group = ensure_default_group(group.workspace_id)
        for wf in list_workflows(group.workspace_id):
            if wf.group_id == group_id:
                wf.group_id = default_group.id
                wf.status = "needs_auth" if any(not a.captured_at for a in default_group.apps) else "ready"
                save_workflow(wf)

        deleted = delete_group(group_id)
        return {"deleted": deleted, "reassigned_to": default_group.id}

    def cmd_add_group_app(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import add_app

        group_id = _safe_id(payload.get("group_id"), "group_id")
        name = str(payload.get("name") or "").strip()
        login_url = str(payload.get("login_url") or "").strip()
        success_url = str(payload.get("success_url") or "").strip()
        if not name or not login_url:
            raise _CommandError("invalid_input", "name and login_url are required")
        group = add_app(group_id, name, login_url, success_url)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        return {"group": group.model_dump(mode="json")}

    def cmd_update_group_app(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import update_app

        group_id = _safe_id(payload.get("group_id"), "group_id")
        app_id = _safe_id(payload.get("app_id"), "app_id")
        group = update_app(
            group_id,
            app_id,
            name=payload.get("name"),
            login_url=payload.get("login_url"),
            success_url=payload.get("success_url"),
        )
        if group is None:
            raise _CommandError("group_or_app_not_found", "No such group or app")
        return {"group": group.model_dump(mode="json")}

    def cmd_remove_group_app(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import remove_app

        group_id = _safe_id(payload.get("group_id"), "group_id")
        app_id = _safe_id(payload.get("app_id"), "app_id")
        group = remove_app(group_id, app_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        return {"group": group.model_dump(mode="json")}

    def cmd_get_group_auth_status(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.group_store import get_group

        group_id = _safe_id(payload.get("group_id"), "group_id")
        group = get_group(group_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")
        return group_auth_status(group)

    def cmd_start_group_app_auth(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Open a login browser for one app in a group. Mirrors
        cmd_start_recording's auth_mode path (handlers/session.py) but is
        scoped to a group+app instead of a workflow, and passes wait_for_url
        so the recorder can self-detect the login and the renderer can poll
        get_recording_status for reached_wait_url instead of asking the user
        to close the browser manually."""
        from conxa_core.storage.group_store import get_group, group_auth_dir

        with self._rec_lock:
            if self._active_recording is not None:
                stale = _recorder_registry.get(self._active_recording)
                if stale is not None and stale.browser_open:
                    raise _CommandError(
                        "recording_in_progress",
                        "Finish or close the current login window before starting another.",
                    )
                if stale is not None:
                    _recorder_registry.pop(self._active_recording)
                self._active_recording = None

            group_id = _safe_id(payload.get("group_id"), "group_id")
            app_id = _safe_id(payload.get("app_id"), "app_id")
            group = get_group(group_id)
            if group is None:
                raise _CommandError("group_not_found", f"No group {group_id}")
            app = next((a for a in group.apps if a.id == app_id), None)
            if app is None:
                raise _CommandError("app_not_found", f"No app {app_id} in group {group_id}")

            auth_path = group_auth_dir(group_id) / f"{app_id}.json"
            sess = _recorder_registry.create(
                start_url=app.login_url,
                storage_state_autosave_path=str(auth_path),
                wait_for_url=app.success_url,
                auth_mode=True,
            )
            try:
                self._loop.run(sess.start())
            except RuntimeError as exc:
                _recorder_registry.pop(sess.session_id)
                raise _CommandError("recorder_launch_failed", str(exc)) from exc
            self._active_recording = sess.session_id
            return {"session_id": sess.session_id, "group_id": group_id, "app_id": app_id, "login_url": app.login_url}

    def cmd_finish_group_app_auth(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Stop a group-app login session and persist the captured state,
        whether the recorder self-detected success_url or the user closed the
        browser manually. Widens workflow status for every workflow in the
        group once this app (and all its siblings) are authenticated."""
        from conxa_core.storage.group_store import set_group_app_auth, set_group_app_error, group_auth_dir
        from conxa_core.storage.workflow_store import list_workflows, set_workflow_status_from_group_auth

        session_id = _safe_id(payload.get("session_id"), "session_id")
        group_id = _safe_id(payload.get("group_id"), "group_id")
        app_id = _safe_id(payload.get("app_id"), "app_id")

        sess = _recorder_registry.get(session_id)
        if sess is None:
            raise _CommandError("session_not_found", f"No session {session_id}")

        self._loop.run(sess.stop())
        with self._rec_lock:
            if self._active_recording == session_id:
                self._active_recording = None
        _recorder_registry.pop(session_id)

        auth_path = group_auth_dir(group_id) / f"{app_id}.json"
        if not _has_captured_session(auth_path):
            message = "You closed the login window before signing in — nothing was saved."
            set_group_app_error(group_id, app_id, message)
            raise _CommandError("auth_capture_failed", message)

        group = set_group_app_auth(group_id, app_id, str(auth_path))
        if group is None:
            raise _CommandError("group_or_app_not_found", "No such group or app")

        status = group_auth_status(group)
        for wf in list_workflows(group.workspace_id):
            if wf.group_id == group_id:
                set_workflow_status_from_group_auth(wf.id, status["ready"])
        return {"group": group.model_dump(mode="json"), "auth": status}

    def cmd_cancel_group_app_auth(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        session_id = _safe_id(payload.get("session_id"), "session_id")
        sess = _recorder_registry.get(session_id)
        if sess is not None:
            self._loop.run(sess.stop())
            _recorder_registry.pop(session_id)
        with self._rec_lock:
            if self._active_recording == session_id:
                self._active_recording = None
        return {"ok": True}

    def cmd_check_group_app_auth(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """User-initiated bounded probe: is this app's (or every captured app's)
        saved session actually still valid, right now? This is the only place
        besides the recording gate that spends a real headless navigation on a
        session check — group_auth_status's "ready" badge is otherwise cheap
        and can be stale (see its docstring). Pass app_id to check one app;
        omit it to check every captured app in the group concurrently."""
        from concurrent.futures import ThreadPoolExecutor
        from conxa_compile.recorder.session import check_app_session_sync
        from conxa_core.storage.group_store import get_group, set_group_app_checked

        group_id = _safe_id(payload.get("group_id"), "group_id")
        app_id_raw = payload.get("app_id")
        group = get_group(group_id)
        if group is None:
            raise _CommandError("group_not_found", f"No group {group_id}")

        if app_id_raw:
            app_id = _safe_id(app_id_raw, "app_id")
            targets = [a for a in group.apps if a.id == app_id and a.captured_at and a.storage_state_path]
            if not targets:
                raise _CommandError("app_not_found", f"No captured app {app_id} in group {group_id}")
        else:
            targets = [a for a in group.apps if a.captured_at and a.storage_state_path]

        if targets:
            with ThreadPoolExecutor(max_workers=len(targets)) as pool:
                results = list(zip(targets, pool.map(check_app_session_sync, targets)))
            for app, state in results:
                group = set_group_app_checked(group_id, app.id, state)

        return {"group": group.model_dump(mode="json"), "auth": group_auth_status(group)}
