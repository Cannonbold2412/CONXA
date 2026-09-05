"""Subscription entitlement: a monthly quota that resets each period.

One row per user_id in kv_store's "execute_subscription" namespace — same
storage choice as wallet.py's balance (single row, looked up by exact key,
never listed), just a richer JSON blob instead of one integer.

Quota reset is event-driven (the Cashfree renewal webhook calls
activate_or_renew, which advances period_start/period_end and zeroes
quota_used) plus a lazy safety-net check on every proxy call
(reset_if_period_elapsed) — no cron job needed for a Render free-tier service.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from conxa_core.db import db_get, db_set, get_engine

from .plans import PLAN_TIERS

_NAMESPACE = "execute_subscription"


def get_active_subscription(user_id: str) -> dict[str, Any] | None:
    sub = db_get(_NAMESPACE, user_id)
    if not sub or sub.get("status") != "active":
        return None
    return reset_if_period_elapsed(user_id, sub)


def activate_or_renew(user_id: str, plan_id: str, cashfree_sub_ref: str) -> dict[str, Any]:
    """Called on subscription checkout success and on every renewal webhook.
    Always starts a fresh period with quota_used reset to 0 — a renewal
    charge means a new billing period, not an addition to the old one."""
    plan = PLAN_TIERS[plan_id]
    now = datetime.now(timezone.utc)
    sub = {
        "plan_id": plan_id,
        "status": "active",
        "cashfree_sub_ref": cashfree_sub_ref,
        "period_start": now.isoformat(),
        "period_end": (now + timedelta(days=30)).isoformat(),
        "quota_total": plan["monthly_quota"],
        "quota_used": 0,
    }
    db_set(_NAMESPACE, user_id, sub)
    return sub


def reset_if_period_elapsed(user_id: str, sub: dict[str, Any]) -> dict[str, Any]:
    period_end = datetime.fromisoformat(sub["period_end"])
    if datetime.now(timezone.utc) < period_end:
        return sub
    # ponytail: lazy safety-net reset for a missed/late renewal webhook — advances
    # by one period from where it left off rather than from "now", so a user who
    # never triggers this path (webhook arrived on time) sees no behavior change.
    sub = {
        **sub,
        "period_start": period_end.isoformat(),
        "period_end": (period_end + timedelta(days=30)).isoformat(),
        "quota_used": 0,
    }
    db_set(_NAMESPACE, user_id, sub)
    return sub


def debit_quota_if_available(user_id: str, amount: int) -> bool:
    """Debit up to ``amount`` from the active subscription's remaining quota.
    Returns False (no-op) if there's no active subscription or it's already
    exhausted — callers fall back to the top-up wallet in that case."""
    sub = get_active_subscription(user_id)
    if sub is None or sub["quota_used"] >= sub["quota_total"]:
        return False
    engine = get_engine()
    if engine is None:
        sub["quota_used"] = min(sub["quota_total"], sub["quota_used"] + amount)
        db_set(_NAMESPACE, user_id, sub)
        return True
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE kv_store
                SET data = jsonb_set(
                        data, '{quota_used}',
                        to_jsonb(LEAST(
                            (data->>'quota_total')::bigint,
                            (data->>'quota_used')::bigint + CAST(:amount AS bigint)
                        ))
                    ),
                    updated_at = now()
                WHERE namespace = :ns AND key = :user_id
            """),
            {"ns": _NAMESPACE, "user_id": user_id, "amount": amount},
        )
        conn.commit()
    return True


if __name__ == "__main__":
    import uuid

    uid = f"selfcheck_{uuid.uuid4().hex}"
    assert get_active_subscription(uid) is None
    sub = activate_or_renew(uid, "sub_250k", "cfsub_test")
    assert sub["quota_total"] == 250_000
    assert sub["quota_used"] == 0
    assert debit_quota_if_available(uid, 1_000) is True
    sub = get_active_subscription(uid)
    assert sub is not None and sub["quota_used"] == 1_000
    assert debit_quota_if_available(uid, 10_000_000) is True  # floors at quota_total
    sub = get_active_subscription(uid)
    assert sub is not None and sub["quota_used"] == sub["quota_total"]
    print("subscription.py self-check passed")
