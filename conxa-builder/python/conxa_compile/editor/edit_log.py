"""Append-only log of what a reviewer actually changed in Human Edit (BUILD-25
stage a). This is the eval set for the compile-time suggestion pass (stage b)
and the training pair for any future fine-tune — a month not captured is a
month of that data permanently lost.

Keyed on `step_key` (compiler/step_key.py), never on step_index — a reorder or
insert renumbers every later index (BUILD-22/BUILD-23), which would silently
attribute an edit to the wrong step.

Mirrors conxa_core.storage.session_events's events.jsonl: one JSON object per
line, written under the skill's own data directory, failure-silent like every
other local cache/log in this pipeline (workflow_intent.py::_write_cache).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from conxa_core.config import settings

from conxa_compile.compiler.step_key import step_keys

# Reviewer-editable fields worth tracking. Deliberately NOT the whole step —
# steps carry DOM snapshots/identity bundles that would make this log huge
# and mostly noise. Dotted paths are read with _get_path().
_TRACKED_FIELDS = (
    "input_binding",
    "value",
    "intent",
    "semantic_description",
    "action.action",
    "optional_hint",
    "branch",
    "validation.assertions",
)


def _steps_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    skills = doc.get("skills") if isinstance(doc, dict) else None
    block0 = skills[0] if isinstance(skills, list) and skills and isinstance(skills[0], dict) else {}
    steps = block0.get("steps")
    return steps if isinstance(steps, list) else []


def _get_path(step: dict[str, Any], path: str) -> Any:
    cur: Any = step
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def diff_steps(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    """Field-level diff between two skill documents, matched by step_key so a
    reorder/insert/delete elsewhere in the workflow never misattributes a
    change to the wrong step."""
    before_steps = [s for s in _steps_of(before) if isinstance(s, dict)]
    after_steps = [s for s in _steps_of(after) if isinstance(s, dict)]
    before_by_key = dict(zip(step_keys(before_steps), before_steps))
    after_by_key = dict(zip(step_keys(after_steps), after_steps))

    records: list[dict[str, Any]] = []
    for key, after_step in after_by_key.items():
        before_step = before_by_key.get(key)
        if before_step is None:
            records.append({"step_key": key, "field": "_step", "before": None, "after": "added"})
            continue
        for field in _TRACKED_FIELDS:
            bv = _get_path(before_step, field)
            av = _get_path(after_step, field)
            if bv != av:
                records.append({"step_key": key, "field": field, "before": bv, "after": av})
    for key in before_by_key:
        if key not in after_by_key:
            records.append({"step_key": key, "field": "_step", "before": "removed", "after": None})
    return records


def edits_path(skill_id: str) -> Path:
    p = settings.data_dir / "skills" / skill_id
    p.mkdir(parents=True, exist_ok=True)
    return p / "edits.jsonl"


def append_edit(
    skill_id: str,
    command: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> None:
    """Record every tracked-field change between before/after documents for one
    editor command. Never raises — an edit must never fail because its log
    entry couldn't be written."""
    if not isinstance(before, dict) or not isinstance(after, dict):
        return
    try:
        changes = diff_steps(before, after)
    except Exception:  # noqa: BLE001 — logging must never break the edit itself
        return
    if not changes:
        return
    meta_version = (after.get("meta") or {}).get("version") if isinstance(after.get("meta"), dict) else None
    ts = datetime.now(timezone.utc).isoformat()
    try:
        lines = [
            json.dumps(
                {"ts": ts, "skill_id": skill_id, "command": command, "meta_version": meta_version, **change},
                ensure_ascii=False,
                default=str,
            )
            for change in changes
        ]
        with edits_path(skill_id).open("a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError:
        pass


def read_edits(skill_id: str) -> list[dict[str, Any]]:
    path = edits_path(skill_id)
    if not path.is_file():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
