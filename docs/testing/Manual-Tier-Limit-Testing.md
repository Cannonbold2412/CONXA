# Manual Testing Guide — Plan Tier Limits

This is a step-by-step checklist for **manually** testing that every plan tier limit actually blocks what it should. No test framework needed — just a browser, `curl` (or Postman), and some patience.

---

## 1. What are the tiers and their limits?

These limits live in `conxa-cloud/backend/app/services/entitlements.py` (`PLAN_LIMITS`):

| Limit | Free | Starter | Pro | Enterprise | Development |
|---|---|---|---|---|---|
| Seats (team members) | 1 | 3 | 10 | unlimited* | unlimited |
| Machines (Build Studio devices) | 1 | 3 | 10 | unlimited* | unlimited |
| Compile credits / month | 25 | 200 | 500 | unlimited* | unlimited |
| Human-edit tokens / month | 500k | 2.5M | 10M | unlimited* | unlimited |
| Free trial days | 30 | — | — | — | — |
| Installer distribution | internal only | external | external | external | external |
| White-label branding | no | no | no | yes | yes |
| Ops tier (dashboard/analytics) | none | basic | full | full | full |
| Analytics retention | 0 days | 90 days | 365 days | forever | forever |
| LLM compile pool | free | premium | premium | premium | premium |
| BYOK (own Azure OpenAI key) | no | no | no | yes | yes |

\* "unlimited" for Enterprise means the number must be set as an **override** in billing metadata — out of the box Enterprise has `0`/`None`, so an admin must set real numbers there. Test this too!

Add-on packs (`credits_addon_20/50/100/250`) add extra compile credits + tokens on top of any paid plan while active.

---

## 2. Before you start — setup

### What you need

1. **The backend running locally:**
   ```
   cd conxa-cloud/backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. **A way to get a Clerk login token** — easiest is to log in through the frontend (`npm run dev` in `conxa-cloud/frontend`) and copy your session/JWT token from the browser's network tab (any API call's `Authorization: Bearer ...` header). Save it in a variable:
   ```powershell
   $TOKEN = "<paste-your-clerk-jwt>"
   $BASE = "http://127.0.0.1:8000/api/v1"
   ```
3. **The admin token** — this is `CONXA_ADMIN_TOKEN` from the backend's env file. It lets you assign plans without paying:
   ```powershell
   $ADMIN = "Bearer <CONXA_ADMIN_TOKEN>"
   ```

### The most useful command: "what do I have?"

```powershell
curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/entitlements/current"
```

This returns your plan, all meters (used / limit / remaining), capabilities, and the workflow lock ledger. **Run this before and after every test below** — it's your source of truth.

> Tip: if a meter says `"unlimited": true`, the limit is `None` and the gate will never fire for it.

### How to change your plan (no payment needed)

Use the admin billing endpoint:

```powershell
curl.exe -s -X POST "$BASE/entitlements/admin/billing" `
  -H "Authorization: $ADMIN" -H "Content-Type: application/json" `
  -d '{"workspace_id": "<org_xxx>", "plan": "free"}'
```

- `plan` can be `free`, `starter`, `pro`, or `enterprise`.
- Optional `"duration_days": 7` makes the grant expire (test #10).

You can also give a workspace hidden overrides (used in several tests below):

```powershell
# Example: override a workspace's billing metadata directly in the KV store / DB
# namespace "saas_billing", adding:
#   "entitlement_overrides": { "machines": 2 }
```

How you edit billing depends on your store: filesystem mode = JSON files under `data/saas/`; Postgres = the `kv_store` table.

---

## 3. The tests

Work through them in order. Each test says: **what to do**, **what should happen**, and **what should NOT happen**.

---

### TEST 1 — Compile credit limit (monthly)

**Gate:** `reserve_compile_credit` → error `compile_credit_limit_exceeded` (HTTP 402)

Free = 25 compiles/month, so testing is quick.

1. Assign your workspace the **free** plan (see §2).
2. Reserve credits one at a time until it refuses:
   ```powershell
   curl.exe -s -X POST "$BASE/usage/compile/reserve" `
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
     -H "X-Conxa-Machine: test-machine-hash-1" `
     -d '{"reservation_id": "res-test-001"}'
   ```
   Use a **new unique `reservation_id` each time** (`res-test-002`, `003`, …).
3. After the 25th reservation, the **26th must fail** with HTTP **402** and code `compile_credit_limit_exceeded`.
4. Check `GET /entitlements/current` → `meters.compile_credits.remaining` should hit `0`.

**Also check these sub-behaviors:**

| Sub-test | Steps | Expected |
|---|---|---|
| Same ID twice is NOT double-charged | Call `/reserve` twice with the **same** `reservation_id` | Both return OK (idempotent), only counted once |
| Release gives the credit back | Call `/usage/compile/release` with a reserved ID, then try reserving again | Release succeeds; the next reserve works again even at the limit |
| Commit counts it permanently | Call `/usage/compile/commit` on a reservation | `compile_credits_used` goes up in `/entitlements/current` |
| Reservation expires (TTL) | Reserve, wait ~30 min (or temporarily lower `SKILL_ENTITLEMENTS_RESERVATION_TTL_SECS`), reserve again | Expired reservation no longer holds a slot |

---

### TEST 2 — Human-edit token pool

**Gate:** `ensure_human_edit_available` / `record_llm_usage` → error `human_edit_pool_exceeded` (HTTP 402)

1. Stay on the **free** plan (500k tokens).
2. Easiest honest path: use the editor's AI features in Build Studio repeatedly. Faster path: keep calling the proxy directly until it trips:
   ```powershell
   curl.exe -s -X POST "$BASE/llm/proxy/text" `
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
     -d '{"prompt":"hi","usage_class":"human_edit"}'
   ```
   (Check `app/api/llm_proxy_routes.py` for the exact body fields of your build.)
