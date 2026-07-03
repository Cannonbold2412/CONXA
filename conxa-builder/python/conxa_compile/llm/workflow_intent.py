"""Workflow-level intent graph inference (one LLM call per compile).

Produces a high-level goal statement plus per-step semantic intent, used by
`compiler/build.py` to annotate a compiled skill package with human-readable
context. This is one of the few LLM-driven passes the compile pipeline still
runs — see the "LLM does not write selector strings" invariant in CLAUDE.md;
this module produces prose annotations, not selectors.
"""

from __future__ import annotations

from typing import Any

from conxa_compile.llm.openapi_client import infer_workflow_intent
from conxa_core.models.skill_spec import WorkflowIntentGraph, WorkflowIntentStep


def build_workflow_intent_graph(
    steps_summary: list[dict[str, Any]],
    page_urls: list[str],
    *,
    model: str | None = None,
) -> WorkflowIntentGraph:
    """Single LLM call producing high-level goal + per-step semantic intent."""
    raw = infer_workflow_intent(
        steps_summary=steps_summary,
        page_urls=page_urls,
        model=model,
    )
    if not raw:
        return WorkflowIntentGraph()
    intent_steps: list[WorkflowIntentStep] = []
    for item in raw.get("steps") or []:
        if not isinstance(item, dict):
            continue
        try:
            intent_steps.append(
                WorkflowIntentStep(
                    index=int(item.get("index") or 0),
                    intent=str(item.get("intent") or ""),
                    verification_anchor=str(item.get("verification_anchor") or ""),
                )
            )
        except (TypeError, ValueError):
            continue
    return WorkflowIntentGraph(
        goal=str(raw.get("goal") or ""),
        steps=intent_steps,
        decision_points=list(raw.get("decision_points") or []),
        expected_end_state=dict(raw.get("expected_end_state") or {}),
    )
