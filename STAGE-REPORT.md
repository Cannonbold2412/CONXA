# Conxa Platform — Stage Assessment Report

**Generated:** 2026-06-28  
**Based on:** Implementation Plan (updated 2026-06-20), TRD (updated 2026-06-11), FIX.md (2026-06-27), git log (126 commits), PRD v1.0

---

## Verdict: Private Beta (Pre-Launch)

Conxa is **past Alpha and MVP, but not ready for Open Beta or General Availability**.

The core product loop — Record → Compile → Package → Publish → Install → Execute — works end-to-end. Real infrastructure is in place: cloud backend, billing gateway, telemetry, authentication, self-updating runtime. However, significant foundational gaps remain open: RBAC is scaffolded but not enforced, Windows SmartScreen will block installers (no code signing), billing quotas are not enforced, delta sync ships full packs every time, and rate limiting is in-memory only. A critical production bug (broken element finder in the `.exe`) was fixed on 2026-06-27, and CI safety nets are still being wired.

The right label is **Private Beta**: validated with internal users or hand-picked design partners, but not ready to be handed to general end-customers without supervision.

---

## What Each Stage Means (for context)

| Stage | What it means |
|---|---|
| **Concept** | Idea only, no working code |
| **Prototype** | A demo that proves the concept, not production-safe |
| **Alpha** | Core loop works internally, bugs expected, no external users |
| **Private Beta** | Works reliably with hand-picked partners, major gaps still closing |
| **Open Beta** | Available to anyone who signs up, near-production quality |
| **General Availability (GA)** | Fully production-ready, SLA-backed, any customer |

**Conxa today = Private Beta, trending toward Open Beta.**

---

## Evidence: What Is Done

### Core Product Loop — Functional
The entire end-to-end workflow works:

| Step | Status | Notes |
|---|---|---|
| Record browser workflow (Build Studio) | Working | Playwright + bridge.js capture; iframe chain preserved |
| Compile to Skill Package (local) | Working | Multi-signal element identity, durability scoring, assertions |
| Package → plugin archive + NSIS `.exe` | Working | Installer embeds runtime + skill pack |
| Publish to Conxa Cloud | Working | Sync-token model; no Conxa login required on customer machine |
| Distribute installer (Cloud) | Working | Installer hosted on cloud, downloadable via dashboard link |
| Customer installs + runtime registers with Claude Desktop | Working | MCP server auto-registers on install |
| Skill sync (cloud → customer machine) | Working | Delta sync + SHA-256 atomic writes (full-pack for now) |
| Skill execution via Claude (5-tier recovery) | Working | Fixed 2026-06-27; CI execution gate added |
| Telemetry streaming | Working | Batched events → POST /tracking/{co}/events |
| Dashboard (vendor analytics) | Working | Run timelines, active runtimes, audit log |
| Billing (Razorpay) | Wired | Routes exist, webhooks handled; plan enforcement not yet wired |

### Engineering Milestones Completed

**Phase 1 — Architecture Consolidation**
- Auth token refresh properly validates (was a stub returning fake 30-day expiry)
- Installer-embedded sync-token model (no customer Conxa login, no Clerk JWT machinery in runtime)
- Audit log (was returning empty `[]`; now persists real events per workspace)

**Phase 2 — Production Readiness**
- Device & runtime registration (cloud now sees all deployed runtimes, version distribution, last-seen)
- Runtime split architecture: monolithic 89 MB download → 85 MB host layer (quarterly) + 60 KB app layer (hot-synced). Code-only update time: ~70 seconds → under 1 second
- Final Selector Architecture (2026-06-22): IdentityBundle multi-signal identity, durability-ranked signals, strict uniqueness gate, structured `repair_event` emission, drift queue API — 66/66 Python tests green, Node resolver/verify/recovery tests green
- A11y recovery (2026-06-28): accessible name prioritized correctly in role+name resolution

**CI / Quality**
- Real execution gate added to build pipeline: a button click runs end-to-end in CI; build fails if element finder breaks (added after the V8 bytecode production bug)
- Chromium caching in CI (significantly faster builds)
- Playwright selector engine fixed: `--no-bytecode` flag added; V8 bytecode was silently corrupting Playwright selector engine in the packaged `.exe`

---

## Evidence: What Is Not Done (Gaps by Severity)

### High-Severity Gaps — Block General Availability

| Gap | What it means for users | Location |
|---|---|---|
| ~~**RBAC not enforced**~~ **RESOLVED (2026-07-01)** | `require_admin` now guards publish, plugin create/delete, and bundle release (403 for non-admin/owner) | `app/services/rbac.py` enforced in `publish_routes.py`, `plugin_routes.py`, `product_routes.py` |
| **No Windows code signing** | Windows SmartScreen shows "Unknown Publisher" warning and may block install for non-technical users | `installer_builder.py` — no `signtool.exe` step |
| **Billing quotas not enforced** | Plans exist (Free/Starter/Pro/Enterprise) but no limit on workflows, token usage, or installs | `app/services/saas.py`, `razorpay_routes.py` |
| **macOS runtime not distributable** | Build scripts reference macOS targets but no macOS installer builder exists | `installer_builder.py` — Windows only |

