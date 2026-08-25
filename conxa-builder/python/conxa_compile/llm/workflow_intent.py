"""Workflow-level intent graph inference (one LLM call per compile).

Produces the high-level goal statement plus, per step, a machine-readable
snake_case intent_token AND readable prose intent — the single source of both.
`compiler/build.py` calls this BEFORE the per-step loop so the tokens replace
the old per-step `intent_generation` LLM burst (one call instead of N), and the
prose annotates the compiled skill package for human review in Human Edit.

This is one of the few LLM-driven passes the compile pipeline still runs — see
the "LLM does not write selector strings" invariant; it produces intents and
annotations, never selectors.

Successful graphs are cached locally (keyed by a hash of the steps summary +
page URLs) for the same reason intent_llm.py caches per-step intents: on a
first compile with a drained free-provider pool this call can fail while every
key cools down; on a recompile the warm caches let it succeed. Caching the
graph makes a recompile backfill a previously-missing plan instead of re-paying
for a call that already succeeded once.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_set

from conxa_compile.llm.openapi_client import infer_workflow_intent
from conxa_core.models.skill_spec import WorkflowIntentGraph, WorkflowIntentStep


def _cache_path() -> Path:
    p = settings.data_dir / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p / "workflow_intent_cache.json"


def _read_cache() -> dict[str, dict[str, Any]]:
    data = db_get("llm_cache", "workflow_intent")
    if isinstance(data, dict):
        return {str(k): v for k, v in data.items() if isinstance(v, dict)}
    path = _cache_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): v for k, v in data.items() if isinstance(v, dict)}


def _write_cache(cache: dict[str, dict[str, Any]]) -> None:
    try:
        db_set("llm_cache", "workflow_intent", cache)
    except Exception:
        pass
    try:
        _cache_path().write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def _cache_key(steps_summary: list[dict[str, Any]], page_urls: list[str]) -> str:
    # "v2" namespace: entries cached before the graph also carried per-step
    # intent_token values must not be reused (they'd starve the compiler of
    # tokens and silently push every step down the legacy per-step path).
    raw = json.dumps({"v": 2, "steps": steps_summary, "page_urls": page_urls}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _graph_from_raw(raw: dict[str, Any]) -> WorkflowIntentGraph:
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
                    intent_token=str(item.get("intent_token") or ""),
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


def build_workflow_intent_graph(
    steps_summary: list[dict[str, Any]],
    page_urls: list[str],
    *,
    model: str | None = None,
    error_detail: list[str] | None = None,
) -> WorkflowIntentGraph:
    """Single LLM call producing high-level goal + per-step semantic intent."""
    key = _cache_key(steps_summary, page_urls)
    cached = _read_cache().get(key)
    if cached is not None:
        return _graph_from_raw(cached)

    raw = infer_workflow_intent(
        steps_summary=steps_summary,
        page_urls=page_urls,
        model=model,
        error_detail=error_detail,
    )
    if not raw or (not str(raw.get("goal") or "").strip() and not (raw.get("steps") or [])):
        # Empty/failed response — do NOT cache, so the next compile retries.
        return WorkflowIntentGraph()

    graph = _graph_from_raw(raw)
    _write_cache({**_read_cache(), key: raw})
    return graph
