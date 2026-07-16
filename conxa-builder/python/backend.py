"""Build Studio Python backend — stdio JSON-RPC dispatcher.

Electron spawns this process and talks to it over stdin/stdout. The protocol is
newline-delimited JSON:

  request  (stdin) : {"id": "<uuid>", "type": "<command>", "payload": {...}}
  result   (stdout): {"id": "<uuid>", "type": "result", "result": {...}}
  error    (stdout): {"id": "<uuid>", "type": "error", "code": "...", "message": "..."}
  event    (stdout): {"type": "event", "id": "<uuid>"|null, ...}   (streaming progress)

The shared ``app/*`` package is used unchanged as a library; compile-time LLM
calls are redirected to the cloud proxy by swapping the router singleton.
Recording runs on a persistent asyncio loop in a background thread because the
Playwright recorder is async and long-lived.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time
import traceback
import re
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse
from typing import Any, Callable

# Make this `python` dir importable (for the local `services` package and the
# bundled `conxa_compile` pipeline), regardless of launch CWD. The shared
# `conxa_core` package is installed as a dependency, not imported by path.
_PY_DIR = os.path.abspath(os.path.dirname(__file__))
if _PY_DIR not in sys.path:
    sys.path.insert(0, _PY_DIR)

from services import bootstrap as _bootstrap_pkg  # noqa: E402

# Point Playwright at the managed Chromium build before the recorder is imported
# or used. In frozen builds the browser lives in ~/.conxa-build-studio/deps/chromium;
# without this, launches on a non-bootstrap startup fail with "Executable doesn't exist".
_bootstrap_pkg.configure_playwright_browsers_path()

# Pre-import the recorder, plugin store, and command handlers at startup (main
# thread, before serve() starts blocking on stdin). Importing these lazily in a
# dispatch thread causes a deadlock: two simultaneous record clicks hit Python's
# per-module import lock while conxa_core.config.Settings() tries to read the
# repo .env from a piped-stdin context. The handlers.* imports below transitively
# import conxa_compile.recorder.session and conxa_core.storage.plugin_store, so
# this ordering also pre-warms those modules.
from handlers.protocol import _CommandError, _write  # noqa: E402
from handlers.session import SessionMixin  # noqa: E402
from handlers.compile import CompileMixin  # noqa: E402
from handlers.plugins import PluginsMixin  # noqa: E402
from handlers.workflow_editor import WorkflowEditorMixin  # noqa: E402
from handlers.visual import VisualMixin  # noqa: E402
from handlers.skill_packages import SkillPackagesMixin  # noqa: E402
from handlers.runs import RunsMixin  # noqa: E402
from conxa_core.progress import set_event_sink  # noqa: E402

# Compile-time sub-step logging (conxa_compile/compiler/build.py's
# _compile_log calls) routes through conxa_core.progress.append_current_job_event,
# which is a no-op unless a sink is registered. Wiring it here — once, at
# module scope — turns those existing per-step logs ("Compiling step N.",
# "Generating vision anchors for step N.", ...) into live compile_log IPC
# events instead of being silently dropped. Stateless and routed purely by
# the job_id argument, so it's safe across the per-request dispatch threads
# spawned below.
def _progress_event_sink(job_id: str, event: str, message: str, data: dict[str, Any] | None) -> None:
    _write({
        "type": "event",
        "id": job_id,
        "phase": "compile_log",
        "message": message,
        "level": (data or {}).get("level", "info"),
        "ts": time.time(),
    })


set_event_sink(_progress_event_sink)

# --- background asyncio loop for the recorder --------------------------------

class _Loop:
    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result()


# --- the backend -------------------------------------------------------------

class Backend(
    SessionMixin,
    CompileMixin,
    PluginsMixin,
    WorkflowEditorMixin,
    VisualMixin,
    SkillPackagesMixin,
    RunsMixin,
):
    """JSON-RPC dispatcher. Command handlers (cmd_*) live in the handlers/
    package, grouped by domain and mixed in here; this class owns shared
    instance state (undo/redo stacks, auth, cloud API helpers) and dispatch."""

    _MAX_UNDO = 50

    def __init__(self) -> None:
        self._loop = _Loop()
        self._active_recording: str | None = None
        self._rec_lock = threading.Lock()
        self._auth = None  # AuthService, lazily built once configured
        self._cloud_api = os.environ.get("CONXA_CLOUD_API", "http://127.0.0.1:8000")
        self._undo_stacks: dict[str, list] = {}
        self._redo_stacks: dict[str, list] = {}
        self._installer_generation_cache: str | None = None

    # -- undo / redo helpers -------------------------------------------------

    def _push_undo(self, skill_id: str, snapshot: dict[str, Any]) -> None:
        """Push a pre-mutation snapshot and clear redo. Caller must pass a safe copy."""
        stack = self._undo_stacks.setdefault(skill_id, [])
        stack.append(snapshot)
        if len(stack) > self._MAX_UNDO:
            stack.pop(0)
        self._redo_stacks[skill_id] = []

    def _history_flags(self, skill_id: str) -> dict[str, bool]:
        return {
            "can_undo": len(self._undo_stacks.get(skill_id, [])) > 0,
            "can_redo": len(self._redo_stacks.get(skill_id, [])) > 0,
        }

    # -- lazy auth wiring ----------------------------------------------------

    def _auth_service(self):
        if self._auth is None:
            from services.auth_service import AuthService

            self._auth = AuthService(
                clerk_domain=os.environ.get("CONXA_CLERK_DOMAIN", ""),
                client_id=os.environ.get("CONXA_CLERK_CLIENT_ID", ""),
                client_secret=os.environ.get("CONXA_CLERK_CLIENT_SECRET", ""),
                cloud_api=self._cloud_api,
            )
        return self._auth

    def _install_proxy_router(
        self,
        sink: Callable[[dict[str, Any]], None] | None = None,
        *,
        usage_class: str = "compile",
    ) -> None:
        """Redirect every compiler LLM call to the metered cloud proxy."""
        from services.llm_proxy_client import LLMProxyClient
        from conxa_core import llm as core_llm

        def _on_api_call(info: dict[str, Any]) -> None:
            if sink is not None:
                sink({"phase": "api_call", **info})

        client = LLMProxyClient(
            self._cloud_api,
            token_provider=lambda: self._auth_service().get_token(),
            client_header=os.environ.get("CONXA_PROXY_CLIENT", "build-studio"),
            usage_class=usage_class,
            on_api_call=_on_api_call,
        )
        core_llm.set_router(client)

    def _cloud_api_base(self) -> str:
        return (self._cloud_api or "https://apis.conxa.in").rstrip("/")

    def _auto_publish_enabled(self) -> bool:
        if os.environ.get("CONXA_DISABLE_AUTO_PUBLISH") == "1":
            return False
        parsed = urlparse(self._cloud_api_base())
        return parsed.hostname not in {"127.0.0.1", "localhost", ""}

    def _installer_generation(self) -> str:
        """The Conxa-owned installer platform generation ("v1"/"v2"/...) that
        Build Studio should stamp into new skill-pack publishes and installer
        builds. Cached for the process lifetime. Never blocks the build —
        falls back to "v2" if the cloud is unreachable."""
        if self._installer_generation_cache is not None:
            return self._installer_generation_cache
        try:
            payload = self._cloud_json("/api/v1/plugins/generations")
            generation = str(payload.get("current") or "").strip() or "v2"
        except Exception:
            generation = "v2"
        self._installer_generation_cache = generation
        return generation

    def _cloud_token(self) -> str:
        try:
            token = self._auth_service().get_token()
        except Exception as exc:
            raise _CommandError(
                "cloud_auth_required",
                "Sign in to Conxa Build Studio before building a cloud-connected installer.",
            ) from exc
        if not token:
            raise _CommandError(
                "cloud_auth_required",
                "Sign in to Conxa Build Studio before building a cloud-connected installer.",
            )
        return token

    def _cloud_json(self, path: str, *, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
        import urllib.request

        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(f"{self._cloud_api_base()}{path}", data=data, method=method)
        if body is not None:
            req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {self._cloud_token()}")
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                error_payload = json.loads(exc.read().decode("utf-8"))
                detail = str(error_payload.get("detail") or "")
            except Exception:
                detail = ""
            if detail:
                raise _CommandError(detail, self._entitlement_error_message(detail)) from exc
            raise _CommandError("entitlements_unavailable", f"Cloud entitlement check failed: HTTP {exc.code}") from exc
        except Exception as exc:
            raise _CommandError("entitlements_unavailable", f"Cloud entitlement service unavailable: {exc}") from exc
        return payload if isinstance(payload, dict) else {}

    def _entitlement_error_message(self, code: str) -> str:
        messages = {
            "compile_credit_limit_exceeded": "Monthly compile credits are exhausted for this workspace.",
            "human_edit_pool_exceeded": "Monthly Human Edit pool is exhausted for this workspace.",
            "installer_limit_exceeded": "Installer slot limit reached for this workspace.",
            "seat_limit_exceeded": "Seat limit reached for this workspace.",
            "entitlements_unavailable": "Cloud entitlements are unavailable, so quota-gated actions are blocked.",
            "invalid_usage_class": "Invalid LLM usage class.",
        }
        return messages.get(code, code)

    def _compile_reservation_id(self, rid: str, plugin_id: str, workflow_id: str, session_id: str) -> str:
        raw = f"cmp_{rid}_{plugin_id}_{workflow_id}_{session_id}"
        return re.sub(r"[^A-Za-z0-9_.:-]+", "_", raw)[:240]

    def _reserve_compile_credit(
        self,
        *,
        reservation_id: str,
        plugin_id: str,
        workflow_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        return self._cloud_json(
            "/api/v1/usage/compile/reserve",
            method="POST",
            body={
                "reservation_id": reservation_id,
                "plugin_id": plugin_id,
                "workflow_id": workflow_id,
                "session_id": session_id,
            },
        )

    def _commit_compile_credit(self, reservation_id: str) -> dict[str, Any]:
        return self._cloud_json(
            "/api/v1/usage/compile/commit",
            method="POST",
            body={"reservation_id": reservation_id},
        )

    def _release_compile_credit(self, reservation_id: str) -> None:
        try:
            self._cloud_json(
                "/api/v1/usage/compile/release",
                method="POST",
                body={"reservation_id": reservation_id},
            )
        except Exception:
            pass

    def _publish_skill_pack(
        self,
        *,
        company_slug: str,
        plugin: Any,
        version: str,
        release_notes: str,
        sink: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        """Publish the built skill pack and rewrite local pack.json with cloud tracking.

        Mandatory operation: any real-cloud failure raises _CommandError (see
        cmd_publish_skill_pack). Only a local dev cloud that's simply unreachable
        is swallowed — see _auto_publish_enabled.
        """
        from conxa_core.config import settings as _settings
        import base64
        import urllib.request

        data_dir = Path(_settings.data_dir)
        packs_dir = data_dir / "skill-packs" / company_slug
        pack_path = packs_dir / "pack.json"
        if not pack_path.is_file():
            raise _CommandError("pack_not_built", f"No built skill pack for {company_slug}")

        pack = json.loads(pack_path.read_text(encoding="utf-8"))
        pack["skill_pack_version"] = version
        pack["release_notes"] = release_notes
        pack_path.write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")

        files: list[dict[str, str]] = []
        for fpath in sorted(packs_dir.rglob("*")):
            if fpath.is_file():
                files.append(
                    {
                        "path": fpath.relative_to(packs_dir).as_posix(),
                        "content_base64": base64.b64encode(fpath.read_bytes()).decode("ascii"),
                    }
                )

        cloud_api = self._cloud_api_base()
        generation = self._installer_generation()
        body = json.dumps(
            {
                "slug": company_slug,
                "display_name": str(getattr(plugin, "name", "") or company_slug),
                "target_url": str(getattr(plugin, "target_url", "") or pack.get("target_url") or ""),
                "protected_url": str(getattr(plugin, "protected_url", "") or pack.get("protected_url") or ""),
                "skill_pack_version": version,
                "release_notes": release_notes,
                "skills": list(pack.get("skills") or []),
                "files": files,
            }
        ).encode("utf-8")
        sink({"kind": "skill_pack_publish", "message": f"Publishing {company_slug} skill pack to Conxa Cloud..."})
        try:
            req = urllib.request.Request(
                f"{cloud_api}/api/v1/plugins/{generation}/{quote(company_slug)}/skill-packs/upload",
                data=body,
                method="POST",
            )
            req.add_header("Content-Type", "application/json")
            # _cloud_token() also belongs inside this try: not being signed in is just as
            # much a reason a local dev cloud attempt can't proceed as it being unreachable.
            req.add_header("Authorization", f"Bearer {self._cloud_token()}")
            with urllib.request.urlopen(req, timeout=120) as resp:
                published = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # The cloud responded — it's reachable but rejected the request (bad auth,
            # bad payload, duplicate version, etc). Always a real failure, local cloud or not.
            try:
                body_text = exc.read().decode("utf-8", errors="replace")
            except Exception:
                body_text = ""
            if exc.code == 409:
                raise _CommandError(
                    "skill_pack_version_exists",
                    f"Skill pack version {version} already exists in Conxa Cloud. Bump the version and republish.",
                ) from exc
            raise _CommandError("cloud_publish_failed", f"Cloud publish failed: {exc} — {body_text}") from exc
        except Exception as exc:
            # Nothing responded at all (connection refused, DNS failure, timeout, or not
            # signed in). For a local API base this just means there's no usable dev cloud
            # to publish to right now — skip publishing gracefully rather than blocking the
            # build. A real, non-local cloud failing is still fatal — skill-pack publish is
            # mandatory once a real cloud is configured (see cmd_publish_skill_pack).
            if not self._auto_publish_enabled():
                sink({
                    "kind": "skill_pack_publish",
                    "message": f"Cloud publish skipped — {cloud_api} is not reachable ({exc})",
                })
                return {}
            raise _CommandError("cloud_publish_failed", f"Cloud publish failed: {exc}") from exc

        tracking = dict(published.get("tracking") or {})
        if not tracking.get("tracking_token"):
            raise _CommandError("cloud_publish_failed", "Cloud publish did not return a tracking token.")

        sync_token = str(published.get("sync_token") or "")
        if not sync_token:
            raise _CommandError(
                "cloud_publish_failed",
                "Cloud publish did not return a sync_token. "
                "The installer cannot be built — the runtime needs this token to pull skill-pack updates. "
                "Ensure the cloud backend is up-to-date.",
            )

        # sync_url/tracking_url are already correctly versioned by the cloud (see
        # publish_routes._publish_skill_pack_impl) — just qualify the relative sync_url.
        sync_url = str(published.get("sync_url") or f"/api/v1/plugins/{generation}/{company_slug}/skill-packs/delta")
        pack["tracking"] = tracking
        pack["sync_endpoint"] = f"{cloud_api}{sync_url}"
        pack["sync_token"] = sync_token
        pack["installer_version"] = generation
        pack["published"] = {
            "cloud_api": cloud_api,
            "workspace_id": str(published.get("workspace_id") or ""),
            "published_at": published.get("published_at"),
        }
        pack_path.write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
        workspace_id = str(published.get("workspace_id") or "")
        sink(
            {
                "kind": "skill_pack_publish",
                "message": (
                    "Cloud tokens embedded in pack.json "
                    f"(workspace {workspace_id or 'unknown'}, sync_token present, "
                    f"tracking_token present, url {tracking.get('tracking_url', '')})"
                ),
            }
        )
        return {
            "slug": company_slug,
            "version": version,
            "cloud_api": cloud_api,
            "workspace_id": workspace_id,
            "tracking_url": tracking.get("tracking_url", ""),
            "tracking_token_present": True,
            "sync_token_present": True,
            "sync_endpoint": pack["sync_endpoint"],
            "published_at": published.get("published_at"),
        }

    def _upload_installer_for_download(
        self,
        *,
        company_slug: str,
        result: dict[str, Any],
        release_notes: str,
        sink: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        import urllib.request

        if not self._auto_publish_enabled():
            return result

        installer_path = Path(str(result.get("installer_path") or ""))
        if not installer_path.is_file():
            raise _CommandError("installer_upload_failed", f"Installer not found: {installer_path}")

        cloud_api = self._cloud_api_base()
        generation = self._installer_generation()
        params = urlencode(
            {
                "filename": str(result.get("filename") or installer_path.name),
                "version": str(result.get("version") or "0.0.0"),
                "release_notes": release_notes,
            }
        )
        url = f"{cloud_api}/api/v1/plugins/{generation}/{quote(company_slug)}/installer/upload?{params}"
        req = urllib.request.Request(url, data=installer_path.read_bytes(), method="POST")
        req.add_header("Content-Type", "application/octet-stream")
        req.add_header("Authorization", f"Bearer {self._cloud_token()}")
        sink({"kind": "installer_build", "message": "Uploading installer to Conxa Cloud..."})
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                uploaded = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                error_payload = json.loads(exc.read().decode("utf-8"))
                detail = str(error_payload.get("detail") or "")
            except Exception:
                detail = ""
            if detail in {"installer_limit_exceeded", "entitlements_unavailable"}:
                raise _CommandError(detail, self._entitlement_error_message(detail)) from exc
            if exc.code == 409:
                raise _CommandError(
                    "installer_version_exists",
                    f"Installer version {result.get('version') or ''} already exists in Conxa Cloud.",
                ) from exc
            if exc.code == 413:
                result = dict(result)
                result["cloud_upload_error"] = "installer_upload_too_large"
                sink(
                    {
                        "kind": "installer_build",
                        "message": "Installer upload skipped: cloud rejected the file as too large. The local installer still contains cloud tracking.",
                        "warning": True,
                    }
                )
                return result
            raise _CommandError("installer_upload_failed", f"Installer upload failed: {exc}") from exc
        except Exception as exc:
            raise _CommandError("installer_upload_failed", f"Installer upload failed: {exc}") from exc
        result = dict(result)
        result["cloud_download_url"] = f"{cloud_api}{uploaded.get('download_url', '')}"
        if uploaded.get("version_download_url"):
            result["cloud_version_download_url"] = f"{cloud_api}{uploaded.get('version_download_url', '')}"
        result["cloud_sha256"] = uploaded.get("sha256", "")
        sink({"kind": "installer_build", "message": "Installer uploaded to Conxa Cloud"})
        return result

    # -- dispatch ------------------------------------------------------------

    def dispatch(self, msg: dict[str, Any]) -> None:
        rid = msg.get("id")
        cmd = str(msg.get("type") or "")
        payload = msg.get("payload") or {}
        handler = getattr(self, f"cmd_{cmd}", None)
        if handler is None:
            _write({"id": rid, "type": "error", "code": "unknown_command", "message": cmd})
            return
        try:
            result = handler(payload, rid)
            _write({"id": rid, "type": "result", "result": result})
        except _CommandError as exc:
            _write({"id": rid, "type": "error", "code": exc.code, "message": exc.message})
        except Exception as exc:  # noqa: BLE001 — report any handler failure to the renderer
            _write({
                "id": rid,
                "type": "error",
                "code": "internal_error",
                "message": str(exc),
                "trace": traceback.format_exc()[-2000:],
            })

    def serve(self) -> None:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                _write({"type": "error", "code": "bad_json", "message": line[:200]})
                continue
            # Each request is handled on its own thread so a long build does not
            # block recording stop/cancel commands.
            threading.Thread(target=self.dispatch, args=(msg,), daemon=True).start()


if __name__ == "__main__":
    Backend().serve()
