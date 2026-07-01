"""Cashfree Subscription Management endpoints — plans, subscriptions, webhooks, and verification."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from conxa_core.config import settings
from conxa_core.db import db_get, db_set
from app.services.rbac import require_admin
from app.services.saas import Principal, ensure_principal, principal_from_request, upsert_billing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

CASHFREE_TOTAL_CYCLES = 1200

# Cashfree Subscription Management API v1
# Note: subscription-management v1 uses test.cashfree.com / www.cashfree.com,
# NOT sandbox.cashfree.com / api.cashfree.com (those are for the newer payments API)
_CF_BASE = {
    "PROD": "https://www.cashfree.com",
    "TEST": "https://test.cashfree.com",
}


def current_principal(request: Request) -> Principal:
    principal = principal_from_request(request)
    ensure_principal(principal)
    return principal


TIER_INFO = {
    "free": {
        "name": "Free",
        "amount": 0,
        "currency": "INR",
        "period": None,
        "features": ["1 seat", "1 installer slot", "50 compile credits/month", "1M Human Edit tokens/month"],
    },
    "starter": {
        "name": "Starter",
        "amount": 29999,  # INR (Cashfree uses actual rupees, not paise)
        "currency": "INR",
        "period": "monthly",
        "features": ["3 seats", "3 installer slots", "300 compile credits/month", "10M Human Edit tokens/month"],
    },
    "pro": {
        "name": "Pro",
        "amount": 79999,  # INR
        "currency": "INR",
        "period": "monthly",
        "features": ["10 seats", "10 installer slots", "1000 compile credits/month", "50M Human Edit tokens/month"],
    },
}


def _normalize_tier(tier: str) -> str:
    value = str(tier or "").strip().lower()
    return "starter" if value == "basic" else value


def _cf_base() -> str:
    env = (settings.cashfree_env or "TEST").upper()
    return _CF_BASE.get(env, _CF_BASE["TEST"])


def _cf_headers() -> dict[str, str]:
    if not settings.cashfree_app_id or not settings.cashfree_secret_key:
        raise HTTPException(status_code=500, detail="Cashfree credentials not configured")
    return {
        "X-Client-Id": settings.cashfree_app_id,
        "X-Client-Secret": settings.cashfree_secret_key,
        "Content-Type": "application/json",
    }


def _cf_request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    url = f"{_cf_base()}{path}"
    with httpx.Client(timeout=30.0) as client:
        return client.request(method, url, headers=_cf_headers(), **kwargs)


def _configured_plan_id(tier: str) -> str:
    if tier == "starter":
        return settings.cashfree_starter_plan_id.strip()
    if tier == "pro":
        return settings.cashfree_pro_plan_id.strip()
    return ""


def _plan_store_path() -> Path:
    return settings.data_dir / "cashfree_plans.json"


def _read_plan_store() -> dict[str, str]:
    data = db_get("cashfree", "plans")
    if data is not None:
        return data
    path = _plan_store_path()
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _write_plan_store(store: dict[str, str]) -> None:
    db_set("cashfree", "plans", store)
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        _plan_store_path().write_text(json.dumps(store, indent=2))
    except OSError:
        pass


def _plan_store_key(tier: str) -> str:
    info = TIER_INFO[tier]
    return f"{tier}:{info['currency']}:{info['amount']}"


def _tier_from_plan_store_key(key: str) -> str:
    return _normalize_tier(str(key).split(":", 1)[0])


def _tier_for_plan_id(plan_id: str) -> str | None:
    if not plan_id:
        return None
    configured = {
        "starter": settings.cashfree_starter_plan_id.strip(),
        "pro": settings.cashfree_pro_plan_id.strip(),
    }
    for tier, configured_plan_id in configured.items():
        if configured_plan_id and plan_id == configured_plan_id:
            return tier
    for key, stored_plan_id in _read_plan_store().items():
        if plan_id == stored_plan_id:
            tier = _tier_from_plan_store_key(key)
            if tier in TIER_INFO and tier != "free":
                return tier
    return None


def _parse_next_charge(subscription: dict[str, Any]) -> int | None:
    """Parse next charge timestamp from Cashfree subscription (YYYY-MM-DD HH:MM:SS format)."""
    for key in ("nextChargeOn", "expiresOn", "next_payment_time"):
        value = subscription.get(key)
        if not value:
            continue
        try:
            # Cashfree v1 format: "2024-02-01 00:00:00"
            dt = datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            try:
                # ISO format fallback
                dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                return int(dt.timestamp())
            except (ValueError, AttributeError):
                pass
    return None


def _exception_detail(exc: Exception) -> str:
    message = str(exc).strip()
    if message and message.lower() != "none":
        return message
    args = [str(arg).strip() for arg in getattr(exc, "args", ()) if arg is not None and str(arg).strip()]
    if args:
        return "; ".join(args)
    return exc.__class__.__name__


def _ensure_plan(tier: str) -> str:
    """Create or retrieve Cashfree plan ID for tier. Returns plan_id."""
    tier = _normalize_tier(tier)
    if tier not in TIER_INFO or tier == "free":
        raise HTTPException(status_code=400, detail=f"invalid tier: {tier}")
    configured_plan_id = _configured_plan_id(tier)
    if configured_plan_id:
        return configured_plan_id
    if settings.auth_required:
        raise HTTPException(
            status_code=500,
            detail=f"Cashfree {tier} plan ID not configured",
        )
    store = _read_plan_store()
    plan_key = _plan_store_key(tier)
    if plan_key in store:
        return store[plan_key]
    info = TIER_INFO[tier]
    plan_id = f"conxa_{tier}_monthly"
    try:
        resp = _cf_request("POST", "/api/v1/subscription-management/plans", json={
            "appId": settings.cashfree_app_id,
            "secretKey": settings.cashfree_secret_key,
            "planId": plan_id,
            "planName": f"Conxa {info['name']} Plan",
            "type": "PERIODIC",
            "amount": info["amount"],
            "currency": info["currency"],
            "intervals": 1,
            "intervalType": "MONTH",
            "maxCycles": CASHFREE_TOTAL_CYCLES,
        })
        body = resp.json() if resp.content else {}
        if resp.status_code not in (200, 201) and body.get("status") != "OK":
            # 409 means plan already exists — treat as success
            if resp.status_code != 409:
                raise HTTPException(status_code=500, detail=f"cashfree_plan_create_failed: {resp.text}")
        store[plan_key] = plan_id
        _write_plan_store(store)
        return plan_id
    except HTTPException:
        raise
    except Exception as exc:
        detail = _exception_detail(exc)
        logger.exception("cashfree_plan_create_failed tier=%s error=%s", tier, detail)
        raise HTTPException(status_code=500, detail=f"failed_to_create_plan: {detail}") from exc


@router.get("/plans")
def list_plans() -> dict[str, Any]:
    """Return available subscription tiers with features and pricing."""
    return {
        "plans": [
            {
                "tier": "free",
                "name": TIER_INFO["free"]["name"],
                "amount": 0,
                "currency": "INR",
                "period": None,
                "features": TIER_INFO["free"]["features"],
            },
            {
                "tier": "starter",
                "name": TIER_INFO["starter"]["name"],
                "amount": TIER_INFO["starter"]["amount"],
                "currency": "INR",
                "period": "monthly",
                "features": TIER_INFO["starter"]["features"],
            },
            {
                "tier": "pro",
                "name": TIER_INFO["pro"]["name"],
                "amount": TIER_INFO["pro"]["amount"],
                "currency": "INR",
                "period": "monthly",
                "features": TIER_INFO["pro"]["features"],
            },
        ]
    }


@router.post("/create")
async def create_subscription(
    body: dict[str, str],
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Create a Cashfree subscription for a tier. Returns subscription_id and auth_link."""
    require_admin(principal)
    tier = _normalize_tier(body.get("tier", ""))
    if tier not in ["starter", "pro"]:
        raise HTTPException(status_code=400, detail="tier must be 'starter' or 'pro'")
    try:
        plan_id = _ensure_plan(tier)
        info = TIER_INFO[tier]
        sub_id = f"conxa_{principal.workspace_id}_{tier}_{int(time.time())}"
        customer_email = body.get("customer_email") or "user@conxa.in"
        customer_phone = body.get("customer_phone") or "9999999999"
        return_url = f"{settings.app_url}/billing"
        resp = _cf_request("POST", "/api/v1/subscription-management/subscriptions", json={
            "appId": settings.cashfree_app_id,
            "secretKey": settings.cashfree_secret_key,
            "subscriptionId": sub_id,
            "planId": plan_id,
            "customerEmail": customer_email,
            "customerPhone": customer_phone,
            "customerName": principal.workspace_id,
            "returnUrl": return_url,
            "expiresOn": "2099-12-31 00:00:00",
            "notificationChannels": ["EMAIL"],
            "tags": {
                "workspace_id": principal.workspace_id,
                "tier": tier,
            },
        })
        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=500,
                detail=f"cashfree_subscription_create_failed: {resp.text}",
            )
        subscription = resp.json()
        if subscription.get("status") not in ("OK", None) and resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=500,
                detail=f"cashfree_error: {subscription.get('message', resp.text)}",
            )
        return {
            "subscription_id": subscription.get("subscriptionId") or sub_id,
            "auth_link": subscription.get("authLink", ""),
            "plan_id": plan_id,
            "amount": info["amount"],
            "currency": info["currency"],
            "tier": tier,
        }
    except HTTPException:
        raise
    except Exception as exc:
        detail = _exception_detail(exc)
        logger.exception(
            "cashfree_subscription_create_failed workspace_id=%s tier=%s error=%s",
            principal.workspace_id,
            tier,
            detail,
        )
        raise HTTPException(status_code=500, detail=f"subscription_error: {detail}") from exc


