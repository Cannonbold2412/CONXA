# Conxa — Sales Blockers & Implementation Roadmap

**Date:** 2026-07-02  
**Purpose:** Define what code must ship before Conxa can close its first enterprise customer.

---

## Executive Summary

The product works. Core features ship. **You can demonstrate to customers today.**

Since this doc was first written, almost every gap has closed. **Phase 1 is complete.** Of the eight Phase 2 items, six are done — device registration, audit log, RBAC (Phase 1), drift detection, selector-cache GC, billing enforcement, and friendly error messages have all shipped.

**One hard sales blocker remains: Windows installer code signing (2.5).** The build scaffolding for it is already in place (inert) — what's left is procuring the certificate and switching it on. macOS support (2.4) is the only other open Phase 2 item, and it's an upsell, not a blocker.

This doc separates:

1. **Blocking Gaps** — code that must be written before signing a customer
2. **Gating Items** — code that must be working before that customer goes live
3. **Nice-to-Have** — features that differentiate but don't block deals

---

## Phase 1 Status: Architecture Consolidation

**Current state: COMPLETE.** All 8 items are done, superseded, or moot.

| Item | Status | Blocks Sales? | Est. Days |
|---|---|---|---|
| ✅ 1.1 Auth token refresh fix | DONE | No | — |
| ✅ 1.2 Token acquisition flow | DONE (superseded) | No | — |
| ✅ Installer-provisioned sync token | DONE | No | — |
| ✅ 1.3 Move nonce store to Redis | MOOT (nonce flow removed) | No | — |
| ✅ 1.4 Real per-file delta sync | DONE (per-skill granularity) | No | — |
| ✅ 1.5 Rate limit cache to shared store | DONE (KV store, not Redis) | No | — |
| ✅ 1.6 Wire RBAC to API routes | DONE | **was YES** | — |
| ✅ 1.7 Remove Stripe fields | DONE (full removal) | No | — |
| ✅ 1.8 Delete research/frontend/ | MOOT (dir doesn't exist) | No | — |

**Notes:**
- 1.3 became moot when the installer-embedded sync-token model replaced the CLI auth flow — there is no nonce store left to migrate.
- 1.4 was resolved by the Enterprise-Grade Auto-Update Architecture: the delta endpoint now compares each skill independently, so republishing one skill never re-ships the pack.
- 1.5 was solved with the existing `conxa_core.db` KV dual-store (new `rate_limits` namespace), shared across instances and restart-safe. **Redis was not introduced** — the KV store already provides durable, shared storage.

---

## Phase 2 Status: Production Readiness

**Current state: 6/8 done.** These were the **sales gates** — most are now closed.

| Item | Status | Blocks Sales? | Enterprise? | Est. Days |
|---|---|---|---|---|
| ✅ 2.1 Device & Runtime Registration | DONE | was **YES** | Yes | — |
| ✅ 2.2 Drift Detection | DONE | No | Yes | — |
| ✅ 2.3 Audit Log | DONE | was **YES** | Yes | — |
| 2.4 macOS Runtime Support | Open (groundwork inert) | No | Upsell | 7 |
| 2.5 Installer Code Signing (Windows) | **Open (groundwork inert)** | **YES** | Yes | 3 |
| ✅ 2.6 Selector Cache GC | DONE | No | Yes | — |
| ✅ 2.7 Hardened Billing Integration | DONE | No | Yes | — |
| ✅ 2.8 Error Code UX Mapping | DONE | No | All | — |

---

## The Actual Blockers

### Critical (Block Contract Signature)

#### 2.5 Installer Code Signing (Windows) — **THE REMAINING BLOCKER**

**Status:** Open. Build scaffolding is in place but inert — `installer_builder.py`, `electron-builder.yml`, and the host/studio CI workflows carry the signing groundwork; it is not yet wired to a real certificate.

**Why it matters:**  
Unsigned `.exe` triggers Windows SmartScreen: "Unknown Publisher — Windows protected your PC." Users click "Run anyway" — but many enterprises block unsigned executables via GPO.

**What's left:**
- Obtain Windows EV code signing cert (cost: ~$200/yr).
- Activate the `signtool.exe` step in `installer_builder.py` post-NSIS build (scaffolding present).
- Env vars: `CONXA_SIGN_TOOL_PATH`, `CONXA_SIGN_CERT_PATH`, `CONXA_SIGN_PASSWORD`.

**Business impact:** Without this, large enterprises cannot deploy to their fleet. SmartScreen block = dead on arrival.

**Effort:** ~3 days (cert procurement + flipping the build integration on). Unblocked by Phase 1.

---

#### ✅ 2.1 Device & Runtime Registration — DONE (2026-06-02)

`POST /api/v1/telemetry/runtime-start` now stores a registration per `(company, platform)` in the `runtime_registrations` KV namespace; `GET /api/v1/telemetry/runtimes` returns active count, stale count (>30 days), and version distribution; the Dashboard shows a `RuntimeRegistrationsCard`. Enterprise POC reporting ("how many installations?") is answerable.

#### ✅ 2.3 Audit Log — DONE (2026-06-02)

`audit_routes.py` writes `audit_log` entries on publish, installer upload, plugin create, and plugin delete, with `user_id`, `workspace_id`, `action`, `resource_id`, `ip`, `created_at`. `GET /api/v1/audit-events` (Clerk-authed, workspace-scoped) backs the Settings page. The security-checklist boilerplate item is covered.

#### ✅ 1.6 Wire RBAC to API Routes — DONE (2026-07-01)

`require_admin(principal)` (admin/owner → allow, else HTTP 403) is enforced on the previously-unguarded write routes (`plugin_create`, `plugin_delete`, `patch_bundle_release`), matching the existing publish/subscription guards. "Who can publish?" now has an enforced answer.

---

### High Priority (Go-Live Gates) — ALL DONE

These didn't block the first demo/POC, and they're now all shipped, so they no longer gate go-live either.

#### ✅ 1.3 Nonce Store — MOOT

The CLI auth flow that used the in-memory nonce dict was removed with the installer-embedded sync-token model. No nonce store exists to migrate; sync auth uses the durable KV `sync_tokens` namespace.

#### ✅ 1.4 Real Per-File Delta Sync — DONE (per-skill granularity)

`_build_delta()` compares each skill independently against the client's last-known version (`component_versions` KV, per-file SHA-256). Republishing one skill no longer re-ships the whole pack. (Residual: the ~5 small JSON files within a *changed* skill still ship together — deferred as low-value.)

#### ✅ 1.5 Rate Limit Cache to Shared Store — DONE

Sync rate limit persisted in the KV store (`rate_limits` namespace), shared across instances and restart-safe. Falls back to in-memory in local/Studio mode.

#### ✅ 2.2 Drift Detection — DONE (2026-07-01)

`structural_fingerprint` is plumbed from `SkillMeta` into runtime `manifest.json` and checked at run start in `runtime/drift.js` (from `runPlan`). It scores recorded landmarks against the live page with the pure resolver (no LLM) and emits `drift_detected` — warn only, never blocks. Cloud aggregates per plugin version at `GET /drift`.

#### ✅ 2.6 Selector Cache GC — DONE (2026-07-01)

`selector_cache.cleanup_expired_entries()` purges expired KV entries and on-disk cache files; a background loop in the cloud lifespan (`main.py`) runs it plus `cleanup_old_snapshots()` at startup and every `gc_interval_secs` (default 6h). The cache no longer grows without bound.

#### ✅ 2.7 Billing Enforcement — DONE (2026-07-01)

The entitlements service (`entitlements.py`, `PLAN_LIMITS` for Free/Starter/Pro/Enterprise) is now enforced: `entitlements_enforce_*` flags on by default, a plan/installer-slot gate at publish, compile-credit reserve→commit→release, and a Human-Edit token pool at the LLM proxy. Billing-page copy is derived from `PLAN_LIMITS` so numbers can't drift. Payment provider is **Cashfree** (not Razorpay/Stripe). `development` and any `None` limit stay unlimited.

#### ✅ 2.8 Error Code UX Mapping — DONE (2026-07-01)

`renderer/src/lib/errorMessages.ts` maps the full backend `_CommandError` set plus transport codes to plain-English strings; `errorMessage(err, fallback)` prefers the mapping, then the raw message, then the fallback. Build Studio display sites route through it.

---

### Optional (Ship Later, Upsell)

These are valuable but not required to close a deal.

- **2.4 macOS Support** — Only open Phase 2 item besides code signing. Build scripts reference macOS targets and the runtime is platform-aware, but there's no macOS installer builder or tested distribution path yet. Upsell to Mac teams; do after Windows launch. (~7 days)
- **3.1 SSO/SAML** — Enterprise feature. Ship after you have 1–2 enterprise customers who ask for it.
- **3.2 Multi-User Publishing** — Team feature. Upsell to larger accounts.

---

## Path to First Sale

### Minimum Viable Sales Package (MVSP)

**Code that must ship to close the first enterprise deal:**

| Item | Phase | Effort | Timeline |
|---|---|---|---|
| ✅ 1.6 RBAC wired | 1 | done | — |
| ✅ 2.1 Device registration | 2 | done | — |
| ✅ 2.3 Audit log | 2 | done | — |
| 2.5 Code signing | 2 | 3d | **Only remaining critical-path item** |
| ✅ 1.3 Nonce (moot) | 1 | done | — |
| ✅ 1.4 Delta sync | 1 | done | — |
| ✅ 1.5 Rate limit shared store | 1 | done | — |

**Remaining to signature: ~3 days of engineering (code signing).** Everything else on the critical path and the go-live gates is shipped.

---

### Deployment Readiness Checklist

Before you ask a customer to sign:

- [x] RBAC enforced on all write routes
- [x] Audit log visible in dashboard (last 30 days)
- [ ] Windows `.exe` is code-signed (SmartScreen trusted) — **only open item**
- [x] Device registration working (dashboard shows "active runtimes")
- [x] Error messages are user-friendly (no raw codes)
- [x] Nonce store survives cloud redeploy (moot — flow removed; sync token is durable)
- [x] Rate limits consistent across cloud instances

---

## Revenue Impact

| Gap | Blocks... | Status |
|---|---|---|
| No audit log | Security review | ✅ Resolved — `GET /api/v1/audit-events` |
| No code signing | Enterprise GPO policy | **Open — the remaining blocker** |
| No device registration | Usage reporting | ✅ Resolved — `runtime_registrations` |
| No RBAC | Role enforcement | ✅ Resolved — `require_admin` on write routes |

---

## Recommended Sequence

**Now:** 2.5 (Windows code signing) — procure the EV cert and switch on the existing (inert) build scaffolding. This is the last thing between the current build and a fleet-deployable, GPO-safe installer.

**After first Windows sale:** 2.4 (macOS support) to expand the addressable market to Mac teams.

**On enterprise demand:** Phase 3 items (SSO/SAML, multi-user publishing, on-prem).

This gets you to "first customer in production" in ~3 days rather than the ~3 weeks this doc originally estimated — the rest of the critical path has landed.

---

## What to Sell Before This Is Done

- **Demos** — show the workflow working. No code signing needed for a demo.
- **POCs** — limited use on a dev machine. Audit log, RBAC, and device registration are all live now.
- **Evaluations** — Build Studio + Runtime working locally, with real billing tiers, drift detection, and friendly errors.

**What you cannot sell yet:**
- Production **fleet** deployment at scale (needs Windows code signing so GPO-locked machines will run the installer).
- macOS deployments (Windows-only until 2.4 ships).
- Enterprise contracts requiring SSO/SAML (Phase 3).
