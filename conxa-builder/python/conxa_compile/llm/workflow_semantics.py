"""The compiler's second opinion (BUILD-25): one whole-workflow LLM call that
decides the four things no per-step rule can decide correctly, because the
information they need is workflow-global.

This module only DECIDES. compiler/second_opinion.py writes the decisions onto
the compiled steps, so a reviewer opening Human Review sees finished work
rather than a list of chips to approve — Human Review is the gate, and a wrong
call is edited there like any other compiler output.

That means the output of this call is applied, not annotated, and the six
validation gates in _validate_findings below are the trust boundary between an
LLM and a shipped artifact. They matter more now, not less: keep every one of
them. Precision over recall — a pass that always finds something is worse than
one that usually finds nothing, because "no findings" is a first-class and
expected outcome.

CLAUDE.md's "LLM does not write selector strings on the primary compile path"
invariant holds: nothing here or in the applier touches a selector, an identity
signal, or an element address. It writes meaning only — binding names, value
placeholders, phase, optionality.

Mirrors workflow_intent.py's shape exactly: cache lookup -> LLM call ->
validate -> cache on success only (never on empty, so a drained provider pool
retries next compile) -> return. Never raises. A failed or disabled call falls
back to the rules-only compile, which is a different (rules-only) package, not
the same one — see TODO.md BUILD-25 for why that trade was taken.

Four kinds (the cheapest slice of BUILD-25's six problem families):
  - rename_binding / parameterize_literal — naming is workflow-global; two
    same-typed fields can only be told apart with the whole workflow in view.
  - suggest_optional — the recorder already flags a step optional_hint
    (stochastic across recordings); this only judges hints that already exist,
    it never invents one.
  - label_phase — labels a run of steps login/navigate/act/verify/cleanup.
    Nothing downstream reads the label yet (deliberately distinct from the
    riskier group_steps kind, which is out of scope here).

Findings are keyed on step_key (compiler/step_key.py), never step_index — an
inserted step renumbers everything after it (BUILD-22/BUILD-23).
"""

from __future__ import annotations

from typing import Any

from conxa_core.config import settings

from conxa_compile.editor.placeholder_grammar import is_valid_placeholder_id
from conxa_compile.llm.llm_cache import cache_key, read_cached, write_cached
from conxa_compile.llm.openapi_client import infer_workflow_semantics

_NAMESPACE = "workflow_semantics"
_CACHE_VERSION = 1

_VALID_KINDS = frozenset({"rename_binding", "parameterize_literal", "suggest_optional", "label_phase"})
_VALID_PHASES = frozenset({"login", "navigate", "act", "verify", "cleanup"})
_NAME_KINDS = frozenset({"rename_binding", "parameterize_literal"})
# Precision over recall (see module docstring / TODO.md BUILD-25): a pass that
# always finds something trains reviewers to accept reflexively, which
# destroys the label quality this whole item exists to produce.
_MAX_FINDINGS_PER_STEP_RATIO = 0.5


def _valid_bindings(steps_context: list[dict[str, Any]]) -> set[str]:
    return {
        str(s.get("input_binding") or "").strip()
        for s in steps_context
        if s.get("input_binding")
    }


def _validate_findings(
    raw_findings: Any,
    *,
    step_keys_in_workflow: set[str],
    steps_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Drop everything that isn't trustworthy, silently — a rejected finding is
    a normal outcome, not an error worth surfacing. Six gates, and every one of
    them stands between an LLM and a compiled artifact a customer will run: an
    unknown step_key, an unknown kind, a name that isn't a valid placeholder id,
    a name that collides with a binding the compiler already assigned, an
    "optional" verdict the recorder never observed, and an invalid phase label.
    The trailing cap keeps a talkative model from rewriting half the workflow."""
    if not isinstance(raw_findings, list):
        return []

    optional_hint_keys = {
        str(s.get("key") or "") for s in steps_context if s.get("has_optional_hint")
    }
    existing_bindings = _valid_bindings(steps_context)
    seen_new_names: set[str] = set()
    out: list[dict[str, Any]] = []

    for item in raw_findings:
        if not isinstance(item, dict):
            continue
        step_key = str(item.get("step_key") or "").strip()
        kind = str(item.get("kind") or "").strip()
        proposed = str(item.get("proposed") or "").strip()
        if step_key not in step_keys_in_workflow:
            continue
        if kind not in _VALID_KINDS:
            continue
        if kind in _NAME_KINDS:
            if not is_valid_placeholder_id(proposed):
                continue
            if proposed in existing_bindings or proposed in seen_new_names:
                continue
            seen_new_names.add(proposed)
        elif kind == "suggest_optional":
            if step_key not in optional_hint_keys:
                continue
        elif kind == "label_phase":
            if proposed not in _VALID_PHASES:
                continue
        out.append({
            "step_key": step_key,
            "kind": kind,
            "current": str(item.get("current") or ""),
            "proposed": proposed,
            "why": str(item.get("why") or "")[:280],
        })

    cap = max(1, round(len(steps_context) * _MAX_FINDINGS_PER_STEP_RATIO))
    return out[:cap]


def build_second_opinion(
    steps_context: list[dict[str, Any]],
    *,
    goal: str,
    page_urls: list[str],
    sibling_bindings: dict[str, list[str]] | None = None,
    model: str | None = None,
    error_detail: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Single LLM call producing workflow-global findings for
    compiler/second_opinion.py to apply. Returns [] on any failure, on an empty
    response, or when the pass is disabled — never raises, and [] means the
    compile falls back to its rules-only result."""
    if not settings.llm_semantic_suggestions_enabled:
        return []
    if not steps_context:
        return []

    step_keys_in_workflow = {str(s.get("key") or "") for s in steps_context}
    key = cache_key(
        _CACHE_VERSION,
        steps=steps_context,
        goal=goal,
        page_urls=page_urls,
        sibling_bindings=sibling_bindings or {},
    )
    cached = read_cached(_NAMESPACE, key, _CACHE_VERSION)
    if cached is not None:
        return _validate_findings(cached.get("suggestions"), step_keys_in_workflow=step_keys_in_workflow, steps_context=steps_context)

    raw = infer_workflow_semantics(
        steps=steps_context,
        goal=goal,
        page_urls=page_urls,
        sibling_bindings=sibling_bindings or {},
        model=model,
        error_detail=error_detail,
    )
    if not raw or not raw.get("suggestions"):
        # Empty/failed response — do NOT cache, so the next compile retries.
        # "No findings" is itself a first-class, expected outcome, but only
        # a real (even if empty) response is worth caching — a failed call
        # should retry on recompile, not freeze into a permanent "nothing
        # found".
        return []

    write_cached(_NAMESPACE, key, raw, _CACHE_VERSION)
    return _validate_findings(raw.get("suggestions"), step_keys_in_workflow=step_keys_in_workflow, steps_context=steps_context)
