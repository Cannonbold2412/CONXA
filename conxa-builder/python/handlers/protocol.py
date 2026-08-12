"""Shared substrate for the JSON-RPC command handlers in handlers/*.py.

Split out of backend.py so each handlers/<domain>.py mixin can import the
protocol error type, event-emission helpers, and small cross-domain
validation helpers without importing backend.py itself (which would be
circular, since backend.py composes Backend from these mixins).
"""

from __future__ import annotations

import json
import re
import sys
import threading
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse


class _CommandError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _safe_id(value: object, field: str) -> str:
    from services.validation import InvalidInput, safe_identifier

    try:
        return safe_identifier(value, field)
    except InvalidInput as exc:
        raise _CommandError("invalid_input", str(exc)) from exc


def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base, preserving unpatched nested keys."""
    result = dict(base)
    for k, v in patch.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


# --- stdout protocol ---------------------------------------------------------

_stdout_lock = threading.Lock()


def _write(obj: dict[str, Any]) -> None:
    with _stdout_lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
        sys.stdout.flush()


def _emit_event(req_id: str | None, **fields: Any) -> None:
    _write({"type": "event", "id": req_id, **fields})


def _event_sink(req_id: str | None) -> Callable[[dict[str, Any]], None]:
    def sink(entry: dict[str, Any]) -> None:
        _emit_event(req_id, **entry)
    return sink


_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def _validate_release_version(value: Any) -> str:
    version = str(value or "").strip()
    if not _SEMVER_RE.fullmatch(version):
        raise _CommandError("invalid_release_version", "Installer version must look like 1.2.3 or 1.2.3-beta.1.")
    return version


def _validate_release_notes(value: Any) -> str:
    notes = str(value or "").strip()
    if not notes:
        raise _CommandError("invalid_release_notes", "Release message is required.")
    if len(notes) > 2000:
        raise _CommandError("invalid_release_notes", "Release message must be 2000 characters or fewer.")
    return notes


def _is_rejected_protected_url(url: str) -> bool:
    value = str(url or "").strip()
    if not value:
        return True
    parsed = urlparse(value)
    if parsed.scheme in {"", "about", "data", "blob", "file"}:
        return True
    haystack = " ".join([parsed.path, parsed.query, parsed.fragment]).lower()
    return any(token in haystack for token in ("login", "signin", "sign-in", "auth", "callback", "oauth"))


def _runtime_result_text(result: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in result.get("content") or []:
        if isinstance(item, dict) and item.get("type") == "text":
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def _stage_runtime_auth(workflow: Any, company: str, data_dir: Path) -> None:
    auth = getattr(workflow, "auth", None)
    storage_state_path = Path(str(getattr(auth, "storage_state_path", "") or ""))
    if not storage_state_path.is_file():
        return

    import shutil
    from datetime import datetime, timezone

    sessions_dir = data_dir / "cache" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(storage_state_path, sessions_dir / f"{company}_raw_state.json")

    protected_url = str(getattr(workflow, "protected_url", "") or getattr(workflow, "target_url", "") or "").strip()
    if protected_url:
        meta_path = sessions_dir / f"{company}_auth_meta.json"
        meta = {}
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
        meta.update(
            {
                "protected_url": protected_url,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")


def _skill_response(
    skill_id: str,
    doc: dict[str, Any],
    revalidation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from pathlib import Path
    from conxa_core.config import settings
    from conxa_compile.editor.workflow_dto import build_workflow_response

    asset_base_url = f"file://{Path(settings.data_dir) / 'skills' / skill_id / 'assets'}"
    workflow = build_workflow_response(skill_id, doc, asset_base_url=asset_base_url)
    return {
        "skill_id": skill_id,
        "meta": dict(doc.get("meta") or {}),
        "revalidation": revalidation or {},
        "workflow": workflow.model_dump(mode="json"),
    }
