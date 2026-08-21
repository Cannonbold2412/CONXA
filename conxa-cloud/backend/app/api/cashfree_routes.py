"""Cashfree Subscription Management endpoints — plans, subscriptions, webhooks, and verification."""

from __future__ import annotations

import base64
import hashlib
import hmac
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
from app.api.deps import current_principal
from app.services.entitlements import ADDON_TIERS, PLAN_LIMITS
from app.services.rbac import require_admin
from app.services.saas import Principal, upsert_billing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Cashfree Subscriptions v1 API (subscription-plans / subscriptions/nonSeamless)
_CF_BASE = {
    "PROD": "https://api.cashfree.com",
    "TEST": "https://sandbox.cashfree.com",
}


def _plan_features(tier: str) -> list[str]:
    """Derive the human-readable feature list from the single source of truth
    (``PLAN_LIMITS`` in the entitlements service) so pricing copy can never drift
    from what is actually enforced. Order mirrors the capability ladder in
    docs/PRD.md §11: reach (seats/machines), spend (credits/tokens), then what
    the plan unlocks (distribution, ops depth, retention, BYOK)."""
    limits = PLAN_LIMITS.get(tier, {})

    # Enterprise carries 0 for the numeric limits because they come from contractual
    # overrides in billing metadata, not from this table. Rendering that 0 literally put
    # "0 seats" on the public pricing cards, which reads as a broken tier rather than a
    # negotiated one — so 0 means "agreed per contract" here, never a real ceiling.
    def _seat(n: int | None) -> str:
        if n is None:
            return "Unlimited seats"
        return "Seats agreed per contract" if n == 0 else f"{n} seat" + ("s" if n != 1 else "")

    def _machine(n: int | None) -> str:
        if n is None:
            return "Unlimited machines"
        return "Machines agreed per contract" if n == 0 else f"{n} machine" + ("s" if n != 1 else "")

    def _credits(n: int | None) -> str:
        return "Unlimited compile credits/month" if n is None else f"{n} compile credits/month"

    def _tokens(n: int | None) -> str:
        if n is None:
            return "Unlimited Human Edit tokens/month"
        if n == 0:
            return "Contracted Human Edit token reserve"
        if n >= 1_000_000:
            return f"{n // 1_000_000}M Human Edit tokens/month"
        return f"{n // 1_000}K Human Edit tokens/month"

    def _distribution(dist: str, white_label: bool) -> str:
        if dist != "external":
            return "Internal distribution only"
        return "External distribution, white-label" if white_label else "External distribution, Conxa-branded"

    def _ops(ops_tier: str) -> str:
        return {"none": "No ops dashboard", "basic": "Basic dashboard", "full": "Full dashboard, drift detection, audit export"}.get(
            ops_tier, "No ops dashboard"
        )

    def _retention(n: int | None) -> str:
        if n is None:
            return "Custom analytics retention"
        return "No analytics retention" if n == 0 else f"{n}-day analytics retention"

    features = [
        _seat(limits.get("seats")),
        _machine(limits.get("machines")),
        _credits(limits.get("compile_credits")),
        _tokens(limits.get("human_edit_tokens")),
        _distribution(str(limits.get("distribution") or "internal"), bool(limits.get("white_label"))),
        _ops(str(limits.get("ops_tier") or "none")),
        _retention(limits.get("analytics_retention_days")),
    ]
    if limits.get("byok"):
        features.append("Bring your own key (Azure OpenAI)")
    return features


