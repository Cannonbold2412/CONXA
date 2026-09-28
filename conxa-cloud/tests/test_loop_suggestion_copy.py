"""Human-friendly copy rewrite for a loop suggestion (llm/loop_suggestion_copy.py) —
advisory, cosmetic only. Never touches detection; on any failure (no provider configured,
a raised exception, an empty response) it must return the deterministic fallback text
verbatim, never raise, and never block a compile."""

from __future__ import annotations

import sys

sys.path.insert(0, "../conxa-builder/python")

from conxa_compile.llm.loop_suggestion_copy import friendly_loop_suggestion_text  # noqa: E402


def test_falls_back_when_llm_call_raises():
    error_detail: list[str] = []
    steps_context = [
        {"role": "acquire", "action": "navigate", "description": "Open the Elixir.gitignore page"},
        {"role": "acquire", "action": "download_observed", "description": "Download Elixir.gitignore"},
        {"role": "upload", "action": "upload", "description": "Upload the downloaded file"},
    ]
    text = friendly_loop_suggestion_text(
        "Elixir.gitignore",
        steps_context=steps_context,
        fallback="This downloads and uploads one fixed file ('Elixir.gitignore').",
        error_detail=error_detail,
    )
    # No LLM provider is configured in this test environment, so call_llm raises and the
    # deterministic fallback must come back unchanged.
    assert text == "This downloads and uploads one fixed file ('Elixir.gitignore')."
    assert error_detail  # the failure was recorded, not swallowed silently