### Medium-Severity Gaps — Block Open Beta

| Gap | What it means for users | Location |
|---|---|---|
| ~~**Delta sync sends all files**~~ **RESOLVED (2026-07-01)** | Per-skill diffing: republishing one skill no longer re-ships the whole pack (residual: a changed skill sends its ~5 small JSON files) | `_build_delta()` in `skillpack_update_routes.py` uses `component_versions` KV |
| ~~**Rate limit is in-memory**~~ **RESOLVED (2026-07-01)** | Limit persisted in the KV store — survives restarts, shared across instances | `rate_limits` namespace via `conxa_core.db` in `skillpack_update_routes.py` |
| **Error messages are raw codes** | Users in Build Studio see strings like `cloud_unreachable`, `auth_file_in_build_input` instead of plain-English explanations | No `errorMessages.ts` map yet |
| **No pre-execution drift detection** | `structural_fingerprint` is compiled but never checked before execution starts | `runtime/run.js` — post-hoc repair events work; pre-exec gate open |
| **Selector cache GC not scheduled** | Cache grows without bound; GC function exists but no cron or startup task runs it | `snapshots_gc.py` — unscheduled |
| ~~**Nonce store in-memory**~~ **MOOT** | CLI auth flow was removed (sync-token model); no nonce store exists | n/a |

### Low-Severity Gaps — Tech Debt

