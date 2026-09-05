"""Checkout for conxa-execute's plans: a purchase attaches to the buyer's
Clerk account, not an opaque pasted key.

`/plans` is a plain informational price list — the actual purchase happens
via the authenticated `POST /v1/checkout/{tier}` JSON endpoint, called by the
signed-in Electron app, which then opens the returned Cashfree hosted page in
the OS browser (no Clerk context exists once the browser takes over, which is
why `/checkout/success` below is an unauthenticated redirect target keyed by
`order_ref` instead of a bearer token). Cashfree hosts the actual payment
page — these routes only create the order/subscription, verify it, and grant
once.
"""
from __future__ import annotations

import hmac
import json
import logging
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from conxa_core.config import settings
from conxa_core.db import db_get, db_set

from . import cashfree, subscription, wallet
from .auth import get_current_user
from .cashfree import TOKEN_TIERS
from .plans import PLAN_TIERS

logger = logging.getLogger(__name__)
router = APIRouter()

_ORDER_USER_NS = "execute_order_user"
_ADDON_GRANTED_NS = "execute_addon_granted"
_SUB_CHARGE_GRANTED_NS = "execute_sub_charge_granted"


def _already_granted(namespace: str, idempotency_key: str) -> bool:
    return bool(db_get(namespace, idempotency_key))


def _mark_granted(namespace: str, idempotency_key: str, info: dict) -> None:
    db_set(namespace, idempotency_key, info)


@router.get("/plans", response_class=HTMLResponse)
def list_plans() -> str:
    packs = sorted(
        ((t, i) for t, i in TOKEN_TIERS.items() if i["period"] is None),
        key=lambda kv: kv[1]["tokens"],
    )
    subs = sorted(PLAN_TIERS.items(), key=lambda kv: kv[1]["monthly_quota"])

    def _pack_rows() -> str:
        return "".join(
            f"<li><strong>{info['name']}</strong> &mdash; &#8377;{info['amount']:,}</li>"
            for _tier, info in packs
        )

    def _sub_rows() -> str:
        return "".join(
            f"<li><strong>{info['name']}</strong> &mdash; &#8377;{info['amount']:,}, "
            f"resets to {info['monthly_quota']:,} every period</li>"
            for _tier, info in subs
        )

    return f"""<!doctype html><html><head><meta charset="utf-8"><title>CONXA &mdash; Plans</title></head>
    <body style="font-family:sans-serif;max-width:640px;margin:40px auto">
      <h1>One-time token packs</h1>
      <ul>{_pack_rows()}</ul>
      <h1>Monthly subscriptions</h1>
      <ul>{_sub_rows()}</ul>
      <p>Buy from within the CONXA app after signing in — purchases attach to your account.</p>
    </body></html>"""


@router.post("/v1/checkout/{tier}")
async def checkout(tier: str, user_id: str = Depends(get_current_user)) -> JSONResponse:
    if tier not in TOKEN_TIERS:
        raise HTTPException(status_code=404, detail="unknown_plan")
    order_ref = f"exec_{secrets.token_hex(8)}_{tier}_{int(time.time())}"
    db_set(_ORDER_USER_NS, order_ref, {"tier": tier, "user_id": user_id})
    return_url = f"{settings.api_base_url}/checkout/success?ref={order_ref}"
    if TOKEN_TIERS[tier]["period"] is None:
        link = cashfree.create_pack_order(tier, order_ref, return_url)
    else:
        link = cashfree.create_sub_order(tier, order_ref, return_url)
    return JSONResponse(content={"checkout_url": link})


@router.get("/checkout/success", response_class=HTMLResponse)
def checkout_success(ref: str) -> str:
    mapping = db_get(_ORDER_USER_NS, ref)
    if not mapping:
        raise HTTPException(status_code=404, detail="unknown_order")
    tier = mapping["tier"]
    info = TOKEN_TIERS[tier]
    user_id = mapping["user_id"]

    if info["period"] is None:
        if not cashfree.verify_pack_order(ref):
            return "<h1>Payment not confirmed yet</h1><p>Refresh in a moment.</p>"
        if not _already_granted(_ADDON_GRANTED_NS, ref):
            wallet.credit(user_id, info["tokens"])
            _mark_granted(_ADDON_GRANTED_NS, ref, {"user_id": user_id, "tokens": info["tokens"]})
        balance = wallet.get_balance(user_id)
        return f"<h1>Topped up!</h1><p>New balance: {balance:,} tokens.</p><p>Return to the CONXA app.</p>"

    if not cashfree.verify_sub_order(ref):
        return "<h1>Subscription not active yet</h1><p>Refresh in a moment.</p>"
    # Subscription quota activates via the recurring webhook, not here — this
    # page only confirms authorization. A brand-new subscriber may see the
    # plan as "pending" for a few minutes until the first charge webhook lands.
    return "<h1>Subscription confirmed!</h1><p>Return to the CONXA app — your plan activates within a few minutes.</p>"


