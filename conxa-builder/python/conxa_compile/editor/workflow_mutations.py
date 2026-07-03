"""Structural edits to a persisted skill document (reorder/insert/delete/replace).

Split out of workflow_service.py: this half performs the workflow editor's
structural mutations. Calls into workflow_dto.py for revalidation
(_build_reference_for_audit, collect_suggestions) after each edit.
"""

from __future__ import annotations

from typing import Any

from conxa_compile.compiler.action_policy import no_recovery_block
from conxa_compile.compiler.patch import revalidate_step
from conxa_compile.confidence.uncertainty import audit_reference
from conxa_compile.editor.action_registry import action_spec, default_action_value, is_supported_action
from conxa_compile.editor.workflow_dto import _build_reference_for_audit, collect_suggestions
from conxa_compile.policy.bundle import get_policy_bundle

def validate_skill_document(document: dict[str, Any]) -> dict[str, Any]:
    policy = get_policy_bundle().data
    steps_raw = (document.get("skills") or [{}])[0].get("steps") or []
    if not isinstance(steps_raw, list):
        steps_raw = []
    per_step: list[dict[str, Any]] = []
    for idx, s in enumerate(steps_raw):
        step = dict(s)
        ref = _build_reference_for_audit(step)
        per_step.append(
            {
                "step_index": idx,
                "audit_issues": audit_reference(ref),
                "revalidation": revalidate_step(step),
            }
        )
    return {"steps": per_step, "suggestions": [m.model_dump() for m in collect_suggestions([dict(s) for s in steps_raw], policy)]}


def reorder_steps(document: dict[str, Any], new_order: list[int]) -> dict[str, Any]:
    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    n = len(steps)
    if sorted(new_order) != list(range(n)):
        raise ValueError("invalid_reorder_permutation")
    new_steps = [dict(steps[i]) for i in new_order]
    block["steps"] = new_steps
    skills[0] = block
    doc["skills"] = skills
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def delete_step_at(document: dict[str, Any], step_index: int) -> dict[str, Any]:
    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")
    del steps[step_index]
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def _last_known_page_url(steps: list[Any], insert_after: int) -> str:
    for raw in reversed(steps[: insert_after + 1]):
        step = dict(raw) if isinstance(raw, dict) else {}
        action = step.get("action") if isinstance(step.get("action"), dict) else {}
        url = str(action.get("url") or step.get("url") or "").strip()
        if url.startswith(("http://", "https://")):
            return url
        signals = step.get("signals") if isinstance(step.get("signals"), dict) else {}
        context = signals.get("context") if isinstance(signals.get("context"), dict) else {}
        url = str(context.get("page_url") or "").strip()
        if url.startswith(("http://", "https://")):
            return url
    return ""


def _new_manual_step(action_kind: str, page_url: str) -> dict[str, Any]:
    kind = action_kind.strip().lower().replace("-", "_")
    if not is_supported_action(kind) or not action_spec(kind).insertable:
        raise ValueError("unsupported_action_kind")

    intent = {
        "navigate": "navigate_to_page",
        "click": "click_target",
        "dblclick": "double_click_target",
        "right_click": "right_click_target",
        "hover": "hover_target",
        "focus": "focus_target",
        "type": "type_into_field",
        "fill": "fill_field",
        "set_checkbox": "set_checkbox",
        "set_radio": "set_radio_option",
        "select": "select_option",
        "select_option": "select_option",
        "date_pick": "pick_date",
        "drag_drop": "drag_and_drop",
        "keyboard_shortcut": "press_keyboard_shortcut",
        "scroll": "scroll_page",
        "check": "check_page_state",
        "assert": "assert_page_state",
        "wait": "wait_for_page",
        "screenshot": "capture_screenshot",
        "upload": "upload_file",
    }.get(kind, f"{kind}_target")
    url = page_url if page_url.startswith(("http://", "https://")) else ""
    action: dict[str, Any] = {"action": kind}
    if kind == "navigate":
        action["url"] = url or "https://example.com"
        url = action["url"]
    elif kind == "scroll":
        action["delta"] = 600
    elif kind == "wait":
        action["ms"] = 1000
    default_value = default_action_value(kind)
    if default_value is not None:
        action["value"] = default_value

    step: dict[str, Any] = {
        "action": action,
        "intent": intent,
        "url": url,
        "target": {
            "primary_selector": "",
            "fallback_selectors": [],
        },
        "signals": {
            "dom": {},
            "selectors": {"css": "", "aria": "", "text_based": "", "xpath": ""},
            "semantic": {"final_intent": intent, "llm_intent": intent},
            "context": {"page_url": url, "page_title": ""},
            "anchors": [],
            "visual": {},
        },
        "state": {},
        "value": default_value,
        "input_binding": None,
        "validation": {
            "wait_for": {"type": "none", "timeout": 5000},
            "success_conditions": {},
        },
        "recovery": no_recovery_block(intent),
        "confidence_protocol": {},
        "decision_policy": {},
    }
    if kind == "navigate":
        step["validation"] = {
            "wait_for": {"type": "url_change", "target": url, "timeout": 15000},
            "success_conditions": {"url": url},
        }
    if kind in {"check", "assert"}:
        step["check_kind"] = "url"
        step["check_pattern"] = url
    return step


def insert_step_after(document: dict[str, Any], action_kind: str, insert_after: int | None = None) -> dict[str, Any]:
    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if insert_after is None:
        insert_at = len(steps)
        anchor_index = len(steps) - 1
    else:
        if insert_after < -1 or insert_after >= len(steps):
            raise ValueError("step_index_out_of_range")
        insert_at = insert_after + 1
        anchor_index = insert_after
    steps.insert(insert_at, _new_manual_step(action_kind, _last_known_page_url(steps, anchor_index)))
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def merge_skill_inputs(document: dict[str, Any], inputs: list[dict[str, Any]], title: str | None) -> dict[str, Any]:
    doc = dict(document)
    doc["inputs"] = list(inputs)
    if title is not None:
        meta = dict(doc.get("meta") or {})
        meta["title"] = title
        doc["meta"] = meta
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def _deep_replace_string_values(value: Any, find: str, replace: str) -> Any:
    """Return a structure copy with every string leaf updated via str.replace(find, replace)."""
    if isinstance(value, str):
        return value.replace(find, replace)
    if isinstance(value, list):
        return [_deep_replace_string_values(v, find, replace) for v in value]
    if isinstance(value, dict):
        return {k: _deep_replace_string_values(v, find, replace) for k, v in value.items()}
    return value


def replace_string_literals_in_skill_document(document: dict[str, Any], find: str, replace: str) -> dict[str, Any]:
    """Replace a literal substring everywhere in the stored skill JSON (steps, inputs, meta, etc.)."""
    if not isinstance(find, str) or not find:
        raise ValueError("find_must_be_nonempty")
    if not isinstance(replace, str):
        raise ValueError("replace_with_must_be_string")
    new_doc = _deep_replace_string_values(dict(document), find, replace)
    meta = dict(new_doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    new_doc["meta"] = meta
    return new_doc
