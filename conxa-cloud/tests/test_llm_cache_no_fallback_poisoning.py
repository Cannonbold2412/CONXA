"""semantic_llm/vision_llm/recovery_llm must never cache a rule-based fallback result as
if it were a real model answer — a transient provider outage would otherwise poison that
cache key forever, since a cache hit is checked before the provider is ever called again."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from conxa_core.config import settings


class NoFallbackCachePoisoningTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._patch = patch.object(settings, "data_dir", Path(self._tmp.name))
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_semantic_llm_fallback_is_not_cached(self) -> None:
        from conxa_compile.llm.semantic_llm import SemanticLLMInput, SemanticLLMOutput, enrich_semantic

        inp = SemanticLLMInput(raw_text="Submit", element_type="button")
        real = SemanticLLMOutput(intent="submit_form", normalized_text="submit", confidence=0.9, source="llm")

        with patch("conxa_compile.llm.semantic_llm._call_provider", return_value=None):
            out1 = enrich_semantic(inp)
        self.assertEqual(out1.source, "rule_fallback")

        with patch("conxa_compile.llm.semantic_llm._call_provider", return_value=real) as provider:
            out2 = enrich_semantic(inp)
        provider.assert_called_once()  # not a cache hit off the poisoned fallback
        self.assertEqual(out2.source, "llm")

    def test_vision_llm_fallback_is_not_cached(self) -> None:
        from conxa_compile.llm.vision_llm import VisionCandidate, VisionLLMInput, VisionLLMOutput, assist_vision

        inp = VisionLLMInput(
            full_screenshot="a.png",
            candidates=[VisionCandidate(element_id="e1", crop_path="e1.png", text="Submit")],
            intent="submit_form",
        )
        real = VisionLLMOutput(best_candidate="e1", confidence=0.95, source="llm")

        with patch("conxa_compile.llm.vision_llm._call_provider", return_value=None):
            out1 = assist_vision(inp, recovery_phase=True)
        self.assertEqual(out1.source, "rule_fallback")

        with patch("conxa_compile.llm.vision_llm._call_provider", return_value=real) as provider:
            out2 = assist_vision(inp, recovery_phase=True)
        provider.assert_called_once()
        self.assertEqual(out2.source, "llm")

    def test_recovery_llm_fallback_is_not_cached(self) -> None:
        from conxa_compile.llm.recovery_llm import RecoveryCandidate, RecoveryLLMInput, RecoveryLLMOutput, assist_recovery

        inp = RecoveryLLMInput(
            intent="submit_form",
            candidates=[RecoveryCandidate(id="e1", text="Submit", role="button")],
        )
        real = RecoveryLLMOutput(selected="e1", confidence=0.95, source="llm")

        with patch("conxa_compile.llm.recovery_llm._call_provider", return_value=None):
            out1 = assist_recovery(inp)
        self.assertEqual(out1.source, "rule_fallback")

        with patch("conxa_compile.llm.recovery_llm._call_provider", return_value=real) as provider:
            out2 = assist_recovery(inp)
        provider.assert_called_once()
        self.assertEqual(out2.source, "llm")


if __name__ == "__main__":
    unittest.main()
