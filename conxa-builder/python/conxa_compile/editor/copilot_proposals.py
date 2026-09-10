"""Gates a Human Review Copilot proposal against the editor's own patch gate before it is ever
shown, and resolves it back to a live step at accept time (BUILD-26 stages c1/c2/c3).

The copilot never writes a selector: `_ALLOWED_FIELDS` excludes `target`, `identity_bundle`,
`compiled_selectors`, and every selector-bearing field — the same category as the two sanctioned
re-compile exceptions in CLAUDE.md, deliberately narrower (it never touches an element address
at all, only meaning fields already writable through `cmd_patch_step`).

A proposal stores `step_key` (`compiler/step_key.py`), never a baked `step_index` — an insert,
delete, or reorder between when the proposal was shown and when it is accepted renumbers every
later step (BUILD-22/BUILD-23), which is exactly the failure `editor/edit_log.py`'s docstring
warns about for the review-edit log. `resolve_step_index` re-resolves the key at accept time and
refuses cleanly if it is gone; `cmd_patch_step`'s own `_apply_step_patch` re-runs
`validate_editor_patch` on the resolved step regardless, so accept time is never trusting a
gate result computed against a document that may no longer exist.
"""

from __future__ import annotations

import uuid
from typing import Any

from conxa_compile.compiler.step_key import step_keys
from conxa_compile.editor.patch_gate import validate_editor_patch
from conxa_compile.policy.bundle import get_policy_bundle

_ALLOWED_FIELDS = frozenset({
    "value", "input_binding", "intent", "semantic_description", "validation.assertions",
})


class ProposalError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _steps_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    skills = doc.get("skills") if isinstance(doc, dict) else None
    block0 = skills[0] if isinstance(skills, list) and skills and isinstance(skills[0], dict) else {}
    steps = block0.get("steps")
    return steps if isinstance(steps, list) else []


def _resolve_step(doc: dict[str, Any], step_key: str) -> tuple[int, dict[str, Any]] | None:
    steps = _steps_of(doc)
    for i, key in enumerate(step_keys(steps)):
        if key == step_key:
            return i, steps[i]
    return None


def _current_value(step: dict[str, Any], field: str) -> Any:
    cur: Any = step
    for part in field.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _patch_for(field: str, value: Any) -> dict[str, Any]:
    """The LLM names one dotted field (e.g. "validation.assertions"); cmd_patch_step wants a
    nested patch dict ({"validation": {"assertions": value}})."""
    if "." not in field:
        return {field: value}
    top, rest = field.split(".", 1)
    return {top: _patch_for(rest, value)}


def gate_proposals(doc: dict[str, Any], raw_proposals: list[Any]) -> list[dict[str, Any]]:
    """Filter+shape raw {step_key, field, patch, why} objects from the LLM into proposals safe
    to render. Each candidate is pre-validated against `validate_editor_patch` so an accepted
    one is never rejected by the gate a second later. A proposal that fails any check is simply
    dropped, never shown with an error — a malformed field name from the model is not the
    reviewer's problem to see."""
    policy = get_policy_bundle().data
    steps = _steps_of(doc)
    out: list[dict[str, Any]] = []
    for raw in raw_proposals:
        if not isinstance(raw, dict):
            continue
        step_key = str(raw.get("step_key") or "").strip()
        field = str(raw.get("field") or "").strip()
        if not step_key or field not in _ALLOWED_FIELDS:
            continue
        resolved = _resolve_step(doc, step_key)
        if resolved is None:
            continue
        step_index, step = resolved
        value = raw.get("patch")
        patch = _patch_for(field, value)
        previous_step = steps[step_index - 1] if step_index > 0 else None
        try:
            validate_editor_patch(step, patch, policy, previous_step=previous_step)
        except ValueError:
            continue
        out.append({
            "id": str(uuid.uuid4()),
            "step_key": step_key,
            "command": "patch_step",
            "field": field,
            "patch": patch,
            "why": str(raw.get("why") or "").strip(),
            "preview": {"before": _current_value(step, field), "after": value},
        })
    return out


def resolve_step_index(doc: dict[str, Any], step_key: str) -> int:
    """Re-resolve `step_key` to the CURRENT `step_index` at accept time. Raises ProposalError
    (never a bare ValueError) when the step is gone — an insert/delete/reorder happened between
    the proposal being shown and being accepted."""
    resolved = _resolve_step(doc, step_key)
    if resolved is None:
        raise ProposalError(
            "proposal_stale",
            "This step no longer exists — the workflow changed since this was proposed.",
        )
    return resolved[0]