@router.post("/verify")
async def verify_subscription(
    body: dict[str, str],
    principal: Principal = Depends(current_principal),
) -> dict[str, bool]:
    """Verify subscription status via Cashfree API and update billing record."""
    subscription_id = body.get("subscription_id", "")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="missing_fields")
    if not settings.cashfree_app_id:
        raise HTTPException(status_code=500, detail="Cashfree credentials not configured")
    try:
        resp = _cf_request(
            "GET",
            f"/api/v1/subscription-management/subscriptions/{subscription_id}",
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"subscription_fetch_failed: {resp.text}")
        subscription = resp.json()
        status = str(subscription.get("status", "")).upper()
        plan_id = str(subscription.get("planId") or "")
        tier = _tier_for_plan_id(plan_id)
        if not tier:
            tier_tag = subscription.get("tags", {}).get("tier", "")
            tier = _normalize_tier(tier_tag) if tier_tag else None
        if not tier or tier == "free":
            raise HTTPException(status_code=400, detail="unknown_plan")
        upsert_billing(principal.workspace_id, {
            "plan": tier,
            "status": "active",
            "subscription_id": subscription_id,
            "current_period_end": _parse_next_charge(subscription),
        })
        logger.info(
            "cashfree_subscription_verified workspace_id=%s tier=%s status=%s",
            principal.workspace_id,
            tier,
            status,
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"verify_error: {_exception_detail(exc)}") from exc


