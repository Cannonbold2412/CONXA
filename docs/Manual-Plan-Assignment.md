# Manually Granting Paid Access (Comps / Support / Demos)

How to give a workspace Starter or Pro access from the backend without them paying — for sales comps, support fixes, or demos. This bypasses Cashfree entirely.

Two ways to do it: a direct Python call (run once, on the backend host) or an HTTP admin endpoint (for remote/deployed environments). Both end up calling the same function, `upsert_billing()`.

---

## 1. Find the workspace ID

You need the target workspace's `workspace_id` — the Clerk org id (`org_...`) for a team workspace, or the user's personal-workspace id for an individual account.

Find it via:
- The Cloud Dashboard URL/Settings page while logged in as that user.
- Or query the backend's SaaS state for their email/membership record.

---

## 2. Pick a plan value and, optionally, a duration

Valid plan values (from `PLAN_LIMITS` in `conxa-cloud/backend/app/services/entitlements.py`):

- `free`
- `starter`
- `pro`
- `enterprise`

Anything else is rejected. Don't use `development` — that's reserved for local-auth workspaces, not a real grant.

**Duration** is optional, in days — pass it and the grant auto-expires on its own; omit it for a permanent grant:

| Grant | `duration_days` |
|---|---|
| 1 month | `30` |
| 3 months | `90` |
| 6 months | `180` |
| 1 year | `365` |
| Permanent | omit the field |

This is calendar-approximate (30-day "months"), not billing-cycle-exact — fine for comps, not meant to mimic a real subscription's renewal date.

---

## 3a. Option A — Direct Python call (run on the backend host)

From `conxa-cloud/backend/`, with `packages/conxa-core` on `PYTHONPATH` (same setup `pytest.ini` uses):

```bash
cd conxa-cloud/backend
python -c "
import time
from app.services.saas import upsert_billing

duration_days = 30  # 1 month — set to None for a permanent grant
expires_at = int(time.time() + duration_days * 86400) if duration_days else None

upsert_billing('<workspace_id>', {'plan': 'pro', 'status': 'active', 'plan_expires_at': expires_at})
"
```

- In **production**, this writes straight to Postgres through `conxa_core.db` — it's a real, immediate change, no restart needed.
- In **dev**, it writes the local filesystem JSON state store instead.
- Swap `'pro'` for `'starter'` (or `'free'` to revoke a comp later).
- Always pass `plan_expires_at` explicitly (even as `None`) — otherwise a workspace that previously had a timed grant keeps its old expiry.

---

## 3b. Option B — HTTP admin endpoint (for remote environments)

```bash
curl -X POST https://<host>/api/v1/entitlements/admin/billing \
  -H "Authorization: Bearer $CONXA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "<workspace_id>", "plan": "pro", "duration_days": 30}'
```

- Auth is the same `CONXA_ADMIN_TOKEN` env var already used by the CI/publish admin endpoints — no new secret to provision.
- Drop `"duration_days"` entirely for a permanent grant.
- Returns the updated billing record, the resolved plan's limits, and `expires_at` (Unix seconds, or `null` if permanent).
- 400 if the plan name is invalid, 401/503 if the token is missing or wrong.

This is implemented in `conxa-cloud/backend/app/api/entitlement_routes.py` (`POST /entitlements/admin/billing`).

---

## What this does and doesn't do

- Takes effect immediately — the workspace's entitlement limits (seats, machines, compile credits, ops tier, etc.) update on their next `/entitlements/current` read.
- **Time-boxed grants expire themselves.** `entitlements.normalize_plan()` checks `plan_expires_at` on every read; once it passes, the workspace silently reads back as `free` — no cron job, no manual downgrade step. Nothing deletes the `pro`/`starter` value sitting in `billing.plan`; it's just ignored once expired, so re-granting later doesn't need to know the old plan.
- Does **not** create a Cashfree subscription. `current_period_end` (the separate field Cashfree owns) is left as-is, and there's no real recurring charge behind the grant.
- **To revoke a comp early, use the same method** (`plan: "free"`, no duration) — don't try to run it through the Cashfree cancel flow, since there's no real subscription for Cashfree to know about.
