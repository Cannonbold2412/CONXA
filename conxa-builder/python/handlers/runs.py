"""Execution-run listing and metrics command handlers."""

from __future__ import annotations

import json
from typing import Any

from handlers.protocol import _CommandError

class RunsMixin:
    def cmd_list_runs(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings

        plugin_id = payload.get("plugin_id")
        since = payload.get("since")
        runs_dir = Path(settings.data_dir) / "runs"
        runs = []
        if runs_dir.is_dir():
            for fpath in sorted(runs_dir.glob("*.jsonl")):
                try:
                    for line in fpath.read_text(encoding="utf-8", errors="replace").splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            record = json.loads(line)
                            if plugin_id and record.get("plugin_id") != plugin_id:
                                continue
                            if since is not None and record.get("ts", 0) < float(since):
                                continue
                            runs.append(record)
                        except (json.JSONDecodeError, TypeError):
                            continue
                except Exception:
                    continue
        runs.sort(key=lambda r: r.get("ts", 0), reverse=True)
        return {"runs": runs[:100]}

    def cmd_get_run(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings

        run_id = str(payload.get("run_id") or "").strip()
        if not run_id:
            raise _CommandError("invalid_input", "run_id is required")
        runs_dir = Path(settings.data_dir) / "runs"
        if runs_dir.is_dir():
            for fpath in sorted(runs_dir.glob("*.jsonl")):
                try:
                    for line in fpath.read_text(encoding="utf-8", errors="replace").splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            record = json.loads(line)
                            if record.get("run_id") == run_id:
                                return {"run": record}
                        except (json.JSONDecodeError, TypeError):
                            continue
                except Exception:
                    continue
        raise _CommandError("run_not_found", f"No run {run_id}")

    # ─── metrics ─────────────────────────────────────────────────────────────

    def cmd_get_metrics(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings
        from conxa_core.storage.plugin_store import list_plugins

        data_dir = Path(settings.data_dir)
        skills_dir = data_dir / "skills"
        skill_count = (
            sum(1 for d in skills_dir.iterdir() if d.is_dir() and (d / "skill.json").is_file())
            if skills_dir.is_dir()
            else 0
        )
        packs_dir = data_dir / "skill-packs"
        pack_count = sum(1 for d in packs_dir.iterdir() if d.is_dir()) if packs_dir.is_dir() else 0
        return {
            "skill_count": skill_count,
            "plugin_count": len(list_plugins()),
            "pack_count": pack_count,
        }

