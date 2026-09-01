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

from conxa_compile.compiler.input_binding import derive_input_binding
from conxa_core.models.skill_spec import Assertion, HandlerHints, SkillStep, ValidationBlock

_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$")
_DATE_SEP_RE = re.compile(r"[\/\-. ]")
_GENERIC_BINDINGS = {"date", "text"}


def _date_context(ev: dict[str, Any]) -> dict[str, Any]:
    dc = ev.get("date_context")
    return dc if isinstance(dc, dict) else {}


_FIELD_OPEN_ACTIONS = frozenset({"click", "focus"})


def _looks_like_field_open(step: SkillStep, ev: dict[str, Any] | None, field_selector: str) -> bool:
    """True when `step` is the click/focus that opens the field `field_selector` names — the
    day event's own focus-tracked reference to the calendar's anchored input
    (bridge.js::_findAnchoredField), resolved here by selector identity rather than by
    is_editable_target's tag guard.

    "focus", not just "click": `clean_steps` runs before this pass
    (step_anchors.py::_normalize_prep_click_to_focus rewrites a plain click on an editable
    target to `action=focus`), so a click-only check can never match the common case — this
    was a real bug (dates compiled `grid_only` for widgets that had a real anchored field).

    Selector identity, not is_editable_target(ev): the opener may be a non-form element (a
    `<div role="combobox">`, an icon `<button>`) that is_editable_target would always reject.
    `field_selector` comes from bridge.js's `_selectorForElement` (buildStableSelector first,
    buildCssPath fallback); `ev`'s own `selectors.aria` is built the identical way
    (buildAriaSelector tries buildStableSelector first) and `selectors.css` is always
    buildCssPath — so a match on either confirms the same element regardless of which path
    bridge.js took for it.
    """
    if not ev or not field_selector:
        return False
    action = step.action if isinstance(step.action, str) else ""
    if action not in _FIELD_OPEN_ACTIONS:
        return False
    selectors = ev.get("selectors") or {}
    return field_selector in (str(selectors.get("aria") or ""), str(selectors.get("css") or ""))


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


_MACHINE_CELL_ATTRS = {"data-date", "datetime", "data-day", "data-value"}


def _cell_assertion_target(cell_attr: str, value_token: str) -> str:
    """selector_present target for the grid_only case (no anchored field to read a value back
    from) — built from the run's OWN {{binding}} token, not the recorded date, so it checks
    whatever date the caller actually picked. Only possible for a machine cell attribute
    (its value is the ISO date the token interpolates to verbatim); a day-number text fallback
    (`:text-is("15")`) has no equivalent — interpolating a full ISO string into a bare day
    number can't work, and the picked value is otherwise unverifiable here, so this returns ""
    and the run ships with no compile-time assertion. That is not a silent hole: the runtime's
    grid drive (runtime/app/date_picker.js) already throws when it cannot land the click on
    the target date, which is the real post-condition for this case."""
    if cell_attr in _MACHINE_CELL_ATTRS and value_token:
        return f'[{cell_attr}="{value_token}"]'
    return ""


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
    # Post-condition: NOT a compile-time value_equals against the field. An anchored field's
    # own display formatting (MM/DD/YYYY, ...) is only knowable at replay — the runtime already
    # verifies it there (handlers.js's typed-first attempt, format-aware via _dateValueMatches,
    # now throws on a mismatched readback instead of returning silently) — and baking the
    # RECORDED date in as `expected` here made every run with a caller-supplied date fail
    # VERIFY even after a correct pick. One verifier, in the one place that knows both the
    # field's format and the caller's actual input.
    #
    # grid_only (no anchored field) keeps a best-effort compile-time assertion, built from the
    # run's OWN {{binding}} token rather than the recorded date — but only when the cell carries
    # a machine attribute whose value the token can interpolate into verbatim. Otherwise (a
    # day-number text cell) there is no assertion; the runtime's grid drive already throws when
    # it can't land the click on the target date, which is the real post-condition there too.
    #
    # Base step's own inherited validation (built by _build_assertions for whatever action this
    # step was before the collapse) is always cleared: it describes a step that no longer exists.
    assertions: list[Assertion] = []
    if not hints.get("open"):
        cell_target = _cell_assertion_target(str(hints.get("cell_attr") or ""), str(step.value or ""))
        if cell_target:
            assertions.append(Assertion(type="selector_present", target=cell_target, timeout_ms=5000, required=True))
    step.validation = ValidationBlock(
        wait_for=step.validation.wait_for,
        success_conditions=step.validation.success_conditions,
        assertions=assertions,
    )
    return step