| Gap | Notes |
|---|---|
| ~~Stripe fields in config (`stripe_*`)~~ **REMOVED (2026-07-01)** | Fully removed — config, endpoints, dep, frontend flag. Razorpay/Cashfree is the wired gateway. |
| `research/frontend/` dead prototype | Not deployed; confuses code readers. Delete or document. |
| `worker.py` is a scaffold | Queue not implemented. |
| `Aptfile` has Playwright deps | Cloud doesn't use Playwright; leftover from old architecture. |
| No CDN/multi-region blob storage | Installers stored base64-in-Postgres (works, doesn't scale past ~250 MB/slug) |
| `worker.py` queue scaffold | Not implemented |

---

## Phase-by-Phase Progress

```
Phase 1 — Architecture Consolidation — ✅ COMPLETE (updated 2026-07-01)
  ✅ 1.1  Auth token refresh (was a stub)
  ✅ 1.2  Runtime token acquisition flow → superseded by sync-token model
  ✅      Installer-provisioned sync-token model (eliminates Clerk JWT in runtime)
  ✅ 1.3  Nonce store → MOOT: CLI-auth flow removed, no nonce store exists
  ✅ 1.4  Delta sync → per-skill diffing shipped (whole-pack transfer eliminated)
  ✅ 1.5  Rate limit → persisted in conxa_core.db KV store (restart/multi-instance safe)
  ✅ 1.6  RBAC wired to plugin create/delete + bundle release (enforced, 403)
  ✅ 1.7  Stripe fully removed (endpoints, config, dep, frontend flag)
  ✅ 1.8  research/frontend/ → MOOT: directory does not exist

Phase 2 — Production Readiness (6–10 weeks estimated)
  ✅ 2.1  Device & runtime registration (cloud has visibility)
  ⬜ 2.2  Drift detection pre-execution (post-hoc works; pre-exec gate open)
  ✅ 2.3  Audit log (was returning empty [])
  ⬜ 2.4  macOS runtime support (no installer builder)
  ⬜ 2.5  Windows code signing (SmartScreen blocks unknown publisher)
  ⬜ 2.6  Selector cache GC scheduler
  ⬜ 2.7  Billing plan enforcement (quota, feature limits)
  ⬜ 2.8  User-friendly error messages in Build Studio
  ✅ 2.9  Final Selector Architecture (multi-signal identity, recovery, drift queue)
  ✅      Runtime split architecture (89 MB → 60 KB code updates)

Phase 3 — Enterprise Readiness (8–12 weeks)
  ⬜ 3.1  SSO / SAML (Clerk Enterprise)
  ⬜ 3.2  Multi-user workspace publishing
  ⬜ 3.3  On-premise / self-hosted option
  ⬜ 3.4  Workflow version history & rollback
  ⬜ 3.5  Advanced RBAC (per-skill, read-only analyst, CI/CD API keys)
  ⬜ 3.6  Compliance package (SOC 2 evidence, GDPR, data residency)

Phase 4 — AI Agent Platform (12–24 weeks, parallel with Phase 3)
  ⬜ 4.1  Conditional steps & branching logic
  ⬜ 4.2  Dynamic input resolution from Claude context
  ⬜ 4.3  Named sequence packages
  ⬜ 4.4  Public skill registry / marketplace
  ⬜ 4.5  API-first publishing SDK (CI/CD integration)
```

**Phase completion summary:**
- Phase 1: ✅ **100% complete** (all 8 items done, superseded, or moot as of 2026-07-01)
- Phase 2: ~50% complete (4 of 9 items done)
- Phase 3: 0% (not started)
- Phase 4: 0% (not started)

---

## Recent Velocity (last 30 commits)

All commits since 2026-06-20 have been in the `ci:` and `fix:` namespaces — hardening the build pipeline, not adding new features. This is the right focus for Private Beta but confirms the platform is not yet stable enough for open distribution.

| Commit cluster | What was done |
|---|---|
| V8 bytecode production bug | `--no-bytecode` flag; production `.exe` element finder was completely dead |
| CI execution gate | Real browser click in CI; build fails if replay breaks |
| Chromium caching | CI build speed improved |
| A11y recovery name precedence | Role+name resolution now matches compiler's accessible-name derivation |
| `testid` attribute regression | `data-testid` vs `data-test-id` attribute names preserved exactly |
| Dev/prod parity fix | Dev was running stale `.exe` instead of live source code |

---

## What Needs to Happen to Reach Each Next Stage

### To reach **Open Beta** (hand it to anyone who signs up)
1. ✅ Wire RBAC to all write routes (publish, delete, plugin create/delete, release) — DONE
2. Obtain and wire Windows code signing certificate
3. Enforce billing plan limits at publish and compile time
4. ✅ Real per-skill delta sync (whole-pack transfer eliminated) — DONE
5. ✅ Shared/persistent rate limit (KV store, restart + multi-instance safe) — DONE
6. Replace raw error codes with user-friendly messages in Build Studio UI

**Remaining for Open Beta: Windows code signing, billing enforcement, error-message UX
(all Phase 2). Phase 1 is complete.**

### To reach **General Availability (GA)**
Everything above, plus:
- macOS runtime support (significant testing required: keytar, Playwright, installer)
- Hardened billing with full plan enforcement
- Pre-execution drift detection gate
- Selector cache GC scheduled
- All Phase 2 items complete

**Estimated: 3–4 months from today**

### To reach **Enterprise GA** (close contracts with enterprises)
Everything above, plus Phase 3:
- SSO / SAML
- Multi-user workspace publishing
- On-premise / Docker Compose deployment
- Workflow version history & rollback
- SOC 2 evidence, GDPR compliance

**Estimated: 6–8 months from today**

---

## What Works Right Now (for design partners / private beta users)

If you put Conxa in front of a hand-picked technical user or a friendly SaaS partner today, this is what they get:

- A Windows Build Studio that records real browser workflows and compiles them locally
- A cloud dashboard that shows runs, active runtimes, audit events, and published skills
- A branded `.exe` installer that ships the runtime and skill pack to the customer
- Claude Desktop integration: skills appear as Claude tools, inputs are surfaced, execution runs locally
- Self-healing recovery that handles UI drift without LLM calls for common cases
- Automatic skill updates pushed to all deployed runtimes (hot-swap, under 1 second)
- Execution telemetry streaming back to the vendor dashboard

**What they will bump into:**
- Windows SmartScreen warning on installer install (code signing missing)
- Any workspace member can accidentally publish over another's work (RBAC unenforced)
- No macOS support
- Raw error codes if something goes wrong in the Build Studio
- Billing is present but not enforcing limits

---

## Summary Table

| Dimension | Status | Notes |
|---|---|---|
| Core loop (record → execute) | **Working** | End-to-end validated as of 2026-06-27 |
| Self-healing recovery | **Working** | 5-tier; Tier 1–2 zero tokens; CI-gated |
| Cloud infrastructure | **Working** | FastAPI on Render, Next.js on Vercel |
| Auth (Build Studio) | **Working** | Clerk PKCE → OS keyring |
| Auth (Runtime) | **Working** | Sync token in installer; no customer login |
| Skill sync | **Working** | Full-pack (delta TBD) |
| Billing gateway | **Wired, not enforced** | Razorpay/Cashfree; plan limits not checked |
| RBAC | **Enforced on write routes** | `require_admin` on publish, plugin create/delete, bundle release |
| Code signing | **Missing** | SmartScreen warning |
| macOS support | **Missing** | Windows only |
| Error UX | **Raw codes** | No user-friendly message map |
| Enterprise features | **Not started** | SSO, version history, on-prem |
| Compliance | **Not started** | SOC 2, GDPR, data residency |

**Overall stage: Private Beta.** The platform is real, the architecture is sound, and the core product promise is delivered. The path to Open Beta is clear and achievable in roughly 4–6 weeks. General Availability is a 3–4 month project.
