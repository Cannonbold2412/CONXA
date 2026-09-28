"""Generic, selector-free plain-language description of one compiled step.

The one place any compile-time code builds a small `{role, action, description}` fact
about a step for something that will read it as text — an advisory LLM copy-rewrite
(`conxa_compile/llm/copy_rewrite.py`), a log line, a future review-popup explanation —
without ever leaking `target`/`identity_bundle`/`compiled_selectors`. Pull this out once
rather than re-deriving the same action-name-unwrapping + field-fallback logic at every
call site (`build.py::_rewrite_loop_suggestions_for_review` was the first user, not a
special case reserved for loop suggestions).
"""

from __future__ import annotations

from typing import Any


def describe_step(step: Any, *, role: str | None = None) -> dict[str, Any]:
    """`action` is the plain action name (`"click"`, `"navigate"`, `"upload_intent"`, …),
    unwrapped whether `step.action` is a bare string or a `{"action": ...}` dict.
    `description` is whatever plain-language text compile already produced for this step —
    `semantic_description` when set, else `intent` — never a selector, never empty by
    contract but may legitimately be `""` for a step nothing wrote either field for yet.
    `role` (caller-supplied, e.g. "acquire"/"upload"/"redundant_click") is included only
    when given, so an LLM payload's shape doesn't grow an always-empty key for callers
    that have no roles to tag."""
    action = getattr(step, "action", None)
    action_name = action if isinstance(action, str) else str((action or {}).get("action") or "")
    facts: dict[str, Any] = {
        "action": action_name,
        "description": str(getattr(step, "semantic_description", "") or getattr(step, "intent", "") or ""),
    }
    if role is not None:
        facts = {"role": role, **facts}
    return facts
