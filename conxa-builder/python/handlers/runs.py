"""Execution-run evidence and metrics command handlers.

`cmd_list_runs`/`cmd_get_run` used to live here, reading `data/runs/*.jsonl` — a file nothing in
the codebase ever wrote (confirmed by repo-wide search while scoping BUILD-26). Deleted rather
than left beside the new evidence reader: a dead reader of a nonexistent log next to a real one
is exactly how the next spec inherits the same wrong assumption that a run log already existed.
See TODO.md BUILD-26 stage (a4).
"""

from __future__ import annotations

from typing import Any

from handlers.protocol import _CommandError, _safe_id

class RunsMixin:
    def cmd_get_failure_evidence(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """BUILD-26 stage (a): the Human Review copilot's evidence bundle for one skill's most
        recent (or a named) test failure — conxa_compile/editor/evidence.py."""
        from conxa_compile.editor.evidence import EvidenceError, build_evidence_bundle

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        run_id = payload.get("run_id")
        run_id = str(run_id).strip() if run_id else None
        try:
            return {"evidence": build_evidence_bundle(skill_id, run_id=run_id)}
        except EvidenceError as exc:
            raise _CommandError(exc.code, exc.message) from exc

    # ─── metrics ─────────────────────────────────────────────────────────────

    def cmd_get_metrics(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings
        from conxa_core.storage.workflow_store import list_workflows

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
            "workflow_count": len(list_workflows()),
            "pack_count": pack_count,
        }

