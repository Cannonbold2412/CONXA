"""Validate editor patches before persisting (selectors, intent, destructive pairing)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from conxa_compile.compiler.action_semantics import action_name, commit_intent_hit, is_editable_field_click
from conxa_compile.compiler.destructive_semantics import destructive_compiler_step
from conxa_compile.compiler.intent_access import get_effective_intent_from_skill_step
from conxa_compile.compiler.patch import deep_merge
from conxa_compile.compiler.selector_filters import selector_passes_filters
from conxa_compile.compiler.wait_for_shape import destructive_wait_for_is_non_none
from conxa_compile.editor.action_registry import action_spec, is_supported_action
from conxa_compile.editor.placeholder_grammar import FULL_PLACEHOLDER_RE, LOOSE_BRACE_RE
from conxa_compile.editor.step_view import skill_step_for_destructive_check
from conxa_compile.policy.intent_ontology import sanitize_intent_token


def _validate_value_placeholders(value: str) -> None:
    """Reject a step-value edit containing a malformed {{...}} attempt (hyphens, digits-first,
    empty, etc.) rather than silently persisting text `interpolate()` will never substitute
    (see CONXA replace-variable audit finding M5/C3)."""
    for match in LOOSE_BRACE_RE.finditer(value):
        if not FULL_PLACEHOLDER_RE.match(match.group(0)):
            raise ValueError(f"invalid_placeholder_syntax:{match.group(0)}")


def _merge_step_shell(step: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(step)
    for key in (
        "target",
        "signals",
        "frame",
        "validation",
        "recovery",
        "confidence_protocol",
        "decision_policy",
    ):
        if key in patch and isinstance(patch[key], dict):
            base = out.get(key) or {}
            out[key] = deep_merge(dict(base), dict(patch[key]))
    if "action" in patch and isinstance(patch["action"], dict):
        current = out.get("action")
        base = dict(current) if isinstance(current, dict) else {"action": str(current or "")}
        out["action"] = deep_merge(base, dict(patch["action"]))
    if "intent" in patch and isinstance(patch["intent"], str):
        out["intent"] = str(patch["intent"]).strip()
        signals = dict(out.get("signals") or {})
        sem = dict(signals.get("semantic") or {})
        resolved = out["intent"]
        if resolved:
            sem["final_intent"] = resolved
            sem["llm_intent"] = resolved
        signals["semantic"] = sem
        out["signals"] = signals
    if "value" in patch:
        out["value"] = patch["value"]
        # Keep input_binding in sync with the edited value instead of leaving it stale: a
        # human edit that turns {{old_name}} into {{new_name}} (or into plain literal text)
        # must not leave input_binding still pointing at "old_name" (audit finding L0).
        new_value = patch["value"]
        if isinstance(new_value, str):
            full_match = FULL_PLACEHOLDER_RE.match(new_value.strip())
            out["input_binding"] = full_match.group(1) if full_match else None
        else:
            out["input_binding"] = None
    if "url" in patch and isinstance(patch["url"], str):
        out["url"] = str(patch["url"]).strip()
    return out


def _validate_frame_patch(raw: Any) -> None:
    if raw is None:
        return
    if not isinstance(raw, dict):
        raise ValueError("frame_must_be_object")
    chain = raw.get("chain")
    if chain in (None, []):
        return
    if not isinstance(chain, list):
        raise ValueError("frame_chain_must_be_array")
    for index, item in enumerate(chain):
        if not isinstance(item, dict):
            raise ValueError(f"frame_chain_{index}_must_be_object")
        selector = str(item.get("selector") or "").strip()
        if not selector:
            raise ValueError(f"frame_chain_{index}_selector_required")
        lowered = selector.lower()
        if lowered.startswith(("/", "./", "//")) or "xpath" in lowered:
            raise ValueError(f"frame_chain_{index}_selector_must_not_be_xpath")
        fallbacks = item.get("fallback_selectors") or []
        if not isinstance(fallbacks, list):
            raise ValueError(f"frame_chain_{index}_fallback_selectors_must_be_array")
        for fb in fallbacks:
            fb_text = str(fb or "").strip()
            if fb_text.lower().startswith(("/", "./", "//")) or "xpath" in fb_text.lower():
                raise ValueError(f"frame_chain_{index}_fallback_selector_must_not_be_xpath")


def _coerce_scroll_delta(raw: Any) -> int:
    if raw is None:
        raise ValueError("scroll_amount_required")
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("scroll_amount_must_be_integer") from exc


def _coerce_branch_timeout_ms(raw: Any) -> None:
    if raw is None:
        return
    try:
        timeout = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("branch_timeout_ms_must_be_integer") from exc
    if timeout < 0 or timeout > 60000:
        raise ValueError("branch_timeout_ms_out_of_range")


def _validate_branch_patch(kind: str, raw: Any) -> None:
    """Validate a patch to step["branch"] (if_present/try_dismiss/wait_for_one_of — EXEC-1).

    Nested `if_present` body steps are NOT edited through this key — they're structural
    (insert/delete/reorder RPCs mirroring the top-level ones) plus per-nested-step patches
    addressed by `path` (see cmd_patch_step), so any `steps` content here is rejected to avoid
    a blind deep-merge clobbering edits made through that path-addressed flow. `wait_for_one_of`
    option bodies are read-only this pass (see StepEditorDTO.branch_summary's `options` — full
    per-option step editing is an explicit follow-up), so a `steps` key on any option is rejected
    too, keeping that boundary honest rather than silently accepting content nothing renders.
    """
    if raw is None:
        return
    if not isinstance(raw, dict):
        raise ValueError("branch_must_be_object")
    _coerce_branch_timeout_ms(raw.get("timeout_ms"))

    if kind == "if_present":
        if "steps" in raw:
            raise ValueError("branch_if_present_steps_not_patchable_here")
        return

    if kind == "try_dismiss":
        candidates = raw.get("candidates")
        if candidates is not None:
            if not isinstance(candidates, list):
                raise ValueError("branch_candidates_must_be_array")
            for i, c in enumerate(candidates):
                text = str(c or "").strip()
                if text and not selector_passes_filters(text):
                    raise ValueError(f"branch_candidate_{i}_failed_quality_gates")
        fallback_escape = raw.get("fallback_escape")
        if fallback_escape is not None and not isinstance(fallback_escape, bool):
            raise ValueError("branch_fallback_escape_must_be_boolean")
        return

    if kind == "wait_for_one_of":
        options = raw.get("options")
        if options is not None:
            if not isinstance(options, list):
                raise ValueError("branch_options_must_be_array")
            for i, opt in enumerate(options):
                if not isinstance(opt, dict):
                    raise ValueError(f"branch_option_{i}_must_be_object")
                if "steps" in opt:
                    raise ValueError(f"branch_option_{i}_steps_not_patchable_here")
                selector = str(opt.get("selector") or "").strip()
                if not selector:
                    raise ValueError(f"branch_option_{i}_selector_required")
                if not selector_passes_filters(selector):
                    raise ValueError(f"branch_option_{i}_selector_failed_quality_gates")
        required = raw.get("required")
        if required is not None and not isinstance(required, bool):
            raise ValueError("branch_required_must_be_boolean")


def validate_editor_patch(
    step: dict[str, Any],
    patch: dict[str, Any],
    policy: dict[str, Any],
    *,
    in_branch_body: bool = False,
) -> None:
    """Raise ValueError with a human-readable message if the patch is not allowed.

    `in_branch_body=True` marks a patch to a nested step inside another step's branch body
    (if_present's `branch.steps[j]`, addressed via cmd_patch_step's `path` parameter). Branch
    bodies run best-effort and never enter the Tier 1-4 recovery cascade (CLAUDE.md Key
    Invariants), so a nested step's `recovery`/`validation` blocks are meaningless there and any
    attempt to patch them is rejected rather than silently accepted.
    """
    if in_branch_body and ("recovery" in patch or "validation" in patch):
        raise ValueError("branch_body_step_cannot_patch_recovery_or_validation")

    if "value" in patch and isinstance(patch.get("value"), str):
        _validate_value_placeholders(patch["value"])

    if "frame" in patch:
        _validate_frame_patch(patch.get("frame"))

    merged = _merge_step_shell(step, patch)

    if "intent" in patch:
        raw = str(patch.get("intent") or "").strip()
        if not raw:
            raise ValueError("intent_empty")
        if not sanitize_intent_token(raw, ""):
            raise ValueError("invalid_intent_slug")

    act = action_name(merged).lower()
    spec = action_spec(act)
    if not is_supported_action(act):
        raise ValueError("unsupported_action_kind")
    if spec.marker:
        invalid_keys = sorted(set(patch))
        if invalid_keys:
            raise ValueError("recording_marker_steps_are_read_only")
        return
    if act == "navigate":
        invalid_keys = sorted(set(patch) - {"intent", "action", "url", "validation", "recovery", "frame"})
        if invalid_keys:
            raise ValueError("navigate_step_allows_only_url_intent_validation_recovery")
        action_patch = patch.get("action")
        url = ""
        if isinstance(action_patch, dict):
            url = str(action_patch.get("url") or "").strip()
        url = url or str(patch.get("url") or merged.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            raise ValueError("navigate_url_must_be_http_url")
        return
    if act == "scroll":
        invalid_keys = sorted(set(patch) - {"intent", "action", "frame"})
        if invalid_keys:
            raise ValueError("scroll_step_allows_only_intent_and_action")
        action_patch = patch.get("action")
        if not isinstance(action_patch, dict):
            raise ValueError("scroll_action_patch_required")
        if str(action_patch.get("action") or "scroll").strip().lower() != "scroll":
            raise ValueError("scroll_action_kind_invalid")
        selector = str(action_patch.get("selector") or "").strip()
        if selector:
            if not selector_passes_filters(selector):
                raise ValueError("scroll_selector_failed_quality_gates")
        else:
            delta = _coerce_scroll_delta(action_patch.get("delta"))
            if abs(delta) > 20000:
                raise ValueError("scroll_amount_out_of_range")
        return
    if act in {"wait", "screenshot"}:
        invalid_keys = sorted(set(patch) - {"intent", "action", "validation", "recovery", "value", "frame"})
        if invalid_keys:
            raise ValueError(f"{act}_step_allows_only_action_intent_validation_recovery")
    if act in {"check", "assert"}:
        invalid_keys = sorted(
            set(patch)
            - {
                "intent",
                "action",
                "check_kind",
                "check_pattern",
                "check_threshold",
                "check_selector",
                "check_text",
                "signals",
                "recovery",
                "frame",
            }
        )
        if invalid_keys:
            raise ValueError("check_step_allows_only_check_fields")
    if act in {"if_present", "try_dismiss", "wait_for_one_of"}:
        invalid_keys = sorted(
            set(patch) - {"intent", "action", "target", "frame", "branch", "validation", "recovery"}
        )
        if invalid_keys:
            raise ValueError("branch_step_allows_only_target_branch_intent_validation_recovery_frame")
        if "branch" in patch:
            _validate_branch_patch(act, patch.get("branch"))
    if act != "scroll":
        eff = get_effective_intent_from_skill_step(merged) or str(merged.get("intent") or "").strip()
        if not eff.strip():
            raise ValueError("intent_required_for_non_scroll_step")

    tgt = merged.get("target") if isinstance(merged.get("target"), dict) else {}
    primary = str(tgt.get("primary_selector") or "").strip()
    if primary and not selector_passes_filters(primary):
        raise ValueError("primary_selector_failed_quality_gates")
    for fb in tgt.get("fallback_selectors") or []:
        s = str(fb).strip()
        if s and not selector_passes_filters(s):
            raise ValueError("fallback_selector_failed_quality_gates")

    view = skill_step_for_destructive_check(merged)
    if destructive_compiler_step(view, policy):
        wf = (merged.get("validation") or {}).get("wait_for") or {}
        wf_d = dict(wf) if isinstance(wf, dict) else {}
        if not destructive_wait_for_is_non_none(wf_d):
            raise ValueError("destructive_step_requires_non_none_wait_for")
        anchors = (merged.get("signals") or {}).get("anchors") or []
        if not anchors:
            raise ValueError("destructive_step_requires_signals_anchors")

    # Any consequential action must retain at least one enforced (required=True) post-condition
    # assertion after the edit — mirrors the destructive wait_for invariant above. Prevents a
    # human edit (e.g. clearing validation.assertions) from silently dropping the check that
    # confirms the action actually produced its intended result.
    #
    # Only enforced when there is something to protect: either the patch explicitly touches
    # `validation` (the Human Editor's Validation phase), or the step already carried a required
    # assertion before this edit. This keeps packs compiled before enforced post-conditions
    # existed editable via unrelated patches (intent rename, retarget) without forcing a
    # recompile — see the plan's backward-compatibility decision.
    consequential_input = act in {"fill", "type", "select", "select_option"} and bool(merged.get("value"))
    consequential_click = (
        act == "click"
        and not is_editable_field_click(view)
        and (commit_intent_hit(view, policy) or destructive_compiler_step(view, policy))
    )
    if consequential_input or consequential_click:
        def _has_required(step_dict: dict[str, Any]) -> bool:
            assertions = (step_dict.get("validation") or {}).get("assertions") or []
            return any(isinstance(a, dict) and a.get("required", True) is not False for a in assertions)

        if ("validation" in patch or _has_required(step)) and not _has_required(merged):
            raise ValueError("consequential_step_requires_required_assertion")
