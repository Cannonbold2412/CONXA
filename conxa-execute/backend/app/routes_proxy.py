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

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from . import llm_client, subscription, wallet
from .auth import get_current_user

router = APIRouter()


@router.get("/v1/wallet")
async def get_wallet(user_id: str = Depends(get_current_user)) -> dict:
    return {"balance": wallet.get_balance(user_id)}


@router.get("/v1/entitlement")
async def get_entitlement(user_id: str = Depends(get_current_user)) -> dict:
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
    sub = subscription.get_active_subscription(user_id)
    has_subscription_quota = sub is not None and sub["quota_used"] < sub["quota_total"]
    if not has_subscription_quota and wallet.get_balance(user_id) <= 0:
        return JSONResponse(
            status_code=402,
            content={"error": {"message": "Out of tokens — top up at /plans", "type": "insufficient_quota"}},
        )

    body = await request.json()
    body.pop("stream", None)  # run_turn.js never streams; strip defensively either way

    # ponytail: balance is checked before the call and debited by actual usage
    # after — the last request on a near-empty balance can run slightly over.
    # Not worth pre-flight cost estimation for a single-turn-at-a-time desktop
    # client; add reservation if abused.
    try:
        data = llm_client.call_chat_completions(body)
    except RuntimeError as exc:
        status = 500 if str(exc) == "no_llm_providers_configured" else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    usage = int((data.get("usage") or {}).get("total_tokens") or 0)
    if usage and not subscription.debit_quota_if_available(user_id, usage):
        wallet.debit_if_available(user_id, usage)
    return JSONResponse(content=data)
