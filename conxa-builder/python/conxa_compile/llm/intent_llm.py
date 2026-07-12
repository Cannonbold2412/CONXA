"""Intent generation for compiler V2 with cache-backed real LLM calls."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from conxa_core.config import settings
from conxa_core.db import db_get, db_set
from conxa_compile.llm.client import call_llm
from conxa_compile.policy.bundle import get_policy_bundle
from conxa_compile.policy.intent_ontology import generic_intents

INTENT_RE = re.compile(r"^[a-z][a-z0-9_]{2,80}$")

# Bounded LLM attempts before leaving the intent blank. No template fallback exists any more —
# a blank intent is flagged (flags.generic_intent / the "intent" badge / generic_or_empty_intent
# suggestion, all already wired in workflow_dto.py) rather than silently disguised as a real one.
MAX_INTENT_ATTEMPTS = 3


def _cache_path() -> Path:
    p = settings.data_dir / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p / "intent_llm_cache.json"


def _read_cache() -> dict[str, str]:
    data = db_get("llm_cache", "intent")
    if data is not None:
        return {str(k): str(v) for k, v in data.items()}
    path = _cache_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {str(k): str(v) for k, v in data.items()}
    except Exception:
        return {}


def _write_cache(cache: dict[str, str]) -> None:
    db_set("llm_cache", "intent", cache)
    try:
        _cache_path().write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def _intent_key(payload: dict[str, str]) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _sanitize_intent(value: str) -> str:
    """Returns a valid snake_case intent, or "" if the value doesn't parse as one."""
    intent = "_".join(value.strip().lower().split())
    if intent == "perform_action":
        return ""
    if not INTENT_RE.match(intent):
        return ""
    return intent


def generate_intent_with_llm(step: dict[str, object]) -> str:
    """Returns a specific, LLM-derived snake_case intent, or "" if one couldn't be resolved.

    No template fallback: a malformed/generic answer gets a corrective retry (bounded by
    MAX_INTENT_ATTEMPTS), not a silent substitution. Only a genuinely resolved intent is cached —
    an unresolved step gets a fresh shot on the next compile instead of being stuck blank forever.
    """
    policy = get_policy_bundle().data
    generics = generic_intents(policy)
    action = str((step.get("action") or {}).get("action") or "interact")
    target = step.get("target") or {}
    context = step.get("context") or {}
    semantic = step.get("semantic") or {}
    payload = {
        "tag": str(target.get("tag") or ""),
        "inner_text": str(target.get("inner_text") or semantic.get("normalized_text") or ""),
        "name": str(target.get("name") or ""),
        "role": str(target.get("role") or semantic.get("role") or ""),
        "placeholder": str(target.get("placeholder") or ""),
        "context": str(context.get("form_context") or ""),
    }
    cache = _read_cache()
    key = _intent_key({"action": action, **payload})
    if key in cache:
        return cache[key]

    base_prompt = (
        "Given:\n"
        f"- element tag: {payload['tag']}\n"
        f"- attributes: name={payload['name']}, role={payload['role']}, placeholder={payload['placeholder']}\n"
        f"- visible text: {payload['inner_text']}\n"
        f"- page context: {payload['context']}\n\n"
        "Return one snake_case intent string that describes the user goal for this control "
        "(verb + object, no spaces). Examples of shape: focus_<name>, enter_<name>_value, click_<name>, "
        "navigate_to_<place>, scroll_viewport. Return ONLY the intent."
    )
    feedback = ""
    for _attempt in range(MAX_INTENT_ATTEMPTS):
        req_body = {
            "task": "intent_generation",
            "input": {"prompt": base_prompt + feedback},
        }
        data = call_llm("intent_generation", req_body, max(500, settings.llm_text_timeout_ms))
        if data is None:
            # Provider pool already exhausted its own internal retries (router.route_text) —
            # this is a real (if hopefully transient) outage. Try again with the same prompt.
            continue
        raw_intent = str(data.get("intent") or data.get("output") or data.get("text") or "").strip()
        intent = _sanitize_intent(raw_intent)
        if not intent:
            feedback = (
                f"\n\nYour previous answer '{raw_intent}' was not a valid snake_case intent "
                "string (verb_object, lowercase, underscores only). Return ONLY a valid one."
            )
            continue
        if intent in generics:
            feedback = (
                f"\n\nYour previous answer '{intent}' was too generic. Be more specific about "
                "what this exact control does — mention its label, name, or visible text."
            )
            continue
        cache[key] = intent
        _write_cache(cache)
        return intent

    return ""


def generate_intent(step: dict[str, object]) -> str:
    """Backwards-compatible alias for compiler callers."""
    return generate_intent_with_llm(step)