@router.post("/webhooks/cashfree-orders")
async def webhook_cashfree_orders(request: Request) -> dict[str, bool]:
    """One-time pack payment webhook — credits the wallet exactly once."""
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid_json") from None

    if settings.cashfree_webhook_secret:
        timestamp = request.headers.get("x-webhook-timestamp", "")
        received_sig = request.headers.get("x-webhook-signature", "")
        expected = cashfree.order_webhook_signature(timestamp, raw_body, settings.cashfree_webhook_secret)
        if not received_sig or not hmac.compare_digest(expected, received_sig):
            raise HTTPException(status_code=400, detail="invalid_signature")

    event_type = str(payload.get("type") or "")
    data = payload.get("data") or {}
    link = data.get("link") or {}
    order_ref = str(link.get("link_id") or "")

    if event_type == "PAYMENT_SUCCESS_WEBHOOK" and order_ref:
        mapping = db_get(_ORDER_USER_NS, order_ref) or {}
        tier = mapping.get("tier")
        user_id = mapping.get("user_id")
        if tier in TOKEN_TIERS and user_id:
            if not _already_granted(_ADDON_GRANTED_NS, order_ref):
                wallet.credit(user_id, TOKEN_TIERS[tier]["tokens"])
                _mark_granted(_ADDON_GRANTED_NS, order_ref, {"user_id": user_id, "tokens": TOKEN_TIERS[tier]["tokens"]})
        else:
            logger.warning("execute_order_webhook_unmapped order_ref=%s", order_ref)
    else:
        logger.info("execute_order_webhook_ignored type=%s order_ref=%s", event_type, order_ref)

    return {"received": True}


@router.post("/webhooks/cashfree")
async def webhook_cashfree(request: Request) -> dict[str, bool]:
    """Subscription webhook — (re)activates the plan's quota on every new
    charge, keyed by a per-charge idempotency key so renewals stack rather
    than double-reset on webhook replay."""
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid_json") from None

    if settings.cashfree_webhook_secret:
        expected = cashfree.webhook_signature(payload, settings.cashfree_webhook_secret)
        received_sig = payload.get("signature", "")
        if received_sig and not hmac.compare_digest(expected, received_sig):
            raise HTTPException(status_code=400, detail="invalid_signature")

    event_type = str(payload.get("cf_event") or "")
    order_ref = str(payload.get("cf_subReferenceId") or "")

    if event_type == "SUBSCRIPTION_NEW_PAYMENT" and order_ref:
        mapping = db_get(_ORDER_USER_NS, order_ref) or {}
        tier = mapping.get("tier")
        user_id = mapping.get("user_id")
        if tier in PLAN_TIERS and user_id:
            # TODO: confirm Cashfree v2's exact per-charge id field against a real
            # sandbox payload before launch (not documented in the existing
            # cashfree_routes.py, which never needed per-charge idempotency).
            # Falls back to a composite key so at minimum a replay of the SAME
            # webhook body stays idempotent even without the ideal field.
            charge_id = str(
                payload.get("cf_paymentId")
                or payload.get("cf_txId")
                or f"{order_ref}:{payload.get('cf_txTime', '')}"
            )
            if not _already_granted(_SUB_CHARGE_GRANTED_NS, charge_id):
                subscription.activate_or_renew(user_id, tier, order_ref)
                _mark_granted(_SUB_CHARGE_GRANTED_NS, charge_id, {"user_id": user_id, "tier": tier})
        else:
            logger.warning("execute_sub_webhook_unmapped order_ref=%s", order_ref)
    else:
        logger.info("execute_sub_webhook_ignored event=%s order_ref=%s", event_type, order_ref)

    return {"received": True}
