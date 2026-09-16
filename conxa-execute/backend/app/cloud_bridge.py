"""HTTP client for the Conxa Cloud internal Execute bridge
(conxa-cloud/backend/app/api/execute_bridge_routes.py) — claiming an Execute
seat grant and checking/debiting the granting workspace's shared AI Usage
Credits pool.

Authenticated with a single shared bearer secret (SKILL_EXECUTE_SERVICE_TOKEN)
set identically on both services — see conxa_core.config.settings and
docs/TRD.md §13.4c for why a shared secret is enough here (Conxa operates
both ends) rather than the per-workspace tokens used for external runtimes.
"""
from __future__ import annotations

from typing import Any

import httpx

from conxa_core.config import settings

_TIMEOUT_SECS = 8


def _headers() -> dict[str, str]:
    token = str(settings.execute_service_token or "").strip()
    return {"Authorization": f"Bearer {token}"}


def _base_url() -> str:
    return str(settings.conxa_cloud_api_base_url or "").rstrip("/")


def claim_grant(*, grant_id: str, user_id: str, email: str) -> dict[str, Any]:
    resp = httpx.post(
        f"{_base_url()}/api/v1/internal/execute/grants/claim",
        json={"grant_id": grant_id, "user_id": user_id, "email": email},
        headers=_headers(),
        timeout=_TIMEOUT_SECS,
    )
    resp.raise_for_status()
    return resp.json()


def pool_check(*, user_id: str, estimated_tokens: int = 0) -> dict[str, Any]:
    """Returns {"bound": bool, "ok": bool, ...}. On a network error, returns
    {"unknown": True, "bound": False, "ok": False} instead of a plain
    "not bound" — a caller that treated network trouble as "not bound" would
    fall through to billing this user's personal wallet/subscription instead
    of their workspace's pool, silently charging the wrong bucket. Callers
    must check `unknown` and refuse the turn rather than guess."""
    try:
        resp = httpx.post(
            f"{_base_url()}/api/v1/internal/execute/pool/check",
            json={"user_id": user_id, "estimated_tokens": estimated_tokens},
            headers=_headers(),
            timeout=_TIMEOUT_SECS,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return {"unknown": True, "bound": False, "ok": False}


def pool_debit(*, user_id: str, input_tokens: int, output_tokens: int) -> dict[str, Any]:
    """Post-call debit. Swallows network errors — the chat response has
    already been returned to the user by the time this runs; losing a usage
    record on a transient failure is preferable to failing the turn."""
    try:
        resp = httpx.post(
            f"{_base_url()}/api/v1/internal/execute/pool/debit",
            json={"user_id": user_id, "input_tokens": input_tokens, "output_tokens": output_tokens},
            headers=_headers(),
            timeout=_TIMEOUT_SECS,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return {"bound": False, "recorded": False}


if __name__ == "__main__":
    assert _headers()["Authorization"].startswith("Bearer ")
    assert not _base_url().endswith("/")
    print("cloud_bridge.py self-check passed")
