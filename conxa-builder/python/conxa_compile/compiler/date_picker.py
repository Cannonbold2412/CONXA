"""Collapse a custom-calendar click run into one parameterized date_pick step.

Native `<input type=date|datetime-local|time|month|week>` never reaches this module — those
compile as an ordinary `date_pick` action straight from the recorder's "change" listener
(bridge.js) and already carry a real value and a durable identity_bundle. This module only
handles the OTHER kind of date picker: a custom calendar widget (MUI, react-datepicker,
flatpickr, Ant Design, jQuery UI, ...) that records as several unrelated `click` steps — open
the field, "next month" x N, day cell — each tagged with `date_context` by
bridge.js::buildDateContext. Left alone, that run is unreplayable: the month-nav count is frozen
to whatever the recording needed that day, and the day-cell text ("15") is ambiguous against the
greyed overflow days from the adjacent month. See CLAUDE.md's date-picker plan for the full
design.

Runs as a post-pass over the already-built SkillStep list, modelled on
upload_binding.apply_bindings_to_compiled_steps: it needs steps[i] aligned 1:1 with events[i],
which only holds up to the point build.py calls this (right after _populate_hover_chains, before
_insert_start_navigate_step prepends a synthetic step with no matching event).
"""

from __future__ import annotations

import re
from typing import Any

from conxa_compile.compiler.action_semantics import is_editable_target
from conxa_compile.compiler.input_binding import derive_input_binding
from conxa_core.models.skill_spec import Assertion, HandlerHints, SkillStep, ValidationBlock

_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$")
_DATE_SEP_RE = re.compile(r"[\/\-. ]")
_GENERIC_BINDINGS = {"date", "text"}


def _date_context(ev: dict[str, Any]) -> dict[str, Any]:
    dc = ev.get("date_context")
    return dc if isinstance(dc, dict) else {}


def _looks_like_field_open(step: SkillStep, ev: dict[str, Any] | None) -> bool:
    """True when `step` is a plain click on the input/combobox a calendar grid belongs to —
    the step immediately preceding a date_context run in the common case where the grid renders
    asynchronously after the click that opens it (so the click itself never carries date_context)."""
    if not ev:
        return False
    action = step.action if isinstance(step.action, str) else ""
    if action != "click":
        return False
    return is_editable_target(ev)


def _normalize_time(text: str) -> str:
    m = _TIME_RE.match(text.strip())
    if not m:
        return ""
    hour = int(m.group(1))
    minute = m.group(2)
    ampm = (m.group(3) or "").lower()
    if ampm == "pm" and hour != 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute}"


_CELL_DISABLED_EXCLUDE = [
    '[aria-disabled="true"]', '[aria-hidden="true"]',
    '[class*="disabled" i]', '[class*="outside" i]', '[class*="other-month" i]',
    '[class*="prev-month" i]', '[class*="next-month" i]', '[class*="adjacent" i]',
]
_MACHINE_CELL_ATTRS = {"data-date", "datetime", "data-day", "data-value"}


def _day_number_selector(day: int) -> str:
    """Mirrors runtime/app/date_picker.js::dayNumberSelector exactly (kept in lockstep — this is
    the compile-time twin, used only to build the grid_only assertion target below)."""
    exclude = "".join(f":not({sel})" for sel in _CELL_DISABLED_EXCLUDE)
    return f'{exclude}:text-is("{day}")'


def _cell_assertion_target(cell_attr: str, iso_value: str) -> str:
    """selector_present target for the grid_only case (no anchored field to read a value back
    from) — rebuilds a selector for the TARGET date rather than reusing the recorded cell's own
    selector, which (an aria-label sentence, most often) is only ever valid for the day it was
    recorded on."""
    date_part = iso_value.split("T", 1)[0]
    if cell_attr in _MACHINE_CELL_ATTRS and date_part:
        return f'[{cell_attr}="{date_part}"]'
    try:
        day = int(date_part.rsplit("-", 1)[-1])
    except (ValueError, IndexError):
        return ""
    return _day_number_selector(day)


def _format_value_for_display(iso_value: str, display_format: str) -> str:
    """Mirrors runtime/app/date_picker.js::formatForDisplay. The field's own display formatting
    (MM/DD/YYYY, ...) — not the ISO literal — is what a successful pick actually reads back as, so
    that's what the value_equals assertion below must expect."""
    if not display_format:
        return iso_value
    date_part = iso_value.split("T", 1)[0]
    try:
        year, month, day = date_part.split("-")
    except ValueError:
        return iso_value
    out = display_format
    if "YYYY" in out:
        out = out.replace("YYYY", year)
    elif "YY" in out:
        out = out.replace("YY", year[-2:])
    if "MM" in out:
        out = out.replace("MM", month)
    if "DD" in out:
        out = out.replace("DD", day)
    return out


