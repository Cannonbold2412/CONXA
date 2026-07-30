"""Unit tests for conxa_compile/llm/region_selector_vision.py — the vision-based selector
generator behind the re-target wizard's "draw a new region" path. See test_retarget_wizard.py
for the end-to-end preview_retarget wiring tests; these focus on the module in isolation."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from PIL import Image

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))

from conxa_core.config import settings  # noqa: E402


def _matching_event(rel_screenshot: str = "images/a.jpg") -> dict:
    return {
        "snapshot": {"ref": "ref-1", "dom_hash": "a" * 64},
        "visual": {"full_screenshot": rel_screenshot, "viewport": "100x80"},
        "action": {"action": "click"},
    }


class RegionSelectorVisionTests(TestCase):
    def test_returns_candidates_from_llm_response(self) -> None:
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions" / "sess" / "images").mkdir(parents=True)
            Image.new("RGB", (100, 80), "white").save(
                root / "sessions" / "sess" / "images" / "a.jpg"
            )
            with (
                patch.object(settings, "data_dir", root),
                patch.object(settings, "selector_cache_enabled", False),
                patch(
                    "conxa_compile.llm.region_selector_vision.call_llm",
                    return_value={
                        "candidates": [
                            {"selector": '[data-testid="submit-btn"]', "rank": 1, "intent": "submit"}
                        ]
                    },
                ) as call,
            ):
                out = compile_selectors_for_region(
                    matching_event=_matching_event(),
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html><body><button data-testid=\"submit-btn\">Go</button></body></html>",
                    action_type="click",
                )

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].selector, '[data-testid="submit-btn"]')
        # The image + DOM snippet were sent together as the vision payload.
        task, payload, *_ = call.call_args.args
        self.assertEqual(task, "region_selector")
        self.assertTrue(payload.get("image_base64"))
        self.assertIn("<button", payload.get("user_text") or "")

    def test_returns_empty_when_screenshot_missing(self) -> None:
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions" / "sess").mkdir(parents=True)
            with patch.object(settings, "data_dir", root):
                out = compile_selectors_for_region(
                    matching_event=_matching_event("images/does-not-exist.jpg"),
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html></html>",
                    action_type="click",
                )

        self.assertEqual(out, [])

    def test_returns_empty_when_llm_call_fails(self) -> None:
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions" / "sess" / "images").mkdir(parents=True)
            Image.new("RGB", (100, 80), "white").save(
                root / "sessions" / "sess" / "images" / "a.jpg"
            )
            with (
                patch.object(settings, "data_dir", root),
                patch.object(settings, "selector_cache_enabled", False),
                patch("conxa_compile.llm.region_selector_vision.call_llm", return_value=None),
            ):
                out = compile_selectors_for_region(
                    matching_event=_matching_event(),
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html></html>",
                    action_type="click",
                )

        self.assertEqual(out, [])

    def test_returns_empty_when_call_llm_raises(self) -> None:
        """A non-whitelisted exception from call_llm (e.g. a transient router error) must not
        crash the wizard's Continue click — it should fall through to the empty-candidates path
        like any other failure, per this function's documented contract."""
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions" / "sess" / "images").mkdir(parents=True)
            Image.new("RGB", (100, 80), "white").save(
                root / "sessions" / "sess" / "images" / "a.jpg"
            )
            with (
                patch.object(settings, "data_dir", root),
                patch.object(settings, "selector_cache_enabled", False),
                patch(
                    "conxa_compile.llm.region_selector_vision.call_llm",
                    side_effect=RuntimeError("boom"),
                ),
            ):
                out = compile_selectors_for_region(
                    matching_event=_matching_event(),
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html></html>",
                    action_type="click",
                )

        self.assertEqual(out, [])

    def test_returns_empty_when_candidate_malformed(self) -> None:
        """A vision-LLM response with a candidate shaped just enough off (e.g. non-numeric
        rank) must not crash SelectorCandidate.from_dict all the way out to the caller."""
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sessions" / "sess" / "images").mkdir(parents=True)
            Image.new("RGB", (100, 80), "white").save(
                root / "sessions" / "sess" / "images" / "a.jpg"
            )
            with (
                patch.object(settings, "data_dir", root),
                patch.object(settings, "selector_cache_enabled", False),
                patch(
                    "conxa_compile.llm.region_selector_vision.call_llm",
                    return_value={"candidates": [{"selector": "#x", "rank": "not-a-number"}]},
                ),
            ):
                out = compile_selectors_for_region(
                    matching_event=_matching_event(),
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html></html>",
                    action_type="click",
                )

        self.assertEqual(out, [])

    def test_infra_errors_still_propagate(self) -> None:
        """QuotaExceeded/EntitlementBlocked/CloudUnreachable must keep bubbling up — they get
        specific, actionable messages upstream in cmd_retarget_preview and must not be
        swallowed into a generic empty-candidates result."""
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region
        from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded

        for exc in (
            QuotaExceeded("quota"),
            EntitlementBlocked("human_edit_pool_exceeded"),
            CloudUnreachable("unreachable"),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "sessions" / "sess" / "images").mkdir(parents=True)
                Image.new("RGB", (100, 80), "white").save(
                    root / "sessions" / "sess" / "images" / "a.jpg"
                )
                with (
                    patch.object(settings, "data_dir", root),
                    patch.object(settings, "selector_cache_enabled", False),
                    patch(
                        "conxa_compile.llm.region_selector_vision.call_llm",
                        side_effect=exc,
                    ),
                    self.assertRaises(type(exc)),
                ):
                    compile_selectors_for_region(
                        matching_event=_matching_event(),
                        session_id="sess",
                        bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                        dom_snapshot="<html></html>",
                        action_type="click",
                    )

    def test_returns_empty_when_full_screenshot_path_absent(self) -> None:
        from conxa_compile.llm.region_selector_vision import compile_selectors_for_region

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(settings, "data_dir", root):
                out = compile_selectors_for_region(
                    matching_event={"snapshot": {"dom_hash": "x"}, "visual": {}},
                    session_id="sess",
                    bbox={"x": 10, "y": 10, "w": 20, "h": 20},
                    dom_snapshot="<html></html>",
                    action_type="click",
                )

        self.assertEqual(out, [])
