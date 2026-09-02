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
from conxa_compile.editor.dto import SkillInputVariable
from conxa_compile.editor.placeholder_grammar import PLACEHOLDER_RE
from conxa_compile.editor.workflow_dto import _build_reference_for_audit, collect_suggestions
from conxa_compile.policy.bundle import get_policy_bundle
from pydantic import ValidationError as PydanticValidationError


def _invalidate_compile_report(doc: dict[str, Any]) -> None:
    """Mark `compile_report` stale in place after a mutation changes the top-level step list's
    length, order, or per-step action/intent.

    compile_report (compiler/build.py::_build_compile_report) is built once at compile time and
    is indexed by top-level step position. A reorder/insert/delete shifts every later index out
    from under it; workflow_dto.py::_compile_health then surfaces confidence/warnings against
    steps that no longer exist at those positions — Human Edit's compile-health banner pointed an
    approver at the wrong step. Clearing `steps` (rather than trying to patch indices) is the
    only way to stop misleading step-index buttons; only a real recompile can produce
    trustworthy per-step confidence again."""
    report = doc.get("compile_report")
    if not isinstance(report, dict) or not report:
        return
    report = dict(report)
    report["status"] = "stale"
    report["steps"] = []
    doc["compile_report"] = report


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
    doc = _remap_intent_graph_indices(doc, {new_order[p]: p for p in range(n)})
    _invalidate_compile_report(doc)
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
    original_len = len(steps)
    del steps[step_index]
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    doc = _remap_intent_graph_indices(
        doc,
        {i: (None if i == step_index else i if i < step_index else i - 1) for i in range(original_len)},
    )
    _invalidate_compile_report(doc)
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def _branch_body_steps(document: dict[str, Any], step_index: int) -> tuple[dict[str, Any], list[Any]]:
    """Resolve `steps[step_index]["branch"]["steps"]` — the only branch body currently editable
    (if_present's nested body; try_dismiss/wait_for_one_of have no editable nested body — see
    patch_gate.py::_validate_branch_patch). Returns (parent_step_dict, nested_steps_list)."""
    skills = list(document.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")
    parent = dict(steps[step_index])
    action = parent.get("action") if isinstance(parent.get("action"), dict) else {}
    kind = str(action.get("action") or "").strip().lower()
    if kind != "if_present":
        raise ValueError("branch_body_only_editable_for_if_present")
    branch = dict(parent.get("branch") or {})
    nested = list(branch.get("steps") or [])
    return parent, nested


def _save_branch_body_steps(
    document: dict[str, Any], step_index: int, nested: list[Any]
) -> dict[str, Any]:
    doc = dict(document)
    skills = list(doc.get("skills") or [])
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    parent = dict(steps[step_index])
    branch = dict(parent.get("branch") or {})
    branch["steps"] = nested
    parent["branch"] = branch
    steps[step_index] = parent
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def insert_branch_step(
    document: dict[str, Any], step_index: int, action_kind: str, insert_after: int | None = None
) -> dict[str, Any]:
    """Insert a new leaf step into an if_present step's nested body — mirrors insert_step_after
    but scoped to `steps[step_index]["branch"]["steps"]`. Branch bodies are best-effort (never
    enter Tier 1-4 recovery), but the scaffolded step itself is an ordinary leaf step shape —
    only its own recovery/validation are meaningless there (enforced at patch time, not here)."""
    _, nested = _branch_body_steps(document, step_index)
    if insert_after is None:
        insert_at = len(nested)
        anchor_index = len(nested) - 1
    else:
        if insert_after < -1 or insert_after >= len(nested):
            raise ValueError("branch_step_index_out_of_range")
        insert_at = insert_after + 1
        anchor_index = insert_after
    nested.insert(insert_at, _new_manual_step(action_kind, _last_known_page_url(nested, anchor_index)))
    return _save_branch_body_steps(document, step_index, nested)


def delete_branch_step(document: dict[str, Any], step_index: int, nested_index: int) -> dict[str, Any]:
    _, nested = _branch_body_steps(document, step_index)
    if nested_index < 0 or nested_index >= len(nested):
        raise ValueError("branch_step_index_out_of_range")
    del nested[nested_index]
    return _save_branch_body_steps(document, step_index, nested)


def reorder_branch_steps(document: dict[str, Any], step_index: int, new_order: list[int]) -> dict[str, Any]:
    _, nested = _branch_body_steps(document, step_index)
    n = len(nested)
    if sorted(new_order) != list(range(n)):
        raise ValueError("invalid_reorder_permutation")
    reordered = [dict(nested[i]) for i in new_order]
    return _save_branch_body_steps(document, step_index, reordered)


def confirm_optional_interstitial(document: dict[str, Any], step_index: int) -> dict[str, Any]:
    """Human-gated conversion of a recorder-flagged optional interstitial (recording-next-steps.md
    Priority 2; SkillStep.optional_hint) into a real try_dismiss branch step.

    The compiler never does this on its own — a stochastic hint compiles to a normal required
    step until a human confirms it here (CLAUDE.md Key Invariants: "branch steps compile only
    from observed states + human confirmation"). Seeds the branch's candidates with the step's
    own recorded selector plus the recorder's observed container_signal, mirroring the
    try_dismiss scaffold _new_manual_step builds for a manually-inserted branch step.
    """
    doc = dict(document)
    skills = list(doc.get("skills") or [])
    if not skills:
        raise ValueError("no_skills_block")
    block = dict(skills[0])
    steps = list(block.get("steps") or [])
    if step_index < 0 or step_index >= len(steps):
        raise ValueError("step_index_out_of_range")
    step = dict(steps[step_index])
    hint = step.get("optional_hint") if isinstance(step.get("optional_hint"), dict) else None
    if not hint:
        raise ValueError("step_has_no_optional_hint")

    target = step.get("target") if isinstance(step.get("target"), dict) else {}
    primary_selector = str(target.get("primary_selector") or "").strip()
    container_signal = str(hint.get("container_signal") or "").strip()
    seen: set[str] = set()
    candidates: list[str] = []
    for c in (primary_selector, container_signal):
        if c and c not in seen:
            seen.add(c)
            candidates.append(c)

    action = dict(step.get("action") if isinstance(step.get("action"), dict) else {})
    action["action"] = "try_dismiss"
    step["action"] = action
    step["intent"] = "try_dismiss_interstitial"
    step["branch"] = {"candidates": candidates, "timeout_ms": 3000, "fallback_escape": True}
    step["recovery"] = no_recovery_block("try_dismiss_interstitial")
    step["optional_hint"] = None  # consumed by this confirmation

    steps[step_index] = step
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    _invalidate_compile_report(doc)
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
        "if_present": "dismiss_if_present",
        "try_dismiss": "try_dismiss_interstitial",
        "wait_for_one_of": "wait_for_one_of_states",
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
            "wait_for": {"type": "url_change", "target": url, "timeout": 60000},
            "success_conditions": {"url": url},
        }
    if kind in {"check", "assert"}:
        step["check_kind"] = "url"
        step["check_pattern"] = url
    if kind in {"if_present", "try_dismiss", "wait_for_one_of"}:
        # Branch bodies are best-effort and never enter the Tier 1-4 recovery cascade — see
        # CLAUDE.md Key Invariants. Scaffold an empty body per kind; authored via
        # BranchBodyEditor.tsx (nested steps for if_present) or the probe/candidate/option
        # selector fields directly (try_dismiss/wait_for_one_of) — see patch_gate.py.
        if kind == "if_present":
            step["branch"] = {"steps": [], "timeout_ms": 3000}
        elif kind == "try_dismiss":
            step["branch"] = {"candidates": [], "timeout_ms": 3000, "fallback_escape": True}
        else:  # wait_for_one_of
            step["branch"] = {"options": [], "timeout_ms": 5000, "required": True}
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
    original_len = len(steps)
    steps.insert(insert_at, _new_manual_step(action_kind, _last_known_page_url(steps, anchor_index)))
    block["steps"] = steps
    skills[0] = block
    doc["skills"] = skills
    doc = _remap_intent_graph_indices(
        doc, {i: (i if i < insert_at else i + 1) for i in range(original_len)}
    )
    _invalidate_compile_report(doc)
    meta = dict(doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    doc["meta"] = meta
    return doc


def _input_error_code(input_id: str, exc: PydanticValidationError) -> str:
    """Collapse a Pydantic ValidationError into the compact `code:detail` string the RPC layer
    surfaces. `cmd_update_workflow_inputs` uses str(exc) as the machine-readable error code, so
    a raw multi-line Pydantic message must never reach it."""
    first = exc.errors()[0]
    field = str(first["loc"][0]) if first.get("loc") else "input"
    if field == "id":
        return f"invalid_input_id:{input_id}"
    # A model_validator raises its own already-compact code (e.g. select_default_not_in_options).
    if first.get("type") == "value_error":
        return str(first.get("ctx", {}).get("error") or first.get("msg") or f"invalid_input:{input_id}")
    return f"invalid_input_{field}:{input_id}"


def _validate_skill_inputs(inputs: list[dict[str, Any]]) -> None:
    """Trust boundary for every saved input row. Shape/field rules live in SkillInputVariable so
    the declared DTO and the enforced contract can't drift; only the cross-row uniqueness check
    stays here, because no single-row model can see its siblings."""
    seen: set[str] = set()
    for item in inputs:
        if not isinstance(item, dict):
            raise ValueError("input_must_be_object")
        input_id = str(item.get("id") or "").strip()
        if not input_id:
            raise ValueError("input_id_required")
        # Validates the id grammar, the text/select type, and that a select's default is one of
        # its options — the form already enforces these, but the Advanced JSON editor and direct
        # RPC bypass the form (audit finding L-5).
        try:
            SkillInputVariable.model_validate({**item, "id": input_id})
        except PydanticValidationError as exc:
            raise ValueError(_input_error_code(input_id, exc)) from exc
        # Ids collide case-insensitively at runtime ({{Email}} and {{email}} bind the same
        # slot), so uniqueness must be enforced the same way — matching the frontend
        # rowsToServerPayload check so the Advanced JSON editor / direct RPC can't slip a
        # pair past the trust boundary (audit finding L-4/L-5 sibling).
        id_key = input_id.lower()
        if id_key in seen:
            raise ValueError(f"duplicate_input_id:{input_id}")
        seen.add(id_key)


def _scan_placeholder_ids(value: Any, out: set[str]) -> None:
    """Collect every {{id}} variable referenced anywhere in a step (matches the frontend's
    collectVariableIdsFromSteps whole-step scan so 'spotted' means the same on both sides)."""
    if isinstance(value, str):
        for m in PLACEHOLDER_RE.finditer(value):
            out.add(m.group(1))
    elif isinstance(value, list):
        for item in value:
            _scan_placeholder_ids(item, out)
    elif isinstance(value, dict):
        for item in value.values():
            _scan_placeholder_ids(item, out)


def _date_pick_defaults(steps: list[Any]) -> dict[str, str]:
    """{{input_binding}} -> recorded ISO date/datetime, for every date_pick step the custom-
    calendar collapse pass produced (compiler/date_picker.py). Native `<input type=date>` steps
    carry the same shape once collapsed through the same handler_hints.date_picker contract, so
    this covers both without distinguishing them."""
    out: dict[str, str] = {}
    for step in steps:
        if not isinstance(step, dict):
            continue
        action = step.get("action")
        action_name = action if isinstance(action, str) else (action or {}).get("action")
        if action_name != "date_pick":
            continue
        binding = str(step.get("input_binding") or "").strip()
        if not binding:
            continue
        hints = step.get("handler_hints") or {}
        date_picker = hints.get("date_picker") if isinstance(hints, dict) else None
        recorded = (date_picker or {}).get("recorded_value") if isinstance(date_picker, dict) else None
        if recorded:
            out[binding] = str(recorded)
    return out


def _choice_specs(steps: list[Any]) -> dict[str, dict[str, Any]]:
    """{{input_binding}} -> {type, options, default} for every choice step compiler/choice.py
    produced (radio/select/aria_radio/aria_listbox/checkbox-group). Mirrors _date_pick_defaults's
    shape/role: options come from the group's own recorded label set, never the answer, so the
    auto-declared input is a real MCQ (`enum` in input.json, constrained in the MCP tool schema)
    instead of a free-text field."""
    out: dict[str, dict[str, Any]] = {}
    for step in steps:
        if not isinstance(step, dict):
            continue
        hints = step.get("handler_hints") or {}
        if not isinstance(hints, dict) or hints.get("control_kind") != "choice":
            continue
        choice = hints.get("choice")
        if not isinstance(choice, dict):
            continue
        binding = str(step.get("input_binding") or "").strip()
        if not binding:
            continue
        options = [
            str(o.get("label") or o.get("value") or "")
            for o in (choice.get("options") or [])
            if isinstance(o, dict) and (o.get("label") or o.get("value"))
        ]
        if not options:
            continue
        if choice.get("multi"):
            values_by_value = {str(o.get("value") or ""): str(o.get("label") or o.get("value") or "") for o in (choice.get("options") or []) if isinstance(o, dict)}
            default_labels = [values_by_value.get(v, v) for v in (choice.get("recorded_values") or [])]
            out[binding] = {"type": "multiselect", "options": options, "default": default_labels}
        else:
            default_label = str(choice.get("recorded_label") or "")
            out[binding] = {"type": "select", "options": options, "default": default_label if default_label in options else ""}
    return out


def reconcile_inputs_with_step_values(document: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Auto-declare any {{var}} referenced in a step but missing from the inputs list.

    Without this, editing a value to reference {{new}} left the runtime prompting for the
    old, now-dead variable while {{new}} resolved to empty at execution (audit finding M-3).
    Orphaned declarations are deliberately left in place — an unrelated value edit shouldn't
    silently drop a variable the user may still be wiring up; the drawer flags those as unused.
    Returns (possibly-mutated document, whether anything was added).
    """
    steps = ((document.get("skills") or [{}])[0] or {}).get("steps") or []
    spotted: set[str] = set()
    for step in steps:
        if isinstance(step, dict):
            _scan_placeholder_ids(step, spotted)
    if not spotted:
        return document, False
    date_defaults = _date_pick_defaults(steps)
    choice_specs = _choice_specs(steps)
    inputs = list(document.get("inputs") or [])
    declared = {str(i.get("id") or "").strip().lower() for i in inputs if isinstance(i, dict)}
    added = False
    for sid in sorted(spotted):
        if sid.lower() not in declared:
            spec = choice_specs.get(sid)
            if spec is not None:
                row = {"id": sid, "type": spec["type"], "default": spec["default"], "options": spec["options"]}
            else:
                default = date_defaults.get(sid)
                row = {"id": sid, "type": "date" if default else "text", "default": default, "options": []}
            inputs.append(row)
            declared.add(sid.lower())
            added = True
    if not added:
        return document, False
    doc = dict(document)
    doc["inputs"] = inputs
    return doc, True


def _remap_intent_graph_indices(
    document: dict[str, Any], old_to_new: dict[int, int | None]
) -> dict[str, Any]:
    """Renumber intent_graph.steps[].index after a structural edit so the advisory per-step
    plan keeps lining up with the steps it describes (audit finding L-1). Entries whose step
    was deleted (mapped to None) are dropped; the rest are re-sorted by their new index."""
    graph = document.get("intent_graph")
    if not isinstance(graph, dict):
        return document
    entries = graph.get("steps")
    if not isinstance(entries, list) or not entries:
        return document
    remapped: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        new_index = old_to_new.get(int(entry.get("index", -1)), None)
        if new_index is None:
            continue
        e = dict(entry)
        e["index"] = new_index
        remapped.append(e)
    remapped.sort(key=lambda e: e["index"])
    doc = dict(document)
    new_graph = dict(graph)
    new_graph["steps"] = remapped
    doc["intent_graph"] = new_graph
    return doc


def merge_skill_inputs(document: dict[str, Any], inputs: list[dict[str, Any]], title: str | None) -> dict[str, Any]:
    _validate_skill_inputs(inputs)
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


def _replace_outside_placeholders(val: str, find: str, replace: str) -> tuple[str, int]:
    """Replace `find` only in the literal segments between {{...}} placeholders, never inside
    a placeholder. Protects both a pure `{{id}}` value AND a mixed one like `{{db}}/extra` —
    a naive replace of `db`→`{{db_name}}` on the latter would nest braces into
    `{{{{db_name}}}}/extra`, which no scanner interpolates (audit finding L-3)."""
    out: list[str] = []
    count = 0
    last = 0
    for m in PLACEHOLDER_RE.finditer(val):
        segment = val[last : m.start()]
        count += segment.count(find)
        out.append(segment.replace(find, replace))
        out.append(m.group(0))  # placeholder span left untouched
        last = m.end()
    tail = val[last:]
    count += tail.count(find)
    out.append(tail.replace(find, replace))
    return "".join(out), count


def _replace_in_step(step: dict[str, Any], find: str, replace: str) -> tuple[dict[str, Any], int]:
    """Replace `find` with `replace` inside this step's own `value` field only (never
    selectors/URLs/identity signals — audit finding C1), recursing into if_present branch
    bodies. Only the literal text outside any {{id}} placeholder is touched, so an unrelated
    replace can't corrupt or nest braces inside an existing binding (audit findings M3/L-3)."""
    step = dict(step)
    count = 0
    val = step.get("value")
    if isinstance(val, str) and find in val:
        new_val, seg_count = _replace_outside_placeholders(val, find, replace)
        if seg_count:
            step["value"] = new_val
            count += seg_count
    branch = step.get("branch")
    if isinstance(branch, dict):
        nested = branch.get("steps")
        if isinstance(nested, list):
            new_nested = []
            for nested_step in nested:
                if isinstance(nested_step, dict):
                    nested_step, nested_count = _replace_in_step(nested_step, find, replace)
                    count += nested_count
                new_nested.append(nested_step)
            branch = dict(branch)
            branch["steps"] = new_nested
            step["branch"] = branch
    return step, count


def replace_string_literals_in_skill_document(
    document: dict[str, Any], find: str, replace: str
) -> tuple[dict[str, Any], int]:
    """Replace a literal substring inside every step's `value` field (the recorded user-typed
    content) — never selectors, URLs, identity_bundle signals, or meta, which a blind
    substring replace previously corrupted (audit finding C1). Returns (new_document,
    match_count) so callers can surface a no-op or a large blast radius to the user."""
    if not isinstance(find, str) or not find:
        raise ValueError("find_must_be_nonempty")
    if not isinstance(replace, str):
        raise ValueError("replace_with_must_be_string")
    new_doc = dict(document)
    skills = [dict(s) for s in (new_doc.get("skills") or [])]
    match_count = 0
    if skills:
        block = dict(skills[0])
        steps = list(block.get("steps") or [])
        new_steps = []
        for step in steps:
            if isinstance(step, dict):
                step, count = _replace_in_step(step, find, replace)
                match_count += count
            new_steps.append(step)
        block["steps"] = new_steps
        skills[0] = block
    new_doc["skills"] = skills
    meta = dict(new_doc.get("meta") or {})
    meta["version"] = int(meta.get("version", 1)) + 1
    new_doc["meta"] = meta
    return new_doc, match_count
