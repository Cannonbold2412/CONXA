"""Cashfree vendor mechanics for conxa-execute: token-tier catalog, order/
subscription creation, payment verification, and webhook signature checks.

Deliberately duplicated (not shared via conxa_core) from conxa-cloud's
app/api/cashfree_routes.py — these ~40 lines of pure vendor mechanics (auth
headers, base URL, both webhook HMAC schemes) are a legitimate future dedup
target now that there are 2 real consumers, but this is an unlaunched
feature and conxa-cloud's live billing code should not be touched to enable
it. Extract to packages/conxa-core once this is validated in production.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any

import httpx
from fastapi import HTTPException

from conxa_core.config import settings
from conxa_core.db import db_get, db_set

_CF_BASE = {
    "PROD": "https://api.cashfree.com",
    "TEST": "https://sandbox.cashfree.com",
}

CURRENCY = "INR"

# tier id -> tokens / price (INR) / period. period=None is a one-time pack;
# period="monthly" auto-refills (adds, never resets) the same amount on every
# successful renewal charge. Six tiers, floored at 250k tokens for ₹500
# (₹2.00/1k) scaling to a best rate of ₹1.50/1k at the top tier.
TOKEN_TIERS: dict[str, dict[str, Any]] = {
    "pack_250k": {"tokens": 250_000, "amount": 500, "period": None, "name": "250K Tokens"},
    "pack_500k": {"tokens": 500_000, "amount": 950, "period": None, "name": "500K Tokens"},
    "pack_1m": {"tokens": 1_000_000, "amount": 1_800, "period": None, "name": "1M Tokens"},
    "pack_2_5m": {"tokens": 2_500_000, "amount": 4_250, "period": None, "name": "2.5M Tokens"},
    "pack_5m": {"tokens": 5_000_000, "amount": 8_000, "period": None, "name": "5M Tokens"},
    "pack_10m": {"tokens": 10_000_000, "amount": 15_000, "period": None, "name": "10M Tokens"},
    "sub_250k": {"tokens": 250_000, "amount": 500, "period": "monthly", "name": "250K Tokens / month"},
    "sub_500k": {"tokens": 500_000, "amount": 950, "period": "monthly", "name": "500K Tokens / month"},
    "sub_1m": {"tokens": 1_000_000, "amount": 1_800, "period": "monthly", "name": "1M Tokens / month"},
    "sub_2_5m": {"tokens": 2_500_000, "amount": 4_250, "period": "monthly", "name": "2.5M Tokens / month"},
    "sub_5m": {"tokens": 5_000_000, "amount": 8_000, "period": "monthly", "name": "5M Tokens / month"},
    "sub_10m": {"tokens": 10_000_000, "amount": 15_000, "period": "monthly", "name": "10M Tokens / month"},
}

_SUB_PLAN_ID_FIELD = {
    "sub_250k": "cashfree_execute_sub_250k_plan_id",
    "sub_500k": "cashfree_execute_sub_500k_plan_id",
    "sub_1m": "cashfree_execute_sub_1m_plan_id",
    "sub_2_5m": "cashfree_execute_sub_2_5m_plan_id",
    "sub_5m": "cashfree_execute_sub_5m_plan_id",
    "sub_10m": "cashfree_execute_sub_10m_plan_id",
}


def _cf_base() -> str:
    return _CF_BASE.get((settings.cashfree_env or "TEST").upper(), _CF_BASE["TEST"])


def _cf_headers() -> dict[str, str]:
    if not settings.cashfree_app_id or not settings.cashfree_secret_key:
        raise HTTPException(status_code=500, detail="Cashfree credentials not configured")
    return {
        "X-Client-Id": settings.cashfree_app_id,
        "X-Client-Secret": settings.cashfree_secret_key,
        "Content-Type": "application/json",
    }


def _cf_request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    with httpx.Client(timeout=30.0) as client:
        return client.request(method, f"{_cf_base()}{path}", headers=_cf_headers(), **kwargs)


def _ensure_sub_plan_id(tier: str) -> str:
    """Return the pre-created Cashfree plan id for a subscription tier,
    creating one on the fly only outside production (mirrors conxa-cloud's
    cashfree_routes._ensure_plan dev fallback)."""
    configured = getattr(settings, _SUB_PLAN_ID_FIELD[tier], "").strip()
    if configured:
        return configured
    if settings.auth_required:
        raise HTTPException(status_code=500, detail=f"Cashfree plan id not configured for {tier}")
    store = db_get("execute_cashfree_plans", "plans") or {}
    if tier in store:
        return store[tier]
    info = TOKEN_TIERS[tier]
    plan_id = f"conxa_execute_{tier}"
    resp = _cf_request("POST", "/api/v2/subscription-plans", json={
        "planId": plan_id,
        "planName": f"CONXA {info['name']}",
        "type": "PERIODIC",
        "recurringAmount": info["amount"],
        "maxAmount": info["amount"],
        "intervals": 1,
        "intervalType": "MONTH",
    })
    if resp.status_code not in (200, 201, 409):
        raise HTTPException(status_code=500, detail=f"cashfree_plan_create_failed: {resp.text}")
    store[tier] = plan_id
    db_set("execute_cashfree_plans", "plans", store)
    return plan_id


def create_pack_order(tier: str, order_ref: str, return_url: str) -> str:
    """Create a one-time Payment Link. Returns the hosted payment page URL."""
    info = TOKEN_TIERS[tier]
    resp = _cf_request("POST", "/pg/links", json={
        "link_id": order_ref,
        "link_amount": info["amount"],
        "link_currency": CURRENCY,
        "link_purpose": f"CONXA {info['name']}",
        "customer_details": {
            "customer_email": "buyer@conxa.in",
            "customer_phone": "9999999999",
            "customer_name": "CONXA user",
        },
        "link_meta": {"return_url": return_url},
        "link_notify": {"send_email": False, "send_sms": False},
    })
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"cashfree_order_failed: {resp.text}")
    data = resp.json() if resp.content else {}
    link_url = str(data.get("link_url") or "")
    if not link_url:
        raise HTTPException(status_code=502, detail=f"cashfree_no_payment_link: {resp.text}")
    return link_url


def verify_pack_order(order_ref: str) -> bool:
    """True if the Payment Link has been paid."""
    resp = _cf_request("GET", f"/pg/links/{order_ref}")
    if resp.status_code != 200:
        return False
    data = resp.json() if resp.content else {}
    return str(data.get("link_status") or "").upper() == "PAID"


def create_sub_order(tier: str, order_ref: str, return_url: str) -> str:
    """Create a recurring subscription. Returns the hosted authorization page URL."""
    plan_id = _ensure_sub_plan_id(tier)
    info = TOKEN_TIERS[tier]
    resp = _cf_request("POST", "/api/v2/subscriptions/nonSeamless/subscription", json={
        "subscriptionId": order_ref,
        "planId": plan_id,
        "authAmount": info["amount"],
        "customerEmail": "buyer@conxa.in",
        "customerPhone": "9999999999",
        "customerName": "CONXA user",
        "returnUrl": return_url,
        "expiresOn": "2099-12-31 00:00:00",
        "notificationChannels": ["EMAIL"],
    })
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"cashfree_subscription_failed: {resp.text}")
    data = (resp.json() if resp.content else {}).get("data") or {}
    auth_link = str(data.get("authLink") or "")
    if not auth_link:
        raise HTTPException(status_code=502, detail=f"cashfree_no_auth_link: {resp.text}")
    return auth_link


def verify_sub_order(order_ref: str) -> bool:
    """True if the subscription is ACTIVE."""
    resp = _cf_request("GET", f"/api/v2/subscriptions/{order_ref}")
    if resp.status_code != 200:
        return False
    body = resp.json() if resp.content else {}
    sub = body.get("subscription") or body
    status = str(sub.get("status") or sub.get("subStatus") or "").upper()
    return status == "ACTIVE"


def webhook_signature(payload: dict[str, Any], secret: str) -> str:
    """Cashfree subscriptions v1 webhook signature: sort cf_-prefixed fields
    alphabetically, concatenate key+value with no delimiter, HMAC-SHA256,
    base64-encode."""
    cf_fields = {k: v for k, v in payload.items() if k.startswith("cf_")}
    message = "".join(f"{k}{payload[k]}" for k in sorted(cf_fields))
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def order_webhook_signature(timestamp: str, raw_body: bytes, secret: str) -> str:
    """Cashfree PG webhook signature: HMAC-SHA256 over timestamp + raw body
    (a different scheme from the subscriptions v1 webhook above)."""
    digest = hmac.new(secret.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()