def _collapse_one(
    steps: list[SkillStep],
    events: list[dict[str, Any]],
    day_idxs: list[int],
    time_idx: int | None,
    year_select_idx: int | None,
    month_select_idx: int | None,
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
    # Derived from whether an anchored field exists at all (hints["open"], below), not from
    # whether a preceding step happened to fold into open_step: those answer different
    # questions (M3) — the runtime reads strategy as "is there an anchored field to type
    # into", and a range's second leg (open_step is always None — see the range branch below)
    # still shares the first leg's real field.
    strategy = "typed_first" if field_selector else "grid_only"

    # A year/month <select> in the run replaces click-through nav entirely for THIS run — the
    # runtime drives it via selectOption() (see runtime/app/date_picker.js), never the prev/next
    # click loop, so there's nothing to reconcile between the two strategies within one step.
    year_select_selector = str(_date_context(events[year_select_idx]).get("select") or "") if year_select_idx is not None else ""
    month_select_selector = str(_date_context(events[month_select_idx]).get("select") or "") if month_select_idx is not None else ""

    def hints_for(cell_selector: str, cell_attr: str, kind: str) -> dict[str, Any]:
        h: dict[str, Any] = {
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
        if year_select_selector:
            h["year_select"] = year_select_selector
        if month_select_selector:
            h["month_select"] = month_select_selector
        return h

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
    """Find maximal runs of consecutive click/select steps whose events share a
    `date_context.grid` selector — [field click]? + [nav clicks | year/month <select>]* +
    [day cell] (+ [time option]) (+ [day cell] for a range) — and replace each run with one or
    two `date_pick` steps. Any run without at least one day-cell pick (e.g. the grid was opened
    and navigated — including via a year/month select — but never actually picked from) is left
    untouched; this pass can only improve a compile, never regress one."""
    n = min(len(steps), len(events))
    out: list[SkillStep] = []
    i = 0
    while i < n:
        dc = _date_context(events[i])
        role = dc.get("role")
        grid = str(dc.get("grid") or "")
        if role not in ("day", "nav", "year_select", "month_select") or not grid:
            out.append(steps[i])
            i += 1
            continue

        run_end = i
        j = i + 1
        while j < n:
            dcj = _date_context(events[j])
            if dcj.get("grid") != grid or dcj.get("role") not in (
                "day", "nav", "time", "year_select", "month_select",
            ):
                break
            run_end = j
            j += 1
        run_range = range(i, run_end + 1)
        day_idxs = [k for k in run_range if _date_context(events[k]).get("role") == "day"]

        if not day_idxs:
            # Nav/select activity with no day ever picked (grid opened, month/year set, browsed,
            # closed unpicked) — nothing to collapse; leave the raw steps exactly as they
            # compiled. Fix 1 (pipeline/dedupe.py) and the bridge.js label guard already keep
            # these clean on their own — a select-driven month/year change no longer produces
            # click/type noise or a garbage "august_2026"-shaped input name, it just stays as an
            # ordinary, cleanly-bound `select` step.
            out.append(steps[i])
            i += 1
            continue

        time_idx = next((k for k in run_range if _date_context(events[k]).get("role") == "time"), None)
        year_select_idx = next((k for k in run_range if _date_context(events[k]).get("role") == "year_select"), None)
        month_select_idx = next((k for k in run_range if _date_context(events[k]).get("role") == "month_select"), None)

        field_selector = str(_date_context(events[day_idxs[0]]).get("field") or "")

        open_step: SkillStep | None = None
        open_event: dict[str, Any] | None = None
        prev_idx = i - 1
        if out and 0 <= prev_idx < len(events) and _looks_like_field_open(out[-1], events[prev_idx], field_selector):
            open_step = out.pop()
            open_event = events[prev_idx]

        out.extend(_collapse_one(
            steps, events, day_idxs, time_idx, year_select_idx, month_select_idx,
            open_step, open_event, policy,
        ))
        i = run_end + 1

    return out
