"""Generic OpenAI-compatible chat proxy, metered against the signed-in
Clerk user's token wallet.

Not built on conxa_core.llm's router, nor on conxa_core.config's
ProviderConfig — that engine and dataclass are shaped for conxa-cloud's
compile-time structured JSON prompts, the wrong call shape for a real
multi-turn tool-calling chat history (messages/tools/tool_choice) coming from
conxa-execute's vendored opencode chat client. Provider/model resolution and
retry live in llm_config.py / llm_client.py instead.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from . import cloud_bridge, llm_client, subscription, wallet
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/entitlement")
async def get_entitlement(user_id: str = Depends(get_current_user)) -> dict:
    # A claimed Execute seat grant takes priority over personal
    # subscription/wallet — that seat is meant to draw entirely from the
    # granting workspace's shared AI Usage Credits pool.
    pool = cloud_bridge.pool_check(user_id=user_id)
    if pool.get("unknown"):
        raise HTTPException(status_code=503, detail="workspace_unreachable")
    if pool.get("bound"):
        return {
            "mode": "workspace_pool",
            "workspace_id": pool.get("workspace_id"),
            "workspace_name": pool.get("workspace_name"),
            "ok": pool.get("ok", False),
            "remaining": pool.get("remaining"),
        }
    sub = subscription.get_active_subscription(user_id)
    if sub is not None:
        return {
            "mode": "subscription",
            "plan_id": sub["plan_id"],
            "quota_used": sub["quota_used"],
            "quota_total": sub["quota_total"],
            "period_end": sub["period_end"],
            "topup_balance": wallet.get_balance(user_id),
        }
    balance = wallet.get_balance(user_id)
    return {"mode": "topup" if balance > 0 else "none", "topup_balance": balance}


@router.post("/v1/chat/completions")
async def chat_completions(request: Request, user_id: str = Depends(get_current_user)) -> JSONResponse:
    pool = cloud_bridge.pool_check(user_id=user_id)
    if pool.get("unknown"):
        # Cloud is unreachable and we genuinely don't know whether this user
        # is workspace-pool-bound — billing personal wallet/subscription would
        # risk charging the wrong bucket for a pool-bound user, so refuse the
        # turn rather than guess.
        return JSONResponse(
            status_code=503,
            content={"error": {"message": "Couldn't reach your workspace, so this chat wasn't run. Try again shortly.", "type": "workspace_unreachable"}},
        )
    pool_bound = pool.get("bound", False)

    if pool_bound:
        if not pool.get("ok"):
            return JSONResponse(
                status_code=402,
                content={
                    "error": {
                        "message": "Your workspace's AI Usage Credits pool is exhausted",
                        "type": "insufficient_quota",
                    }
                },
            )
    else:
        sub = subscription.get_active_subscription(user_id)
        has_subscription_quota = sub is not None and sub["quota_used"] < sub["quota_total"]
        if not has_subscription_quota and wallet.get_balance(user_id) <= 0:
            return JSONResponse(
                status_code=402,
                content={"error": {"message": "Out of tokens. Buy more from within CONXA's Settings.", "type": "insufficient_quota"}},
            )

    body = await request.json()

    # ponytail: balance is checked before the call and debited by actual usage
    # after — the last request on a near-empty balance can run slightly over.
    # Not worth pre-flight cost estimation for a single-turn-at-a-time desktop
    # client; add reservation if abused.
    try:
        data = llm_client.call_chat_completions(body)
    except RuntimeError as exc:
        status = 500 if str(exc) == "no_llm_providers_configured" else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    usage_block = data.get("usage")
    if not usage_block:
        # A provider that omits `usage` isn't a zero-cost call — debiting 0
        # would give this request away for free every time it happens. Log it
        # so a persistently silent provider gets noticed, and debit a rough
        # estimate from the request/response bodies instead of nothing.
        estimated = (len(str(body)) + len(str(data))) // 4
        logger.warning("chat_completions: provider omitted usage, estimating %d tokens", estimated)
        usage = estimated
    else:
        usage = int(usage_block.get("total_tokens") or 0)
    if usage and pool_bound:
        cloud_bridge.pool_debit(user_id=user_id, input_tokens=0, output_tokens=usage)
    elif usage and not subscription.debit_quota_if_available(user_id, usage):
        wallet.debit_if_available(user_id, usage)
    return JSONResponse(content=data)
