"""Enterprise bring-your-own-key storage and router integration (Azure OpenAI).

The compliance argument, not a cost play: vision anchor generation sends
screenshots of a customer's internal screens to third-party LLM providers,
which is a dead stop in a bank's security review. "Compile against your own
Azure OpenAI deployment — no screenshot of your systems ever leaves your
tenancy." Only Enterprise workspaces (plan capability ``byok``) may configure
one; see docs/PRD.md §11. Bedrock and Vertex are tracked in TODO.md — Azure
OpenAI is OpenAI-compatible, so it reuses the existing router call path
(see app/llm/router.py's ``auth_style="api_key_header"`` and
``call_entry_directly``); the other two would each need a real translation
layer and are out of scope here.
"""

from __future__ import annotations

import base64
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from conxa_core.config import settings
from conxa_core.db import db_delete, db_get, db_set

from app.llm.router import PoolEntry
from app.services.entitlements import byok_enabled_for
from app.services.saas import Principal

_NS = "workspace_llm_keys"
_NONCE_LEN = 12  # AES-GCM standard nonce size


class ByokError(Exception):
    def __init__(self, code: str, status_code: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def _cipher() -> AESGCM:
    raw = settings.byok_encryption_key.strip()
    if not raw:
        raise ByokError("byok_not_configured", 500)
    try:
        key = base64.b64decode(raw)
    except Exception as exc:  # noqa: BLE001
        raise ByokError("byok_not_configured", 500) from exc
    if len(key) != 32:
        raise ByokError("byok_not_configured", 500)
    return AESGCM(key)


def _encrypt(plaintext: str) -> dict[str, str]:
    import os

    nonce = os.urandom(_NONCE_LEN)
    ciphertext = _cipher().encrypt(nonce, plaintext.encode("utf-8"), None)
    return {
        "nonce_b64": base64.b64encode(nonce).decode("ascii"),
        "ciphertext_b64": base64.b64encode(ciphertext).decode("ascii"),
    }


def _decrypt(record: dict[str, Any]) -> str:
    nonce = base64.b64decode(str(record.get("nonce_b64") or ""))
    ciphertext = base64.b64decode(str(record.get("ciphertext_b64") or ""))
    return _cipher().decrypt(nonce, ciphertext, None).decode("utf-8")


def _ensure_byok_capable(principal: Principal) -> None:
    if not byok_enabled_for(principal):
        raise ByokError("byok_requires_enterprise", 403)


def set_azure_openai_key(
    principal: Principal,
    *,
    endpoint: str,
    deployment: str,
    api_version: str,
    api_key: str,
) -> dict[str, Any]:
    """Owner/admin only (enforced by the route). Stores everything needed to
    build the chat-completions URL except the raw key, which is AES-256-GCM
    encrypted at rest — GET never returns it, only whether one is configured."""
    _ensure_byok_capable(principal)
    endpoint = endpoint.strip().rstrip("/")
    deployment = deployment.strip()
    api_version = api_version.strip() or "2024-08-01-preview"
    if not endpoint or not deployment or not api_key.strip():
        raise ByokError("invalid_byok_config", 400)
    enc = _encrypt(api_key.strip())
    record = {
        "provider": "azure_openai",
        "endpoint": endpoint,
        "deployment": deployment,
        "api_version": api_version,
        **enc,
    }
    db_set(_NS, principal.workspace_id, record)
    return describe_key(principal)


def describe_key(principal: Principal) -> dict[str, Any]:
    """Metadata only — never the key. Used by the Settings panel to show
    "configured" state without round-tripping the secret to the browser."""
    record = db_get(_NS, principal.workspace_id)
    if not isinstance(record, dict):
        return {"configured": False}
    return {
        "configured": True,
        "provider": record.get("provider"),
        "endpoint": record.get("endpoint"),
        "deployment": record.get("deployment"),
        "api_version": record.get("api_version"),
    }


def delete_key(principal: Principal) -> None:
    db_delete(_NS, principal.workspace_id)


def byok_pool_entry_for(principal: Principal) -> PoolEntry | None:
    """None if the plan doesn't carry ``byok`` or no key is configured — the
    caller falls back to the shared managed pool in either case."""
    if not byok_enabled_for(principal):
        return None
    record = db_get(_NS, principal.workspace_id)
    if not isinstance(record, dict) or record.get("provider") != "azure_openai":
        return None
    try:
        api_key = _decrypt(record)
    except ByokError:
        return None
    endpoint = str(record.get("endpoint") or "")
    deployment = str(record.get("deployment") or "")
    api_version = str(record.get("api_version") or "")
    if not endpoint or not deployment or not api_key:
        return None
    chat_url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    return PoolEntry(
        provider="azure_openai_byok",
        endpoint=chat_url,
        api_key=api_key,
        text_model=deployment,
        vision_model=deployment,
        pool="premium",
        auth_style="api_key_header",
    )
