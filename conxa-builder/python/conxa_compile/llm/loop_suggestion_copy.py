"""Human-friendly copy for a `compiler/loop_suggestion.py` "generalize this to a loop"
suggestion, shown in the mandatory Human Edit review popup (ReviewQuestionsDialog.tsx).

Purely cosmetic — the deterministic `why`/`preview` strings loop_suggestion.py already builds
remain the fallback and the only thing that can ever be *wrong*; this only asks an LLM to
rephrase them for a non-technical reader. Never touches detection, selectors, or the branch
this suggestion applies — matches the compile-time "LLM annotates meaning, never the program"
boundary the rest of BUILD-25/26 draws (docs/TRD.md Key Invariants).

The cache/fallback/failure-logging machinery lives in `llm/copy_rewrite.py` — generic,
reusable by any future "make this compiler-generated text friendlier" task. This module is
just that generic helper's first caller plus the one thing specific to loop suggestions: what
`steps` context to send. `steps_context` (built by
build.py::_rewrite_loop_suggestions_for_review, via `compiler/step_description.py`, from the
actual compiled steps, role-tagged "acquire"/"upload"/"redundant_click") is what keeps this
call grounded — an earlier version passed only a bare filename + a "removes_click" boolean,
and a model with no real picture of the workflow guessed at a wrong mechanism entirely
(describing a delete when the real pattern is download-then-upload).
"""

from __future__ import annotations

from typing import Any

from conxa_compile.llm.copy_rewrite import rewrite_advisory_text

_NAMESPACE = "loop_suggestion_copy"
_CACHE_VERSION = 2


def friendly_loop_suggestion_text(
    filename: str,
    *,
    steps_context: list[dict[str, Any]],
    fallback: str,
    error_detail: list[str] | None = None,
) -> str:
    return rewrite_advisory_text(
        "loop_suggestion_copy",
        {"filename": filename, "steps": steps_context},
        fallback=fallback,
        cache_namespace=_NAMESPACE,
        cache_version=_CACHE_VERSION,
        error_detail=error_detail,
    )
