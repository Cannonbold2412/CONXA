"""Apply the second-opinion pass's findings to the compiled steps (BUILD-25).

The pass (llm/workflow_semantics.py) looks at the whole workflow at once and
decides four things no per-step rule can decide correctly. This module is what
writes those decisions into the steps, so a reviewer opening Human Review sees
finished work rather than a list of chips to approve.

  rename_binding        {{email_2}}          -> {{sender_email}}
  parameterize_literal  "INV-2024-0891"      -> {{reference_number}}
  label_phase           step.phase           -> login|navigate|act|verify|cleanup
  suggest_optional      a required step      -> a try_dismiss branch

What this module deliberately does NOT touch: selectors, identity bundles,
compiled_selectors, assertions, frame/tab chains, or anything else describing
*how* an element is found. CLAUDE.md's "LLM does not write selector strings on
the primary compile path" invariant is intact — the pass writes meaning
(binding names, placeholders, phase, optionality), never element addresses.

Human Review is the gate. Every field written here is one a reviewer can edit
in Human Edit, and nothing marks it as machine-written — an applied rename is
indistinguishable from one the fixed rules produced, by design.

Applying `suggest_optional` at compile time retires the older "branch steps
compile only from observed states + human confirmation" rule: the hint is still
an observed state (the recorder saw the step behave non-deterministically), but
the confirmation is now after the fact, in Human Review, instead of before.
editor/workflow_mutations.py::confirm_optional_interstitial remains for hints
this pass left alone, and shares build_try_dismiss_from_hint below so the two
paths cannot drift.
"""

from __future__ import annotations

import re
from typing import Any

from conxa_core.models.skill_spec import RecoveryBlock, SkillStep

from conxa_compile.compiler.action_policy import no_recovery_block
from conxa_compile.compiler.step_key import step_keys

TRY_DISMISS_INTENT = "try_dismiss_interstitial"


def rewrite_placeholder(value: Any, old: str, new: str) -> Any:
    """Rewrite {{old}} -> {{new}} wherever it appears in a step value.

    Not an equality check: a mixed value like "prefix {{name}}" would otherwise
    keep {{name}} while its binding became something else — a value/binding
    mismatch (audit finding L-2). Optional inner whitespace matches the
    placeholder grammar. Non-string values pass through untouched.
    """
    if not isinstance(value, str) or not old:
        return value
    return re.sub(r"\{\{\s*" + re.escape(old) + r"\s*\}\}", f"{{{{{new}}}}}", value)


def build_try_dismiss_from_hint(primary_selector: str, container_signal: str) -> dict[str, Any]:
    """The try_dismiss shape a recorder optional_hint converts into.

    Seeds the branch's candidates with the step's own recorded selector plus the
    recorder's observed container_signal, mirroring the scaffold
    _new_manual_step builds for a manually-inserted branch step. Returns plain
    data so both callers can apply it in their own shape — the compiler onto a
    SkillStep model, the editor onto a saved step dict.
    """
    seen: set[str] = set()
    candidates: list[str] = []
    for c in (str(primary_selector or "").strip(), str(container_signal or "").strip()):
        if c and c not in seen:
            seen.add(c)
            candidates.append(c)
    return {
        "intent": TRY_DISMISS_INTENT,
        "branch": {"candidates": candidates, "timeout_ms": 3000, "fallback_escape": True},
        "recovery": no_recovery_block(TRY_DISMISS_INTENT),
    }