def _infer_display_format(display_value: str | None, iso_date: str | None) -> str:
    """Best-effort guess at the field's display format ("MM/DD/YYYY") from the field's post-pick
    readback, by matching each display token against the day/month/year of the picked ISO date.
    Ambiguous when the day and month are numerically equal (e.g. picking the 9th of September) —
    acceptable, since the runtime's typed-first attempt always falls back to driving the grid."""
    if not display_value or not iso_date:
        return ""
    try:
        year, month, day = iso_date.split("-")
    except ValueError:
        return ""
    sep_match = _DATE_SEP_RE.search(display_value)
    sep = sep_match.group(0) if sep_match else "/"
    parts = [p.strip() for p in _DATE_SEP_RE.split(display_value) if p.strip()]
    if len(parts) != 3:
        return ""
    month_digits = month.lstrip("0") or "0"
    day_digits = day.lstrip("0") or "0"
    tokens: list[str] = []
    for part in parts:
        stripped = part.lstrip("0") or "0"
        if part == year:
            tokens.append("YYYY")
        elif len(part) == 2 and part == year[-2:]:
            tokens.append("YY")
        elif stripped == month_digits:
            tokens.append("MM")
        elif stripped == day_digits:
            tokens.append("DD")
        else:
            tokens.append("")
    if all(tokens):
        return sep.join(tokens)
    return ""


def _binding_for(open_event: dict[str, Any] | None, iso_value: str, policy: dict[str, Any], fallback_name: str) -> tuple[str, str]:
    """Reuse derive_input_binding's label→placeholder→aria_label priority ladder against the
    anchored field's own recorded target (when one was found) so a "Due Date" field still binds
    to {{due_date}} instead of a generic name. Falls back to `fallback_name` when no field was
    identified, or when the ladder's own last-resort input_type guess ("date"/"text") fires."""
    target = (open_event or {}).get("target") or {}
    synthetic_ev = {
        "action": {"action": "date_pick", "value": iso_value},
        "target": target,
        "semantic": {"input_type": "date"},
    }
    value, binding = derive_input_binding(synthetic_ev, policy)
    if binding and binding not in _GENERIC_BINDINGS:
        return str(value), binding
    return f"{{{{{fallback_name}}}}}", fallback_name


def _make_date_pick_step(
    base: SkillStep,
    open_event: dict[str, Any] | None,
    iso_value: str,
    policy: dict[str, Any],
    *,
    fallback_name: str,
    hints: dict[str, Any],
) -> SkillStep:
    step = base.model_copy(deep=True)
    step.action = "date_pick"
    step.intent = "pick_date"
    value, binding = _binding_for(open_event, iso_value, policy, fallback_name)
    step.value = value
    step.input_binding = binding
    step.handler_hints = HandlerHints(
        hover_chain=base.handler_hints.hover_chain,
        virtualized_container=base.handler_hints.virtualized_container,
        allow_forced_action=base.handler_hints.allow_forced_action,
        control_kind="date_picker",
        # recorded_value: the picked ISO date/datetime, read by
        # workflow_mutations.reconcile_inputs_with_step_values to seed the auto-declared input's
        # `default` — the value/input_binding fields above only ever hold the {{placeholder}}
        # token, never the literal, once a binding name was found.
        date_picker={**hints, "recorded_value": iso_value},
    )
    # Enforced post-condition — mirrors the value_equals assertion _build_assertions gives every
    # other value-set action, and is what lets VERIFY happen on the field's value instead of on
    # the click landing correctly. Two shapes, matching handler_hints.date_picker.open (the field
    # selector, present whenever a field was actually found — including a range's second leg,
    # which shares the first leg's field even though it has no separate "open" click):
    #   - a field exists: value_equals against the field's OWN display formatting (a successful
    #     pick reads back "09/15/2026", never the raw ISO literal, on most widgets).
    #   - no field (an inline always-visible calendar, handler_hints.strategy == "grid_only"):
    #     selector_present against a freshly-built selector for the TARGET date, never the
    #     recorded cell's own selector (an aria-label sentence, most often) — that one is only
    #     ever valid for the day it was recorded on.
    field_selector = str(hints.get("open") or "")
    if field_selector:
        expected = _format_value_for_display(iso_value, str(hints.get("display_format") or ""))
        step.validation = ValidationBlock(
            wait_for=step.validation.wait_for,
            success_conditions=step.validation.success_conditions,
            assertions=[
                Assertion(type="value_equals", target=field_selector, expected=expected, timeout_ms=5000, required=True)
            ],
        )
    else:
        cell_target = _cell_assertion_target(str(hints.get("cell_attr") or ""), iso_value)
        if cell_target:
            step.validation = ValidationBlock(
                wait_for=step.validation.wait_for,
                success_conditions=step.validation.success_conditions,
                assertions=[
                    Assertion(type="selector_present", target=cell_target, timeout_ms=5000, required=True)
                ],
            )
    return step


