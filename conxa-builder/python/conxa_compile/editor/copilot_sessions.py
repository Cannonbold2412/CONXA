"""Append-only archive of Human Review Copilot conversations, written when a reviewer starts a
new session (BUILD-26). Mirrors edit_log.py's edits_path() — same skill-scoped directory, same
one-JSON-object-per-line shape, same fail-silent contract: a disk hiccup must never block a
reviewer from starting a fresh conversation.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from conxa_core.config import settings


def copilot_sessions_path(skill_id: str) -> Path:
    p = settings.data_dir / "skills" / skill_id
    p.mkdir(parents=True, exist_ok=True)
    return p / "copilot_sessions.jsonl"


def save_copilot_session(skill_id: str, transcript: list[dict[str, Any]]) -> None:
    if not transcript:
        return
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "skill_id": skill_id,
        "messages": transcript,
    }
    try:
        with copilot_sessions_path(skill_id).open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
    except OSError:
        pass


def load_last_session(skill_id: str) -> list[dict[str, Any]]:
    """BUILD-26 stage g: the archive this file writes was never read back — a reviewer reopening
    Human Edit always started the copilot cold. Returns the last archived transcript's messages,
    or [] when there is no archive yet or it can't be read (same fail-silent contract as the
    writer above: a resume that can't happen must not block opening the panel)."""
    path = copilot_sessions_path(skill_id)
    if not path.is_file():
        return []
    try:
        lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except OSError:
        return []
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        messages = entry.get("messages") if isinstance(entry, dict) else None
        return messages if isinstance(messages, list) else []
    return []