def _apply_one(step: SkillStep, kind: str, current: str, proposed: str) -> bool:
    """Write one finding onto one step. Returns whether anything changed."""
    if kind == "rename_binding":
        if not step.input_binding:
            return False
        step.value = rewrite_placeholder(step.value, step.input_binding, proposed)
        step.input_binding = proposed
        return True

    if kind == "parameterize_literal":
        # Only ever freezes a recorded literal into a variable — never re-points
        # a value that is already bound to something else.
        if step.input_binding or not isinstance(step.value, str) or not step.value:
            return False
        step.input_binding = proposed
        step.value = f"{{{{{proposed}}}}}"
        return True

    if kind == "label_phase":
        step.phase = proposed
        return True

    if kind == "suggest_optional":
        hint = step.optional_hint if isinstance(step.optional_hint, dict) else None
        if not hint:
            return False
        built = build_try_dismiss_from_hint(
            str((step.target or {}).get("primary_selector") or ""),
            str(hint.get("container_signal") or ""),
        )
        action = dict(step.action) if isinstance(step.action, dict) else {"action": step.action}
        action["action"] = "try_dismiss"
        step.action = action
        step.intent = built["intent"]
        step.branch = built["branch"]
        step.recovery = RecoveryBlock(**built["recovery"])
        step.optional_hint = None  # consumed by this conversion
        return True

    return False


def apply_second_opinion(steps: list[SkillStep], findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Write every finding that maps onto a real step, returning the subset
    actually applied (the compile-report audit record). Findings arrive keyed on
    step_key, already validated by llm/workflow_semantics.py — this only guards
    the shape mismatches that validation can't see (a rename on a step with no
    binding, an optional conversion on a step whose hint is gone)."""
    if not findings:
        return []
    by_key = dict(zip(step_keys(steps), steps))
    applied: list[dict[str, Any]] = []
    for item in findings:
        step = by_key.get(str(item.get("step_key") or ""))
        if step is None:
            continue
        if _apply_one(
            step,
            str(item.get("kind") or ""),
            str(item.get("current") or ""),
            str(item.get("proposed") or ""),
        ):
            applied.append(item)
    return applied


if __name__ == "__main__":
    assert rewrite_placeholder("prefix {{ name }} suffix", "name", "sender") == "prefix {{sender}} suffix"
    assert rewrite_placeholder("{{name}}", "name", "sender") == "{{sender}}"
    assert rewrite_placeholder(None, "name", "sender") is None
    assert rewrite_placeholder("{{other}}", "name", "sender") == "{{other}}"

    def _step(**kw: Any) -> SkillStep:
        return SkillStep(action={"action": "type"}, **kw)

    rename = _step(input_binding="email_2", value="{{email_2}}")
    literal = _step(value="INV-2024-0891")
    phase = _step()
    optional = _step(
        target={"primary_selector": "#cookie-ok"},
        optional_hint={"container_signal": ".cookie-banner"},
    )
    steps = [rename, literal, phase, optional]
    keys = step_keys(steps)
    applied = apply_second_opinion(
        steps,
        [
            {"step_key": keys[0], "kind": "rename_binding", "current": "email_2", "proposed": "sender_email"},
            {"step_key": keys[1], "kind": "parameterize_literal", "current": "INV-2024-0891", "proposed": "reference_number"},
            {"step_key": keys[2], "kind": "label_phase", "current": "", "proposed": "login"},
            {"step_key": keys[3], "kind": "suggest_optional", "current": "", "proposed": "true"},
            {"step_key": "not-a-real-key#1", "kind": "label_phase", "current": "", "proposed": "act"},
        ],
    )
    assert len(applied) == 4, applied
    assert rename.input_binding == "sender_email" and rename.value == "{{sender_email}}"
    assert literal.input_binding == "reference_number" and literal.value == "{{reference_number}}"
    assert phase.phase == "login"
    assert optional.action["action"] == "try_dismiss"
    assert optional.branch["candidates"] == ["#cookie-ok", ".cookie-banner"]
    assert optional.optional_hint is None
    assert optional.recovery.max_attempts == 0

    # Shape guards: nothing to rename, and a hint already consumed.
    leftovers = step_keys([phase, optional])
    assert (
        apply_second_opinion(
            [phase, optional],
            [
                {"step_key": leftovers[0], "kind": "rename_binding", "current": "", "proposed": "x"},
                {"step_key": leftovers[1], "kind": "suggest_optional", "current": "", "proposed": "true"},
            ],
        )
        == []
    )

    print("ok")