def _collapse_one(
    steps: list[SkillStep],
    events: list[dict[str, Any]],
    day_idxs: list[int],
    time_idx: int | None,
    open_step: SkillStep | None,
    open_event: dict[str, Any] | None,
    policy: dict[str, Any],
) -> list[SkillStep]:
    first_dc = _date_context(events[day_idxs[0]])
    header_selector = str(first_dc.get("header") or "")
    header_text = str(first_dc.get("header_text") or "")
    grid_selector = str(first_dc.get("grid") or "")
    prev_selector = str(first_dc.get("prev") or "")
    next_selector = str(first_dc.get("next") or "")
    field_selector = str(first_dc.get("field") or "")
    display_value = first_dc.get("field_display_value")
    display_format = _infer_display_format(display_value, first_dc.get("iso_date"))
    strategy = "typed_first" if open_step is not None else "grid_only"

    def hints_for(cell_selector: str, cell_attr: str, kind: str) -> dict[str, Any]:
        return {
            "open": field_selector,
            "grid": grid_selector,
            "header": header_selector,
            "header_text": header_text,
            "prev": prev_selector,
            "next": next_selector,
            "cell": cell_selector,
            "cell_attr": cell_attr,
            "display_format": display_format,
            "kind": kind,
            "strategy": strategy,
        }

    if len(day_idxs) >= 2:
        start_ev = events[day_idxs[0]]
        end_ev = events[day_idxs[-1]]
        start_dc = _date_context(start_ev)
        end_dc = _date_context(end_ev)
        start_hints = hints_for(str(start_dc.get("cell") or ""), str(start_dc.get("cell_attr") or ""), "range")
        start_hints["role"] = "range_start"
        end_hints = hints_for(str(end_dc.get("cell") or ""), str(end_dc.get("cell_attr") or ""), "range")
        end_hints["role"] = "range_end"
        start_step = _make_date_pick_step(
            open_step or steps[day_idxs[0]], open_event, str(start_dc.get("iso_date") or ""), policy,
            fallback_name="start_date", hints=start_hints,
        )
        # The range's second leg always finds the grid already open on the start date's month —
        # no separate "open" click to fold in, so its base step comes straight from its own
        # compiled day-cell step. It still shares the first leg's field selector (start_hints/
        # end_hints both carry the same `open` value from hints_for), so its assertion still
        # checks the field, not the (unreusable) recorded cell selector.
        end_step = _make_date_pick_step(
            steps[day_idxs[-1]], None, str(end_dc.get("iso_date") or ""), policy,
            fallback_name="end_date", hints=end_hints,
        )
        return [start_step, end_step]

    day_ev = events[day_idxs[0]]
    day_dc = _date_context(day_ev)
    iso = str(day_dc.get("iso_date") or "")
    kind = "single"
    if time_idx is not None:
        time_text = str(_date_context(events[time_idx]).get("time") or "")
        normalized_time = _normalize_time(time_text)
        if normalized_time:
            iso = f"{iso}T{normalized_time}"
            kind = "datetime"
    hints = hints_for(str(day_dc.get("cell") or ""), str(day_dc.get("cell_attr") or ""), kind)
    if time_idx is not None:
        hints["time_option"] = str(_date_context(events[time_idx]).get("time") or "")
    step = _make_date_pick_step(
        open_step or steps[day_idxs[0]], open_event, iso, policy,
        fallback_name="due_datetime" if kind == "datetime" else "due_date",
        hints=hints,
    )
    return [step]


def collapse_date_picker_runs(
    steps: list[SkillStep],
    events: list[dict[str, Any]],
    policy: dict[str, Any],
) -> list[SkillStep]:
    """Find maximal runs of consecutive click steps whose events share a `date_context.grid`
    selector — [field click]? + [nav clicks]* + [day cell] (+ [time option]) (+ [day cell] for a
    range) — and replace each run with one or two `date_pick` steps. Any run without at least one
    day-cell pick (e.g. the grid was opened and navigated but never actually picked from) is left
    untouched; this pass can only improve a compile, never regress one."""
    n = min(len(steps), len(events))
    out: list[SkillStep] = []
    i = 0
    while i < n:
        dc = _date_context(events[i])
        role = dc.get("role")
        grid = str(dc.get("grid") or "")
        if role not in ("day", "nav") or not grid:
            out.append(steps[i])
            i += 1
            continue

        run_end = i
        j = i + 1
        while j < n:
            dcj = _date_context(events[j])
            if dcj.get("grid") != grid or dcj.get("role") not in ("day", "nav", "time"):
                break
            run_end = j
            j += 1
        run_range = range(i, run_end + 1)
        day_idxs = [k for k in run_range if _date_context(events[k]).get("role") == "day"]

        if not day_idxs:
            # Pure nav clicks with no day ever picked (grid opened, browsed, closed unpicked) —
            # nothing to collapse; leave the raw clicks exactly as they compiled.
            out.append(steps[i])
            i += 1
            continue

        time_idx = next((k for k in run_range if _date_context(events[k]).get("role") == "time"), None)

        open_step: SkillStep | None = None
        open_event: dict[str, Any] | None = None
        prev_idx = i - 1
        if out and 0 <= prev_idx < len(events) and _looks_like_field_open(out[-1], events[prev_idx]):
            open_step = out.pop()
            open_event = events[prev_idx]

        out.extend(_collapse_one(steps, events, day_idxs, time_idx, open_step, open_event, policy))
        i = run_end + 1

    return out