@router.post("/webhooks/cashfree")
async def handle_cashfree_webhook(request: Request) -> dict[str, bool]:
    """Handle Cashfree webhook events for subscriptions."""
    body = await request.body()

    if settings.cashfree_webhook_secret:
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="invalid_json") from None
        # Cashfree v1 subscription webhook: SHA256(subscriptionId + secretKey), base64-encoded
        sub_id_for_sig = str(payload.get("subscriptionId", ""))
        expected = base64.b64encode(
            hashlib.sha256(
                f"{sub_id_for_sig}{settings.cashfree_webhook_secret}".encode()
            ).digest()
        ).decode()
        received_sig = payload.get("signature", "")
        if received_sig and not hashlib.compare_digest(expected, received_sig):
            raise HTTPException(status_code=400, detail="invalid_signature")
        event = payload
    else:
        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="invalid_json") from None

    event_type = event.get("event", "")
    subscription_id = event.get("subscriptionId", "")
    plan_id = event.get("planId", "")
    tags = event.get("tags") or {}
    workspace_id = tags.get("workspace_id", "")

    if event_type in ("SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_CHARGED", "SUBSCRIPTION_NEW"):
        if workspace_id and subscription_id:
            try:
                tier = _tier_for_plan_id(plan_id) or _normalize_tier(tags.get("tier", ""))
                if tier and tier != "free":
                    upsert_billing(
                        workspace_id,
                        {
                            "plan": tier,
                            "status": "active",
                            "subscription_id": subscription_id,
                            "current_period_end": _parse_next_charge(event),
                        },
                    )
            except Exception:
                logger.exception(
                    "cashfree_webhook_billing_update_failed event=%s workspace_id=%s",
                    event_type,
                    workspace_id,
                )
    elif event_type in ("SUBSCRIPTION_CANCELLED", "SUBSCRIPTION_CANCELLED_BY_MERCHANT", "SUBSCRIPTION_EXPIRED"):
        if workspace_id:
            try:
                upsert_billing(
                    workspace_id,
                    {
                        "plan": "free",
                        "status": "inactive",
                        "current_period_end": None,
                    },
                )
            except Exception:
                logger.exception(
                    "cashfree_webhook_cancel_failed event=%s workspace_id=%s",
                    event_type,
                    workspace_id,
                )

    return {"received": True}
