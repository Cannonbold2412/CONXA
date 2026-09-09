"""The compiler's second opinion (BUILD-25).

One whole-workflow LLM call decides four things no per-step rule can decide
correctly (llm/workflow_semantics.py), and compiler/second_opinion.py writes
them onto the compiled steps. Human Review is the gate — a reviewer sees
finished work and edits a wrong call there, so these tests cover the two things
that must hold for that to be safe:

  1. What the pass writes is confined to meaning — binding names, value
     placeholders, phase, optionality. Never a selector, an identity bundle, or
     an assertion (CLAUDE.md: "LLM does not write selector strings on the
     primary compile path").
  2. Disabled / failed / empty all fall back to the rules-only compile, which
     must be byte-identical to a compile that never ran the pass at all.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from typing import Any
from unittest.mock import patch

from PIL import Image

from conxa_core.config import settings
from conxa_core.models.skill_spec import SkillStep
from conxa_compile.compiler.second_opinion import (
    apply_second_opinion,
    build_try_dismiss_from_hint,
    rewrite_placeholder,
)
from conxa_compile.compiler.step_key import step_keys
from conxa_compile.llm.workflow_semantics import _validate_findings


def _minimal_click_event() -> dict:
    return {
        "action": {"action": "click", "timestamp": "2026-01-01T00:00:00Z", "value": None},
        "target": {
            "tag": "button", "id": "submit", "classes": ["btn"], "inner_text": "  Submit  ",
            "role": "button", "aria_label": None, "name": None,
        },
        "selectors": {"css": "#submit", "xpath": "/button[1]", "text_based": 'text="Submit"', "aria": '[role="button"]'},
        "context": {"parent": "form#f", "siblings": [], "index_in_parent": 0, "form_context": "form#f"},
        "semantic": {"normalized_text": "submit", "role": "button", "input_type": None, "intent_hint": "activate_control"},
        "anchors": [{"element": "h1", "relation": "above"}],
        "visual": {
            "full_screenshot": "images/evt_0001_full.jpg", "element_snapshot": "images/evt_0001_element.jpg",
            "bbox": {"x": 10, "y": 20, "w": 80, "h": 32}, "viewport": "800x600", "scroll_position": "0,0",
            "timestamp_ms": 0,
        },
        "page": {"url": "https://example.com/app", "title": "App"},
        "state_change": {"before": "aaa", "after": "bbb"},
        "timing": {"wait_for": "load", "timeout": 5000},
        "ancestors": [], "surrounding_text": "", "snapshot": {"ref": "", "dom_hash": ""}, "extras": {},
    }


_VISION_ANCHOR_OK = {
    "primary_phrase": "Submit control in form",
    "secondary": [{"element": "login form", "relation": "inside"}],
}


class _FakeRouter:
    pool = (object(),)

    def route_text(self, *a, **k):
        return None

    def route_vision(self, *a, **k):
        return None

    def stats(self):
        return {}


def _compile_fixture(session_id: str, events: list[dict]):
    data_dir = Path(tempfile.mkdtemp())
    for ev in events:
        rel = str(ev["visual"]["full_screenshot"])
        dest = data_dir / "sessions" / session_id / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (320, 240), (210, 210, 210)).save(dest, "JPEG")
    return data_dir, (
        patch.object(settings, "data_dir", data_dir),
        patch("conxa_core.llm._router", _FakeRouter()),
        patch("conxa_compile.llm.intent_llm.call_llm", return_value=None),
        patch("conxa_compile.llm.anchor_vision_llm.call_llm", return_value=_VISION_ANCHOR_OK),
    )


def _type_step(**kw: Any) -> SkillStep:
    return SkillStep(action={"action": "type"}, **kw)


class SecondOpinionCompileTests(unittest.TestCase):
    """The pass, end to end through compile_skill_package."""

    def _compile(self, semantics_patch=None):
        from conxa_compile.compiler.build import compile_skill_package
        from conxa_compile.pipeline.run import run_pipeline

        evs = run_pipeline([_minimal_click_event()])
        data_dir, patchers = _compile_fixture("sess", evs)
        try:
            with ExitStack() as stack:
                for p in patchers:
                    stack.enter_context(p)
                if semantics_patch is not None:
                    stack.enter_context(semantics_patch)
                return compile_skill_package(
                    evs, skill_id="skill_test", source_session_id="sess", title="t", version=1,
                )
        finally:
            shutil.rmtree(data_dir, ignore_errors=True)

    def _assert_rules_only(self, pkg) -> None:
        """A compile that fell back to the rules-only route leaves no trace."""
        self.assertNotIn("second_opinion", pkg.compile_report)
        self.assertEqual({s.phase for s in pkg.skills[0].steps}, {""})

    def test_disabled_flag_falls_back_to_rules_only(self) -> None:
        with patch.object(settings, "llm_semantic_suggestions_enabled", False):
            pkg = self._compile()
        self._assert_rules_only(pkg)

    def test_pass_failure_degrades_without_raising(self) -> None:
        boom = patch(
            "conxa_compile.llm.workflow_semantics.build_second_opinion",
            side_effect=RuntimeError("provider pool drained"),
        )
        pkg = self._compile(semantics_patch=boom)
        self._assert_rules_only(pkg)

    def test_empty_response_falls_back_to_rules_only(self) -> None:
        empty = patch("conxa_compile.llm.workflow_semantics.build_second_opinion", return_value=[])
        pkg = self._compile(semantics_patch=empty)
        self._assert_rules_only(pkg)

    def test_disabled_and_failed_compiles_are_byte_identical(self) -> None:
        """The one byte-identity claim that survives this feature: every route
        that does NOT apply anything must produce the same package."""
        with patch.object(settings, "llm_semantic_suggestions_enabled", False):
            disabled = self._compile()
        failed = self._compile(
            semantics_patch=patch(
                "conxa_compile.llm.workflow_semantics.build_second_opinion",
                side_effect=RuntimeError("provider pool drained"),
            )
        )
        self.assertEqual(disabled.compile_report, failed.compile_report)
        self.assertEqual(
            [s.model_dump() for s in disabled.skills[0].steps],
            [s.model_dump() for s in failed.skills[0].steps],
        )

    def test_applied_finding_reaches_the_compiled_step(self) -> None:
        with patch.object(settings, "llm_semantic_suggestions_enabled", False):
            baseline = self._compile()
        key = step_keys(baseline.skills[0].steps)[0]
        canned = [{"step_key": key, "kind": "label_phase", "current": "", "proposed": "act", "why": "x"}]
        pkg = self._compile(
            semantics_patch=patch(
                "conxa_compile.llm.workflow_semantics.build_second_opinion", return_value=canned
            )
        )

        self.assertEqual(pkg.compile_report["second_opinion"], canned)
        self.assertEqual(pkg.skills[0].steps[0].phase, "act")

        # ...and nothing about HOW the element is found moved.
        applied_step = pkg.skills[0].steps[0].model_dump()
        baseline_step = baseline.skills[0].steps[0].model_dump()
        for field in ("target", "identity_bundle", "compiled_selectors", "validation", "frame", "tab"):
            self.assertEqual(applied_step[field], baseline_step[field], field)

    def test_finding_for_an_unknown_step_applies_nothing(self) -> None:
        canned = [{"step_key": "not-a-real-key#1", "kind": "label_phase", "current": "", "proposed": "act"}]
        pkg = self._compile(
            semantics_patch=patch(
                "conxa_compile.llm.workflow_semantics.build_second_opinion", return_value=canned
            )
        )
        self._assert_rules_only(pkg)


class ApplySecondOpinionTests(unittest.TestCase):
    """The applier itself, over synthetic steps — one case per kind."""

    def test_rename_binding_rewrites_binding_and_value(self) -> None:
        step = _type_step(input_binding="email_2", value="{{email_2}}")
        keys = step_keys([step])
        applied = apply_second_opinion(
            [step], [{"step_key": keys[0], "kind": "rename_binding", "current": "email_2", "proposed": "sender_email"}]
        )
        self.assertEqual(len(applied), 1)
        self.assertEqual(step.input_binding, "sender_email")
        self.assertEqual(step.value, "{{sender_email}}")

    def test_parameterize_literal_binds_a_recorded_value(self) -> None:
        step = _type_step(value="INV-2024-0891")
        keys = step_keys([step])
        apply_second_opinion(
            [step],
            [{"step_key": keys[0], "kind": "parameterize_literal", "current": "INV-2024-0891", "proposed": "reference_number"}],
        )
        self.assertEqual(step.input_binding, "reference_number")
        self.assertEqual(step.value, "{{reference_number}}")

    def test_parameterize_literal_never_repoints_an_existing_binding(self) -> None:
        step = _type_step(input_binding="already_bound", value="{{already_bound}}")
        keys = step_keys([step])
        self.assertEqual(
            apply_second_opinion(
                [step], [{"step_key": keys[0], "kind": "parameterize_literal", "current": "x", "proposed": "other"}]
            ),
            [],
        )
        self.assertEqual(step.input_binding, "already_bound")

    def test_label_phase_sets_phase(self) -> None:
        step = _type_step()
        keys = step_keys([step])
        apply_second_opinion([step], [{"step_key": keys[0], "kind": "label_phase", "current": "", "proposed": "login"}])
        self.assertEqual(step.phase, "login")

    def test_suggest_optional_builds_a_try_dismiss_branch(self) -> None:
        step = _type_step(
            target={"primary_selector": "#cookie-ok"},
            optional_hint={"container_signal": ".cookie-banner"},
        )
        keys = step_keys([step])
        apply_second_opinion([step], [{"step_key": keys[0], "kind": "suggest_optional", "current": "", "proposed": "true"}])
        self.assertEqual(step.action["action"], "try_dismiss")
        self.assertEqual(step.intent, "try_dismiss_interstitial")
        self.assertEqual(step.branch["candidates"], ["#cookie-ok", ".cookie-banner"])
        self.assertIsNone(step.optional_hint)
        # try_dismiss bodies never enter the recovery cascade.
        self.assertEqual(step.recovery.max_attempts, 0)

    def test_suggest_optional_without_a_recorder_hint_applies_nothing(self) -> None:
        step = _type_step(target={"primary_selector": "#x"})
        keys = step_keys([step])
        self.assertEqual(
            apply_second_opinion([step], [{"step_key": keys[0], "kind": "suggest_optional", "proposed": "true"}]), []
        )
        self.assertEqual(step.branch, {})

    def test_rename_on_a_step_with_no_binding_applies_nothing(self) -> None:
        step = _type_step(value="literal")
        keys = step_keys([step])
        self.assertEqual(
            apply_second_opinion([step], [{"step_key": keys[0], "kind": "rename_binding", "proposed": "x"}]), []
        )

    def test_no_findings_is_a_no_op(self) -> None:
        step = _type_step(input_binding="a", value="{{a}}")
        self.assertEqual(apply_second_opinion([step], []), [])
        self.assertEqual(step.input_binding, "a")


class RewritePlaceholderTests(unittest.TestCase):
    """Shared by the applier and build.py::_deduplicate_input_bindings — a
    mixed value must not keep the old token while its binding moves on."""

    def test_mixed_value_rewritten(self) -> None:
        self.assertEqual(rewrite_placeholder("prefix {{ name }} suffix", "name", "sender"), "prefix {{sender}} suffix")

    def test_exact_value_rewritten(self) -> None:
        self.assertEqual(rewrite_placeholder("{{name}}", "name", "sender"), "{{sender}}")

    def test_unrelated_token_untouched(self) -> None:
        self.assertEqual(rewrite_placeholder("{{other}}", "name", "sender"), "{{other}}")

    def test_non_string_passes_through(self) -> None:
        self.assertIsNone(rewrite_placeholder(None, "name", "sender"))


class BuildTryDismissFromHintTests(unittest.TestCase):
    """One builder, two callers (the compiler's pass and the editor's
    confirm_optional_interstitial) — they cannot produce different shapes."""

    def test_dedupes_and_drops_blanks(self) -> None:
        built = build_try_dismiss_from_hint("#same", "#same")
        self.assertEqual(built["branch"]["candidates"], ["#same"])
        self.assertEqual(build_try_dismiss_from_hint("", "  ")["branch"]["candidates"], [])

    def test_editor_confirmation_produces_the_same_branch(self) -> None:
        from conxa_compile.editor.workflow_mutations import confirm_optional_interstitial

        doc = {
            "meta": {"version": 1},
            "skills": [{"steps": [{
                "action": {"action": "click"},
                "target": {"primary_selector": "#cookie-ok"},
                "optional_hint": {"container_signal": ".cookie-banner"},
            }]}],
        }
        out = confirm_optional_interstitial(doc, 0)
        step = out["skills"][0]["steps"][0]
        built = build_try_dismiss_from_hint("#cookie-ok", ".cookie-banner")
        self.assertEqual(step["branch"], built["branch"])
        self.assertEqual(step["intent"], built["intent"])
        self.assertEqual(step["recovery"], built["recovery"])
        self.assertIsNone(step["optional_hint"])

    def test_confirming_an_already_converted_step_fails_cleanly(self) -> None:
        from conxa_compile.editor.workflow_mutations import confirm_optional_interstitial

        doc = {
            "meta": {"version": 1},
            "skills": [{"steps": [{"action": {"action": "try_dismiss"}, "optional_hint": None}]}],
        }
        with self.assertRaises(ValueError) as ctx:
            confirm_optional_interstitial(doc, 0)
        self.assertEqual(str(ctx.exception), "step_has_no_optional_hint")


class ValidateFindingsTests(unittest.TestCase):
    """_validate_findings is the trust boundary between an LLM and a compiled
    artifact a customer will run. Every gate below is load-bearing now that
    what survives is applied rather than shown."""

    def setUp(self) -> None:
        self.steps_context = [
            {"key": "k1", "input_binding": "email_2", "has_optional_hint": False},
            {"key": "k2", "input_binding": None, "has_optional_hint": True},
        ]
        self.keys = {"k1", "k2"}

    def _validate(self, raw):
        return _validate_findings(raw, step_keys_in_workflow=self.keys, steps_context=self.steps_context)

    def test_good_finding_survives(self) -> None:
        out = self._validate([{"step_key": "k1", "kind": "rename_binding", "current": "email_2", "proposed": "sender_email", "why": "clear"}])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["proposed"], "sender_email")

    def test_unknown_step_key_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "not_in_workflow", "kind": "rename_binding", "proposed": "x"}]), [])

    def test_unknown_kind_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "k1", "kind": "group_steps", "proposed": "x"}]), [])

    def test_invalid_identifier_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "k1", "kind": "rename_binding", "proposed": "not valid!"}]), [])

    def test_colliding_binding_name_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "k2", "kind": "rename_binding", "proposed": "email_2"}]), [])

    def test_suggest_optional_without_recorder_hint_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "k1", "kind": "suggest_optional", "proposed": "true"}]), [])

    def test_suggest_optional_with_recorder_hint_survives(self) -> None:
        self.assertEqual(len(self._validate([{"step_key": "k2", "kind": "suggest_optional", "proposed": "true"}])), 1)

    def test_invalid_phase_dropped(self) -> None:
        self.assertEqual(self._validate([{"step_key": "k1", "kind": "label_phase", "proposed": "shopping"}]), [])

    def test_valid_phase_survives(self) -> None:
        self.assertEqual(len(self._validate([{"step_key": "k1", "kind": "label_phase", "proposed": "login"}])), 1)

    def test_mixed_batch_keeps_only_the_good_one(self) -> None:
        out = self._validate([
            {"step_key": "unknown", "kind": "rename_binding", "proposed": "x"},
            {"step_key": "k1", "kind": "totally_made_up", "proposed": "x"},
            {"step_key": "k1", "kind": "rename_binding", "proposed": "not valid!"},
            {"step_key": "k2", "kind": "rename_binding", "proposed": "email_2"},
            {"step_key": "k1", "kind": "suggest_optional", "proposed": "true"},
            {"step_key": "k1", "kind": "rename_binding", "current": "email_2", "proposed": "sender_email", "why": "clear"},
        ])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["proposed"], "sender_email")

    def test_not_a_list_returns_empty(self) -> None:
        self.assertEqual(self._validate(None), [])
