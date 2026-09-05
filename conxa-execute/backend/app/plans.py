"""Subscription plan catalog: a monthly quota that resets each period, not a
top-up's permanently-stacking balance.

Reuses the same 6 price tiers and pre-created Cashfree plan IDs that already
exist for the old "sub_*" auto-refill entries in cashfree.py::TOKEN_TIERS —
those become real subscription plans here instead of recurring wallet
credits. cashfree.py itself (order/plan creation, webhook verification) is
unchanged; only what a successful charge means for a "sub_*" tier changes
(see subscription.py::activate_or_renew, called from routes_checkout.py).
"""
from __future__ import annotations

from typing import Any

# pool tags the LLM provider pool a mode gets in app/llm_config.py (Phase 3) —
# subscription and top-up can point at different provider pools without
# fabricating price-tier-based feature gating that wasn't asked for.
PLAN_TIERS: dict[str, dict[str, Any]] = {
    "sub_250k": {"monthly_quota": 250_000, "amount": 500, "name": "250K Tokens / month", "pool": "subscription"},
    "sub_500k": {"monthly_quota": 500_000, "amount": 950, "name": "500K Tokens / month", "pool": "subscription"},
    "sub_1m": {"monthly_quota": 1_000_000, "amount": 1_800, "name": "1M Tokens / month", "pool": "subscription"},
    "sub_2_5m": {"monthly_quota": 2_500_000, "amount": 4_250, "name": "2.5M Tokens / month", "pool": "subscription"},
    "sub_5m": {"monthly_quota": 5_000_000, "amount": 8_000, "name": "5M Tokens / month", "pool": "subscription"},
    "sub_10m": {"monthly_quota": 10_000_000, "amount": 15_000, "name": "10M Tokens / month", "pool": "subscription"},
}