3. Once used ≥ 500k tokens, the next call must fail with HTTP **402** and code `human_edit_pool_exceeded`.
4. Verify `meters.human_edit_tokens.used` in `/entitlements/current` matches roughly the sum of input+output tokens recorded.

**Should NOT happen:** compile-class calls getting blocked when only human-edit ran out (they're separate pools), or vice versa.

---

### TEST 3 — Machine limit (device binding)

**Gate:** `ensure_machine_slot` → error `machine_limit_exceeded` (HTTP 402)

Machines register themselves via the `X-Conxa-Machine` header (a hash of the Windows machine).

1. On the **free** plan (1 machine):
   - Make a request with `X-Conxa-Machine: device-A` → allowed.
   - Make a request with `X-Conxa-Machine: device-B` → must fail **402** `machine_limit_exceeded`.
2. Check the Settings → Devices list:
   ```powershell
   curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/entitlements/machines"
   ```
   Device A should be listed, device B not.
3. **Revoke frees a slot:** revoke device A:
   ```powershell
   curl.exe -s -X POST "$BASE/entitlements/machines/revoke" `
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
     -d '{"machine_hash": "device-A"}'
   ```
   Now device B must be **allowed**.
4. **Revoked ≠ remembered:** touch device A again (send its hash). It must count as brand-new — so on free (limit 1, slot taken by B) it must be **rejected again**, not silently un-revoked.
5. Upgrade to Starter (3 machines): devices A, B, C allowed; D rejected.

---

### TEST 4 — Seat limit (team members)

**Gate:** `ensure_seats_available` → error `seat_limit_exceeded` (HTTP 402)

Seats are counted live from Clerk organization memberships.

1. On the **starter** plan (3 seats), invite a 4th member to the Clerk org (via Clerk dashboard).
2. Log in **as the new (4th) member** and make any authenticated request (e.g. `GET /entitlements/current`).
3. The new member must get **402** `seat_limit_exceeded`.
4. Existing members (the original 3) must keep working normally even though the org is over-capacity — the lock only applies to *arriving* members.
5. Negative control: on **development/unlimited** plan, a 5th member logs in fine.

Note: seat enforcement fails *open* if Clerk can't be reached — don't be confused if killing network access disables this gate locally.

---

### TEST 5 — Active workflow cap (publish gate)

**Gate:** `ensure_workflow_publishable` → errors `workflow_limit_exceeded` / `workflow_locked` (HTTP 402)

A plan's compile-credit number doubles as the max number of simultaneously **active published workflows**.

1. On the **free** plan (25): publish 26 distinct workflows through the normal publish flow (`POST /publish` from Build Studio).
2. Publish #26 must fail with **402** `workflow_limit_exceeded`.
3. **Republishing an already-active workflow must still succeed** at the cap (it's a version bump, not a new slot).
4. **Downgrade soft-lock:** publish ~300 workflows on Pro (500), then downgrade to Starter (200). Check:
   ```powershell
   curl.exe -s -H "Authorization: Bearer $TOKEN" "$BASE/entitlements/current"
   ```
   → `workflow_lock` should show ~100 locked (oldest first). Republishing one of the **locked** ones must fail with **402** `workflow_locked`; republishing an **active** one works.
5. Upgrade back → the same oldest-first reconciliation should unlock everything again automatically (no migration step).

---

### TEST 6 — Trial expiry (free plan, 30 days)

**Gate:** `ensure_trial_active` → error `trial_expired` (HTTP 402)

1. Set your workspace's billing `trial_started_at` to more than 30 days ago (edit the KV record).
2. Try anything that *builds*: a compile reserve, an LLM proxy call, a publish, an installer upload.
   → All must fail with **402** `trial_expired`.
3. Things that must **keep working** after expiry (by design — execution is local):
   - Runtime skill sync (`skillpack delta`)
   - Telemetry ingest (`POST /tracking/...`)
4. Paid plans never expire: set `trial_started_at` far in the past on a starter workspace → nothing blocks.

---

### TEST 7 — Distribution ladder (internal vs external installers)

**Gate:** `ensure_distribution_allowed` → error `distribution_not_permitted` (HTTP 402)

1. On **Free** or **Starter**: attempt an installer/publish upload marked **external** distribution.
   → Must fail **402** `distribution_not_permitted`.
2. Same action with internal distribution → must succeed.
3. On **Pro** → external upload succeeds.

---

### TEST 8 — White-label branding (Enterprise-only)

**Gate:** `ensure_white_label_allowed` → error `white_label_not_permitted` (HTTP 402)

1. On **Pro**: attempt installer upload with custom branding / white-label enabled.
   → Must fail **402** `white_label_not_permitted`.
2. On **Enterprise**: same request succeeds.

---

### TEST 9 — Ops tier gates (dashboard, drift, audit)

**Gate:** `ensure_ops_tier` → error `ops_tier_required` (HTTP **403** — note: forbidden, not payment-required)

Ops surfaces need `ops_tier`: none < basic < full.

1. On **Free** (`ops_tier: none`): call these and confirm they're all blocked with **403** `ops_tier_required`:
   - `GET /product/audit-events`
   - `GET /tracking/dashboard`
   - `GET /tracking/drift`
2. On **Starter** (`basic`): the "basic"-level ones pass; anything requiring "full" stays blocked.
3. On **Pro/Enterprise** (`full`): all pass.

---

### TEST 10 — Timed plan grant expiry

**Gate:** `normalize_plan` honoring `plan_expires_at`

1. Assign yourself Pro with a short window:
   ```powershell
   curl.exe -s -X POST "$BASE/entitlements/admin/billing" `
     -H "Authorization: $ADMIN" -H "Content-Type: application/json" `
     -d '{"workspace_id": "<org_xxx>", "plan": "pro", "duration_days": 1}'
   ```
2. Confirm `GET /entitlements/current` shows `plan: pro`.
3. Manually set `plan_expires_at` in the past (or wait a day).
4. `GET /entitlements/current` must now show `plan: free` with free limits — **without anyone running a downgrade job**.
5. Real Cashfree subscriptions must NOT be affected (they never set `plan_expires_at`).

---

### TEST 11 — Analytics retention window

**What it controls:** how far back telemetry queries reach (`analytics_retention_cutoff_ms`). Free has **0 days** = nothing visible.

1. Ingest a telemetry event for a Free workspace, then query tracking analytics endpoints.
2. The event must **not appear** anywhere (retention 0 filters everything).
3. Switch to Starter (90 days) → recent events appear.
4. Give an override `"analytics_retention_days": null` (unlimited) → old events appear too.

---

### TEST 12 — Compile pool routing (free vs premium providers)

**What it controls:** which LLM provider pool compiles run against.

1. Temporarily enable debug logging on the backend LLM router.
2. Trigger a compile on a **Free** workspace → log shows the provider picked from the **free** pool.
3. Repeat on **Starter+** → provider comes from the **premium** pool.

---

### TEST 13 — BYOK (bring your own key, Enterprise-only)

**Gate:** `byok_enabled_for` in `app/services/byok.py`

1. On **Starter/Pro**: `PUT /byok` (store an Azure OpenAI deployment) → blocked.
2. On **Enterprise**: same call succeeds and subsequent LLM usage uses the customer's own deployment.

---

### TEST 14 — Add-on pack stacking

**What it controls:** purchased add-on packs raise compile credits AND human-edit tokens on top of the base plan.

1. Put the workspace on **free** (25 credits, exhausted from TEST 1).
2. Simulate activating an add-on: set `billing.addons.credits_addon_20 = 1` (as the Cashfree webhook does — see `cashfree_routes._bump_addon_packs`).
3. `GET /entitlements/current` → compile limit should now read **45** (25 + 20), tokens 700k.
4. Reserving past the old limit now succeeds.
5. Cancel/deactivate the pack (set count back to 0) → limits drop immediately; already-used credits stay used.

---

### TEST 15 — Kill switches (enforcement toggles)

Each numeric gate has an env switch. These exist so support can turn a gate off without deploying. Verify they actually disable enforcement:

| Env var (prefix `SKILL_`) | Turns off |
|---|---|
| `ENTITLEMENTS_ENFORCE_COMPILE` | compile credits **and** workflow cap |
| `ENTITLEMENTS_ENFORCE_HUMAN_EDIT` | token pool |
| `ENTITLEMENTS_ENFORCE_MACHINES` | device limit |
| `ENTITLEMENTS_ENFORCE_SEATS` | seat limit |
| `ENTITLEMENTS_ENFORCE_DISTRIBUTION` | external-distribution + white-label gates |

For each one: set it to `false`, restart the backend, redo the failing part of the matching test above → the previously-blocked action must now **pass**. Set it back to `true` afterwards and confirm blocking resumes.

⚠️ This is also a security test in reverse: make sure these default to **true** (they do in `packages/conxa-core/conxa_core/config.py`) — a fresh deploy with no env file must still enforce everything.

---

## 4. Suggested test order & matrix

Run each row across all four public plans (Free → Starter → Pro → Enterprise):

| # | Test | Free | Starter | Pro | Enterprise |
|---|---|---|---|---|---|
| 1 | Compile credits exhaust | ✅ block @25 | @200 | @500 | no block* |
| 2 | Human-edit tokens exhaust | ✅ @500k | @2.5M | @10M | no block* |
| 3 | Machines | ✅ @1 | @3 | @10 | no block* |
| 4 | Seats | ✅ @1 | @3 | @10 | no block* |
| 5 | Workflow cap / soft-lock | ✅ @25 | @200 | @500 | n/a* |
| 6 | Trial expiry blocks builds | ✅ | n/a | n/a | n/a |
| 7 | External distribution | ❌ blocked | ❌ blocked | ✅ | ✅ |
| 8 | White label | ❌ | ❌ | ❌ | ✅ |
| 9 | Ops tier | ❌ all | basic only | ✅ | ✅ |
| 10 | Timed grant revert | ✅ | ✅ | ✅ | ✅ |
| 11 | Retention filter | hides all | 90d | 365d | forever |
| 13 | BYOK | ❌ | ❌ | ❌ | ✅ |

\* Enterprise needs explicit numeric overrides in billing — verify that un-overridden Enterprise behaves sanely (documented values are 0/None) rather than silently blocking everything.

---

## 5. Quick reference — expected error responses

All entitlement failures come back as JSON with an error code:

| Code | HTTP | Gate |
|---|---|---|
| `compile_credit_limit_exceeded` | 402 | monthly compile credits |
| `human_edit_pool_exceeded` | 402 | monthly token pool |
| `machine_limit_exceeded` | 402 | device registration |
| `seat_limit_exceeded` | 402 | new team member |
| `workflow_limit_exceeded` | 402 | publishing a NEW workflow at cap |
| `workflow_locked` | 402 | republishing a soft-locked workflow |
| `trial_expired` | 402 | any build action after 30 free days |
| `distribution_not_permitted` | 402 | external installer on Free/Starter |
| `white_label_not_permitted` | 402 | custom branding off Enterprise |
| `ops_tier_required` | **403** | analytics/audit dashboards |
| `invalid_machine_id` / `invalid_domain` / `invalid_reservation_id` | 400 | malformed input |

Rule of thumb: **payment-shaped limits → 402**, capability/permission gates → 403.

---

## 6. Common gotchas

- **Meter says unlimited** → the limit resolved to `None`; the gate will never fire. Check billing overrides/addons math.
- **Seat test passes locally but shouldn't** → Clerk lookup failed and the gate failed *open* (see `ensure_seats_available`). Requires a real Clerk secret key + `org_...` workspace.
- **Compile test won't trip** → check `SKILL_ENTITLEMENTS_ENFORCE_COMPILE=false` isn't left over from TEST 15.
- **Reservation stuck holding a slot** → reservations live ~30 min (`SKILL_ENTITLEMENTS_RESERVATION_TTL_SECS`); release them or lower the TTL while testing.
- **Plan changes seem ignored** → `billing_for()` caches; restart the backend between manual billing-record edits if results look stale.
