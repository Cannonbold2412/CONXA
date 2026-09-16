"""PROD-3-DRYRUN layer 4: stage-then-commit ordering lint.

Warns — never blocks — when a step classified `consequence == "irreversible"` sits before
another step that actually writes anything (`consequence` in {"reversible", "irreversible"}),
skipping non-substantive trailing markers (tab/frame/dialog/clipboard bookkeeping — see
`editor.action_registry.MARKER_ACTIONS`) and purely read-only observation steps (a final
`assert`/screenshot checking the result is harmless by definition).

"Stage-then-commit": record so the one irreversible action is the workflow's last consequential
step. That way an earlier failure on a re-record always leaves only a harmless draft, never a
partial commit followed by more writes. This is a LINT, not a gate — it never blocks save,
publish, or compile; a reviewer sees it and can re-order the recording if they choose to.
"""

from __future__ import annotations

from typing import Any

from conxa_compile.editor.action_registry import MARKER_ACTIONS
from conxa_core.models.skill_spec import SkillStep

_WRITING_CONSEQUENCES = frozenset({"reversible", "irreversible"})


def _action_kind(step: SkillStep) -> str:
    action = step.action
    if isinstance(action, dict):
        return str(action.get("action") or "").strip().lower()
    return str(action or "").strip().lower()


def lint_commit_ordering(steps: list[SkillStep]) -> list[dict[str, Any]]:
    """One warning entry per irreversible step that is followed by another writing step.

    Only the NEAREST later offender is reported per irreversible step (not every one after it) —
    fixing the ordering issue means moving the irreversible step, and reporting every downstream
    write would just repeat the same finding under different indices.
    """
    warnings: list[dict[str, Any]] = []
    for i, step in enumerate(steps):
        if step.consequence != "irreversible":
            continue
        for j in range(i + 1, len(steps)):
            later = steps[j]
            if _action_kind(later) in MARKER_ACTIONS:
                continue
            if later.consequence in _WRITING_CONSEQUENCES:
                warnings.append({
                    "step_index": i,
                    "intent": step.intent,
                    "followed_by_index": j,
                    "followed_by_intent": later.intent,
                    "message": (
                        f"Step {i + 1}"
                        + (f" ({step.intent})" if step.intent else "")
                        + " is an irreversible action but is not the workflow's last committing "
                        + f"step — step {j + 1}"
                        + (f" ({later.intent})" if later.intent else "")
                        + " still runs after it. If it fails partway, this workflow won't stop "
                        + "on a harmless draft."
                    ),
                })
            break
    return warnings