TIER_INFO = {
    "free": {
        "name": "Free",
        "amount": 0,
        "currency": "INR",
        "period": None,
        "features": _plan_features("free"),
    },
    "starter": {
        "name": "Starter",
        "amount": 19_999,  # INR (Cashfree uses actual rupees, not paise)
        "currency": "INR",
        "period": "monthly",
        "features": _plan_features("starter"),
    },
    "pro": {
        "name": "Pro",
        "amount": 49_999,  # INR
        "currency": "INR",
        "period": "monthly",
        "features": _plan_features("pro"),
    },
    "enterprise": {
        "name": "Enterprise",
        "amount": 99_999,  # INR — floor of a negotiated, custom price
        "currency": "INR",
        "period": "monthly",
        "features": _plan_features("enterprise"),
    },
}
# Compile add-on packs stack on Starter or Pro (catalog + limits math live in
# entitlements.ADDON_TIERS; ₹3,999 for +20 compiles + 200k Human Edit tokens,
# larger packs priced proportionally).
for _addon_tier, _addon in ADDON_TIERS.items():
    TIER_INFO[_addon_tier] = {
        "name": f"+{_addon['compile_credits']} compiles",
        "amount": _addon["amount"],
        "currency": _addon["currency"],
        "period": "monthly",
        "features": [
            f"+{_addon['compile_credits']} compile credits/month",
            f"+{_addon['human_edit_tokens']:,} Human Edit tokens/month",
            "Stacks with Starter or Pro",
        ],
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
    addon_fields = {
        "credits_addon_20": settings.cashfree_addon_20_plan_id,
        "credits_addon_50": settings.cashfree_addon_50_plan_id,
        "credits_addon_100": settings.cashfree_addon_100_plan_id,
        "credits_addon_250": settings.cashfree_addon_250_plan_id,
    }
    return str(addon_fields.get(tier, "") or "").strip()


def _bump_addon_packs(workspace_id: str, tier: str, delta: int) -> None:
    """+1 on add-on activation, -1 (floored at 0) on cancellation, per pack
    tier. Reads current state via upsert_billing's own read-then-merge rather
    than adding a second billing-read path — an empty patch returns the record
    unchanged."""
    current = upsert_billing(workspace_id, {})
    addons = dict(current.get("addons") or {})
    addons[tier] = max(0, int(addons.get(tier) or 0) + delta)
    upsert_billing(workspace_id, {"addons": addons})


def _record_addon_subscription(workspace_id: str, tier: str, subscription_id: str) -> None:
    """Remember which Cashfree mandate backs a given add-on tier so the Billing
    page can cancel it later. One entry per tier — re-buying an already-active
    tier replaces the remembered id with the newer mandate."""
    current = upsert_billing(workspace_id, {})
    subs = dict(current.get("addon_subscriptions") or {})
    subs[tier] = subscription_id
    upsert_billing(workspace_id, {"addon_subscriptions": subs})


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
        "credits_addon_20": settings.cashfree_addon_20_plan_id.strip(),
        "credits_addon_50": settings.cashfree_addon_50_plan_id.strip(),
        "credits_addon_100": settings.cashfree_addon_100_plan_id.strip(),
        "credits_addon_250": settings.cashfree_addon_250_plan_id.strip(),
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
        resp = _cf_request("POST", "/api/v2/subscription-plans", json={
            "planId": plan_id,
            "planName": f"Conxa {info['name']} Plan",
            "type": "PERIODIC",
            "recurringAmount": info["amount"],
            "maxAmount": info["amount"],
            "intervals": 1,
            "intervalType": "MONTH",
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
    """Return the four public tiers with features and pricing. This is what the
    marketing pricing page renders — deriving straight from TIER_INFO (itself
    built from PLAN_LIMITS via _plan_features) is what keeps the public price
    sheet from ever drifting out of sync with what's actually enforced. The
    add-on plan is deliberately excluded — it's a checkout item, not a tier."""
    return {
        "plans": [
            {"tier": tier, **TIER_INFO[tier]}
            for tier in ("free", "starter", "pro", "enterprise")
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
    allowed = ["starter", "pro", *ADDON_TIERS]
    if tier not in allowed:
        raise HTTPException(status_code=400, detail="tier must be 'starter', 'pro', or an add-on tier")
    try:
        plan_id = _ensure_plan(tier)
        info = TIER_INFO[tier]
        sub_id = f"conxa_{principal.workspace_id}_{tier}_{int(time.time())}"
        customer_email = body.get("customer_email") or "user@conxa.in"
        customer_phone = body.get("customer_phone") or "9999999999"
        return_url = f"{settings.app_url}/billing"
        resp = _cf_request("POST", "/api/v2/subscriptions/nonSeamless/subscription", json={
            "subscriptionId": sub_id,
            "planId": plan_id,
            "authAmount": info["amount"],
            "customerEmail": customer_email,
            "customerPhone": customer_phone,
            "customerName": principal.workspace_id,
            "returnUrl": return_url,
            "expiresOn": "2099-12-31 00:00:00",
            "notificationChannels": ["EMAIL"],
        })
        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=500,
                detail=f"cashfree_subscription_create_failed: {resp.text}",
            )
        body_json = resp.json() if resp.content else {}
        data = body_json.get("data") or {}
        sub_reference_id = str(data.get("subReferenceId") or "")
        if not sub_reference_id:
            raise HTTPException(status_code=500, detail=f"cashfree_no_reference_id: {resp.text}")
        # Webhooks only carry Cashfree's subReferenceId (cf_planId is not a documented
        # webhook field), so remember workspace/tier here for lookup on webhook delivery.
        db_set("cashfree_sub_workspace", sub_reference_id, {
            "workspace_id": principal.workspace_id,
            "tier": tier,
        })
        return {
            "subscription_id": sub_reference_id,
            "auth_link": data.get("authLink", ""),
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
            f"/api/v2/subscriptions/{subscription_id}",
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"subscription_fetch_failed: {resp.text}")
        body_json = resp.json() if resp.content else {}
        subscription = body_json.get("subscription") or body_json
        status = str(
            subscription.get("status") or subscription.get("subStatus")
            or subscription.get("subscriptionStatus") or ""
        ).upper()
        plan_id = str(subscription.get("planId") or "")
        tier = _tier_for_plan_id(plan_id)
        if not tier or tier == "free":
            raise HTTPException(status_code=400, detail="unknown_plan")
        if tier in ADDON_TIERS:
            # Stacks on top of whatever plan is already active — never touches
            # plan/status/current_period_end, which belong to the base subscription.
            _bump_addon_packs(principal.workspace_id, tier, 1)
            _record_addon_subscription(principal.workspace_id, tier, subscription_id)
        else:
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


@router.get("/addons")
def list_addons() -> dict[str, Any]:
    """Public add-on catalog for the Billing page. Add-ons are checkout items,
    deliberately excluded from /plans — this is their dedicated read side."""
    return {
        "addons": [
            {"tier": tier, **TIER_INFO[tier], **ADDON_TIERS[tier]}
            for tier in sorted(ADDON_TIERS, key=lambda t: ADDON_TIERS[t]["compile_credits"])
        ]
    }


@router.post("/addon/cancel")
def cancel_addon_subscription(
    body: dict[str, str],
    principal: Principal = Depends(current_principal),
) -> dict[str, Any]:
    """Cancel one compile add-on pack's mandate at Cashfree. Body: {tier} —
    e.g. credits_addon_20. The pack count is decremented by the webhook handler
    when Cashfree confirms cancellation; this endpoint never touches the
    addons map itself, so a webhook replay can't double-decrement."""
    require_admin(principal)
    tier = _normalize_tier(body.get("tier", ""))
    if tier not in ADDON_TIERS:
        raise HTTPException(status_code=400, detail="unknown_addon_tier")
    billing = upsert_billing(principal.workspace_id, {})
    subscription_id = str((billing.get("addon_subscriptions") or {}).get(tier) or "")
    packs = int((billing.get("addons") or {}).get(tier) or 0)
    if not packs or not subscription_id:
        raise HTTPException(status_code=400, detail="no_active_addon")
    try:
        resp = _cf_request("POST", f"/api/v2/subscriptions/{subscription_id}/cancel")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"cashfree_addon_cancel_failed: {_exception_detail(exc)}",
        ) from exc
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"cashfree_addon_cancel_failed: {resp.text}",
        )
    # Forget the mandate immediately so a second cancel can't hit it again;
    # the webhook owns the pack decrement.
    current = upsert_billing(principal.workspace_id, {})
    subs = dict(current.get("addon_subscriptions") or {})
    subs.pop(tier, None)
    upsert_billing(principal.workspace_id, {"addon_subscriptions": subs})
    logger.info(
        "cashfree_addon_cancel_requested workspace_id=%s tier=%s subscription_id=%s",
        principal.workspace_id,
        tier,
        subscription_id,
    )
    return {"cancelled": True, "tier": tier, "subscription_id": subscription_id}


def _cf_webhook_signature(payload: dict[str, Any], secret: str) -> str:
    """Cashfree subscriptions v1 webhook signature: sort cf_-prefixed fields
    alphabetically, concatenate key+value with no delimiter, HMAC-SHA256 with
    the webhook secret, base64-encode."""
    cf_fields = {k: v for k, v in payload.items() if k.startswith("cf_")}
    message = "".join(f"{k}{payload[k]}" for k in sorted(cf_fields))
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


@router.post("/webhooks/cashfree")
async def handle_cashfree_webhook(request: Request) -> dict[str, bool]:
    """Handle Cashfree webhook events for subscriptions."""
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid_json") from None

    if settings.cashfree_webhook_secret:
        expected = _cf_webhook_signature(payload, settings.cashfree_webhook_secret)
        received_sig = payload.get("signature", "")
        if received_sig and not hmac.compare_digest(expected, received_sig):
            raise HTTPException(status_code=400, detail="invalid_signature")

    event_type = payload.get("cf_event", "")
    sub_reference_id = str(payload.get("cf_subReferenceId") or "")
    subscription_id = str(payload.get("cf_subscriptionId") or "")
    plan_id = str(payload.get("cf_planId") or "")
    status = str(
        payload.get("cf_status") or payload.get("cf_subscriptionStatus") or ""
    ).upper()
    mapping = db_get("cashfree_sub_workspace", sub_reference_id) or {}
    workspace_id = mapping.get("workspace_id", "")

    if event_type in ("SUBSCRIPTION_STATUS_CHANGE", "SUBSCRIPTION_NEW_PAYMENT"):
        if workspace_id and sub_reference_id and (
            event_type == "SUBSCRIPTION_NEW_PAYMENT" or status == "ACTIVE"
        ):
            try:
                tier = _tier_for_plan_id(plan_id) or _normalize_tier(mapping.get("tier", ""))
                if tier in ADDON_TIERS:
                    _bump_addon_packs(workspace_id, tier, 1)
                    _record_addon_subscription(workspace_id, tier, sub_reference_id)
                elif tier and tier != "free":
                    upsert_billing(
                        workspace_id,
                        {
                            "plan": tier,
                            "status": "active",
                            "subscription_id": sub_reference_id,
                            "current_period_end": _parse_next_charge(payload),
                        },
                    )
            except Exception:
                logger.exception(
                    "cashfree_webhook_billing_update_failed event=%s workspace_id=%s",
                    event_type,
                    workspace_id,
                )
    elif event_type == "SUBSCRIPTION_PAYMENT_CANCELLED" or (
        event_type == "SUBSCRIPTION_STATUS_CHANGE" and status in ("CANCELLED", "EXPIRED", "ONHOLD")
    ):
        if workspace_id:
            try:
                cancelled_tier = _tier_for_plan_id(plan_id) or _normalize_tier(mapping.get("tier", ""))
                if cancelled_tier in ADDON_TIERS:
                    # An add-on pack expiring only removes that pack's credits and
                    # Human Edit tokens — the base plan and its own subscription
                    # are untouched.
                    _bump_addon_packs(workspace_id, cancelled_tier, -1)
                else:
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
    else:
        logger.info(
            "cashfree_webhook_ignored event=%s subscription_id=%s status=%s",
            event_type,
            subscription_id,
            status,
        )

    return {"received": True}
