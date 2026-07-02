# Implementation Plan

**Status:** Current as of 2026-07-01 — **Phase 1 COMPLETE** (1.1–1.8 all done, superseded, or moot). Phase 2 partially done (2.1, 2.3, 2.9, runtime-split + auto-update arch).
**Audience:** Engineering team

This plan is grounded in the actual codebase. Each item references the specific file or system that needs to change. Items are ordered by risk and dependency, not effort.

---

## Phase 1 — Architecture Consolidation

**Goal:** Close the gaps that make the current system unreliable in production. No new features. All changes are to correctness, reliability, and observability.

**Timeline estimate:** 4–6 weeks

---

### ✅ 1.1 Fix Runtime Auth Token Refresh (Critical) — DONE 2026-06-02

**What was broken:** `POST /api/v1/auth/refresh` was a stub — it echoed back any token with a 30-day expiry regardless of validity.

**What was fixed:**
- `post_auth_refresh` now calls `verify_clerk_jwt(body.token)` in production (`SKILL_AUTH_REQUIRED=true`); returns HTTP 401 for invalid/expired tokens.
- Response `expires_at` reflects the real JWT `exp` claim instead of a fake 30-day window.
- Added `/api/v1/auth/refresh` and `/api/v1/auth/cli/poll` to `PUBLIC_AUTH_PATHS` in `security.py` so the middleware does not block runtime calls (which have no `Authorization` header — the token in the body is the credential).
- Fixed URL bug in `runtime/auth_manager.js:_doRefresh()`: was calling `${CONXA_API}/auth/refresh` (missing `/api/v1/` prefix), now calls `${CONXA_API}/api/v1/auth/refresh`.
- Local dev behaviour unchanged: token echoed back when `SKILL_AUTH_REQUIRED=false`.

---

### ✅ 1.2 Implement Runtime Token Acquisition Flow — DONE 2026-06-02

**What was missing:** No in-product way for a runtime to acquire a token for a company.

**What was built:**
- Added `setup_company` MCP tool to `runtime/server.js` (two-phase):
  - Phase 1 (`setup_company(company)`): calls `getAuthChallengeUrl()`, returns `{auth_url, nonce}` for Claude to show the user.
  - Phase 2 (`setup_company(company, nonce)`): polls `POST /api/v1/auth/cli/poll` once; on success stores token via `setToken()` and triggers a skill pack sync.
- Changed `post_auth_cli_complete` to use a JSON body (`{nonce, token}`) instead of query params.
- Added 10-minute TTL enforcement in `post_auth_cli_poll`; returns `{status: "expired"}` when stale.
- `post_auth_cli_poll` now parses the token's JWT `exp` and returns the real expiry.
- Created `conxa-cloud/frontend/app/auth/cli/page.tsx` — the browser auth page the user visits to approve access (Clerk-authenticated; calls `/api/v1/auth/cli/complete` via the Next.js proxy).

**Superseded:** The Clerk-JWT/`setup_company` approach was replaced in the same session by the installer-embedded sync-token model below. The `setup_company` tool, `/auth/refresh`, and `/auth/cli/*` endpoints were all removed. The CLI auth page (`app/auth/cli/page.tsx`) created here was deleted.

---

### ✅ Installer-Provisioned Sync Token — DONE 2026-06-02

**What was built:** End-user runtimes now pull skill-pack updates using an installer-embedded sync token — no Conxa login required.

- **Cloud (`publish_routes.py`):** `_sync_token()` mints a `secrets.token_urlsafe(32)` at publish time (reused on republish), stored in `sync_tokens` KV namespace. `sync_token` embedded in cloud-side `pack.json` and returned in the publish response.
- **Cloud (`skillpack_update_routes.py`):** `get_skill_pack_delta` now calls `_verify_sync_token(company, token)` — `secrets.compare_digest` against `db_get("sync_tokens", company)`. 401 on mismatch; skipped in local dev.
- **Cloud (`main.py`, `security.py`):** Removed `auth_router` and `PUBLIC_AUTH_PATHS` (the `/auth/refresh` + `/auth/cli/*` endpoints are gone).
- **Build Studio (`backend.py`):** After publish, reads `sync_token` from response and writes it into local `pack.json` before the installer is staged. Hard error if publish response lacks `sync_token`.
- **Build Studio (`installer_builder.py`):** Guard added — fails fast if `pack.json` has no `sync_token` (catches packs built before publish).
- **Runtime (`sync.js`):** `_doSync` reads `pack.sync_token` directly; `authManager.getToken()` call removed. `syncSkillPacks` signature simplified (no `authManager` param).
- **Runtime (`server.js`):** `setup_company` tool and `_handleAuthCallback` removed.
- **Runtime (`auth_manager.js`):** Clerk-token machinery (`getToken`/`setToken`/`refreshToken`/`_doRefresh`) removed. Session encryption now uses a per-machine random key (`getSessionKey(company)`) generated on first use and stored in OS keychain (`conxa-session` service) — isolates individual users' session files from the shared installer secret.
- **Runtime (`browser.js`):** Both `authManager.getToken(company)` call sites replaced with `authManager.getSessionKey(company)`.

---

### ✅ 1.3 Move Nonce Store to Redis (or DB) — SUPERSEDED / MOOT

**No longer applicable.** The CLI auth flow that used `_auth_nonces` was removed when the
installer-embedded sync-token model replaced it (see "Installer-Provisioned Sync Token"
above). There is no nonce store in the codebase (`grep nonce` = 0 hits), so there is
nothing to migrate. Runtimes authenticate skill-pack sync with the per-company sync token,
which is durable (KV `sync_tokens` namespace) and already restart-safe.

---

### ✅ 1.4 Implement Real Per-File Delta Sync — DONE (per-skill granularity)

**Resolved by the Enterprise-Grade Auto-Update Architecture (2026-07-01).**
`skillpack_update_routes.py:_build_delta()` now compares **each skill independently**
against the client's last-known version for that specific skill (`component_versions` KV,
per-file SHA-256), so republishing one skill never re-ships the rest of the pack. The
`since` request is a JSON `{skill_slug: version}` map. This eliminates the whole-pack
transfer the item was written to fix.

**Residual (intentionally not done):** within a *changed* skill, all ~5 small JSON files
(`execution/recovery/inputs/manifest/validation.json`) are shipped even if only one
changed. Marginal payload benefit; deferred as low-value.

---

### ✅ 1.5 Move Rate Limit Cache to a Shared Store — DONE 2026-07-01

**What was broken:** `_rate_cache` in `skillpack_update_routes.py` was in-memory —
multi-instance deployments (Render horizontal scaling) and restarts had no shared limit.

**What was built:** the sync rate limit is now persisted in the existing `conxa_core.db`
KV store (new `rate_limits` namespace, keyed by the 16-char token hash, storing
`{last_ts}`) whenever a database is configured (`using_database()`), so the 5-minute window
holds across restarts and is shared across instances. Falls back to the in-memory dict in
local/Studio mode where no database is configured. **Redis was not introduced** — it is not
installed (`requirements.txt`) nor provisioned (`render.yaml`); the KV dual-store already
provides durable, shared storage. Helpers `_rate_limit_last()` / `_rate_limit_set()`.

**Files:** `skillpack_update_routes.py`. **Tests:** `tests/test_skillpack_sync.py`.

---

### ✅ 1.6 Wire RBAC to API Routes — DONE 2026-07-01

**What was broken:** `app/services/rbac.py`'s `require_admin()` guarded the publish/installer
routes (`publish_routes.py`) and subscription routes, but the remaining mutating dashboard
routes accepted any authenticated member.

**What was built:** `require_admin(principal)` (allows `admin`/`owner`, else HTTP 403) is now
enforced on the three previously-unguarded write routes, matching the existing
`principal_from_request` → `ensure_principal` → `require_admin` pattern:
- `plugin_routes.py` — `post_create_plugin` (POST `/plugins`)
- `plugin_routes.py` — `delete_plugin_endpoint` (DELETE `/plugins/{id}`)
- `product_routes.py` — `patch_bundle_release` (PATCH `/packages/bundles/{slug}/release`)

Enforced directly (no audit-only phase). Local/dev principals default to role `owner`, so
existing single-user workflows are unaffected. Intentionally-public runtime phone-home
endpoints (`run_routes.py` events, `job_routes.py` cancel) are left open by design.

**Files:** `app/services/rbac.py`, `plugin_routes.py`, `product_routes.py`.
**Tests:** `tests/test_product_routes.py` (member→403, admin→200).

---

### ✅ 1.7 Remove Stripe — DONE 2026-07-01 (full removal)

**What was present:** more than just config — `product_routes.py` carried live but orphaned
Stripe `checkout`/`portal`/`webhook` endpoints, `security.py` whitelisted the webhook,
`saas.py` computed a `stripe_configured` flag, the frontend surfaced it, and `stripe>=11.0.0`
was a backend dependency. The wired gateway is Cashfree (`cashfree_routes.py`).

**What was removed:** the three Stripe endpoints + `_stripe_client` helper, the
`/api/v1/webhooks/stripe` public-path entry, the `stripe_configured` billing flag (backend
`saas.py` + frontend `productApi.ts` type and the dead `createCheckout`/`createPortal`
callers), the `stripe>=11.0.0` requirement, the `stripe_*` config fields, and the Stripe
test assertion.

**Files:** `product_routes.py`, `security.py`, `saas.py`, `requirements.txt`,
`packages/conxa-core/conxa_core/config.py`, `frontend/src/api/productApi.ts`,
`tests/test_product_routes.py`.

---

### ✅ 1.8 Delete or Document research/frontend/ — MOOT

**No longer applicable.** The `research/frontend/` directory does not exist in the repo (it
was already deleted or never committed). No action needed. The authoritative UIs remain
`conxa-cloud/frontend/` and `conxa-builder/electron/renderer/`.

---

**Phase 1 status: COMPLETE.** All items are done, superseded, or moot. The remaining
open work has moved to Phase 2 (drift gate, macOS, code signing, selector-cache GC,
billing enforcement, error-message UX).

---

## Phase 2 — Production Readiness

**Goal:** Make the platform ready for enterprise evaluation and reliable at scale. This phase adds observability, correctness, and operational controls.

**Timeline estimate:** 6–10 weeks

---

### ✅ 2.1 Device & Runtime Registration — DONE 2026-06-02

**What was missing:** The cloud had no visibility into deployed runtimes. `POST /api/v1/telemetry/runtime-start` was a no-op stub.

**What was built:**
- `post_telemetry_runtime_start` now stores a registration record per `(company, platform)` in the `runtime_registrations` KV namespace. Workspace is derived from the `sync_tokens` KV entry (set at publish time) — no new credential needed from the runtime.
- Added `GET /api/v1/telemetry/runtimes` (Clerk-authed, workspace-scoped): returns registrations, stale count (not seen in 30 days), and version distribution.
- Fixed `_phonehome()` in `runtime/server.js`: was calling `${CONXA_API}/telemetry/runtime-start` (missing `/api/v1/`); now calls `${CONXA_API}/api/v1/telemetry/runtime-start` using the module-level `CONXA_API`.
- Moved phonehome to fire after sync so `companies[]` reflects the current skill index rather than the pre-sync cache.
- Added `RuntimeRegistrationsCard` to the Dashboard: shows active/stale status per company, version distribution, last-seen time.
- Added `/api/v1/telemetry/runtime-start` to `PUBLIC_PATHS` in `security.py` (exact path only) so installed runtimes don't need Clerk auth for this non-critical endpoint.

**Files:** `skillpack_update_routes.py`, `security.py`, `runtime/server.js`, `DashboardPage.tsx`, `pluginApi.ts`

---

### 2.2 Implement Drift Detection

**✅ Implemented (2026-07-01).** The pre-execution gate ships. `structural_fingerprint` is now
plumbed from `SkillMeta` into the runtime `manifest.json` (`plugin_builder.py`) and checked at run
start in `runtime/drift.js` (called from `runPlan` in `run.js`). It scores the recorded landmarks
against the live page with the pure resolver (no LLM) and emits `drift_detected` — warn only, never
blocks. The cloud aggregates these per plugin version and surfaces them at `GET /drift`
(`_pre_exec_drift_queue`). Unit tests: `runtime/test/test_drift.js`, `tests/test_skill_pack_fingerprint.py`.

**Original design notes:** `SkillMeta.structural_fingerprint` stores the hash of the first 3 steps' landmark selectors. This was designed for pre-execution drift detection.

**Fix:**
- In `runtime/run.js`, before executing step 0: check if current page's landmark selectors match `structural_fingerprint`.
- If mismatch exceeds threshold: emit `drift_detected` event and warn Claude: "This workflow may need to be recompiled. The page structure has changed."
- Do not block execution — warn only.

**Files:** `runtime/run.js`, `runtime/tracker.js`

**Partially addressed by the Final Selector Architecture (§2.9):** runtime now emits structured
`repair_event` drift signals on every recovery, aggregated into an admin review queue at
`GET /api/v1/tracking/{company}/drift`. Pre-execution `structural_fingerprint` matching is still
open; runtime-side post-hoc drift surfacing is implemented.

---

### ✅ 2.9 Final Selector Architecture — DONE 2026-06-22

**What was built:** end-to-end durability-ranked element identity + zero-token replay/recovery.

- **Compile (Python):** `IdentityBundle` / `IdentitySignal` (`packages/conxa-core/.../skill_spec.py`),
  durability scoring + orthogonality classes (`selector_score.py`), uniqueness / PII-bind /
  xpath-shadow gates (`selector_filters.py`), `stable_hash.py`, deterministic-floor Playwright-grammar
  generator (`identity_bundle.py`), wired through `compiler/build.py`. Multi-signal
  `FrameFingerprint` (`recorder/session.py`), `shadow_path`, and `hover_chain` hints
  (`action_semantics.py`).
- **Replay (Node):** pure `runtime/resolver.js` (strict uniqueness gate, stable_hash tie-break),
  GATE + VERIFY in `runtime/run.js`.
- **Recover (Node):** `runtime/recovery.js` L1 exception ladder + L2 re-hover/a11y cascade,
  structured `repair_event` emission.
- **Flywheel (Cloud):** admin-gated drift queue `GET /api/v1/tracking/{company}/drift`
  (`tracking_routes.py`).

**Tests:** `tests/test_element_fingerprint.py` 66/66; Node `test_resolver.js` / `test_verify.js`
/ `test_recovery.js` all green. See `implementation-status.md` for the full phase log.

**Still open:** LLM enrichment of residual-uncertainty signals (deterministic floor ships now);
closed-shadow CDP pierce fallback; pre-execution `structural_fingerprint` drift gate (§2.2).

---

### ✅ 2.3 Audit Log — DONE 2026-06-02

**What was missing:** No record of which user took which action. The Settings page called `GET /api/v1/audit-events` which was a stub returning `[]`.

**What was built:**
- New `audit_routes.py`: `write_audit_log(user_id, workspace_id, action, resource_type, resource_id, ip, metadata)` helper uses `db_append("audit_log", workspace_id, [entry])` to persist events per workspace. `GET /api/v1/audit-events` (Clerk-authed) returns workspace-scoped entries, most recent first, paginated by `limit` param (max 500).
- IP extracted from `X-Forwarded-For` first hop (Render proxy-aware); falls back to `request.client.host`.
- Events written on: `publish` (publish_routes.py), `installer_upload` (publish_routes.py), `plugin_create` and `plugin_delete` (plugin_routes.py).
- Removed the empty stub from `v1_alias_routes.py`; Settings page now gets real data.
- Registered `audit_router` in `main.py`.

**Fields per entry:** `id`, `workspace_id`, `user_id`, `action`, `resource_type`, `resource_id`, `metadata`, `created_at` (epoch seconds), `ip`.

**Files:** `audit_routes.py` (new), `publish_routes.py`, `plugin_routes.py`, `v1_alias_routes.py`, `main.py`

---

### ✅ Runtime Split Architecture — DONE 2026-06-20

**What was built:** Eliminated the 89 MB self-update download on every code release by splitting the monolithic `runtime-win.exe` into two independently-updateable layers.

**Changes:**
- **Host layer** (`conxa-runtime.exe`, ~85 MB): Node.js + all npm deps + `bootstrap.js`. Updated only when Node.js, Playwright, or native deps change (quarterly).
- **App layer** (`conxa-app/`, ~60 KB zip): all application JS compiled to V8 bytecode (`.jsc`) via `javascript-obfuscator` → `bytenode`. Hot-synced on every cold start with no restart required.
- `bootstrap.js` (new) is the pkg entry point. Loads `conxa-app/server.jsc` from disk; falls back to bundled copy if absent or `min_host` incompatible.
- `(global.__hostRequire || require)` bridge lets disk-loaded `.jsc` files resolve npm deps bundled in the host VFS.
- **Sync optimisation:** `sync.js` rewritten — parallel company sync (`Promise.allSettled`), parallel file downloads (`Promise.all`), 5-min recency skip (client-side, prevents 429s), reduced timeouts (delta: 3s, files: 8s). Outer timeout: 15s → 4s.
- **`syncState` execution gate:** `execute_skill` awaits both skill-pack sync and app-layer update before running. Never hangs (all failures caught, gate opens with cached data).
- **Cloud API:** new endpoints `GET/POST /api/v1/updates/conxa-runtime-manifest` and `GET/POST /api/v1/updates/conxa-app-manifest`. POST endpoints require `CONXA_ADMIN_TOKEN` (CI-only). Old `runtime-manifest` endpoint replaced.
- **CI workflows** split into `build-runtime-host.yml` (`host-v*` tags) and `build-runtime-app.yml` (`app-v*` tags).
- **Installer** now stages `conxa-runtime.exe` + `runtime-app/` (pre-extracted) so first run needs no network.

**Result:** Code-only release download: 89 MB → ~60 KB. Update time: ~70s → <1s on any connection.

**Files:** `runtime/bootstrap.js` (new), `runtime/server.js`, `runtime/sync.js`, `runtime/browser.js`, `runtime/package.json`, `conxa-cloud/backend/app/api/updates_routes.py`, `conxa-builder/python/conxa_compile/installer_builder.py`, `conxa-builder/python/services/bootstrap.py`, `packages/conxa-core/conxa_core/storage/installer_templates/setup.nsi.tmpl`, `.github/workflows/build-runtime-app.yml` (new), `.github/workflows/build-runtime-host.yml` (new), `.env.example`

---

### ✅ Enterprise-Grade Auto-Update Architecture — DONE 2026-07-01

**What was built:** Replaced the two-layer split's `.bak`/`.next` single-backup update mechanism and two unsigned manifest endpoints with a versioned-directory + single-signed-manifest architecture. See TRD.md §4.1, §4.3, §4.4, §5.8, §11.3 for the authoritative reference; `docs/Runtime-Update-Architecture.md` (the original design proposal for the split above) is now marked superseded where it diverges.

**Changes:**
- **Versioned directories.** Every component — `conxa-runtime`, `conxa-app`, and each individual skill — is now `<component>/<version>/` with a `current` directory junction, retaining the last 3 versions (`runtime/version_manager.js`, new). Rollback is instant and needs no re-download; junctions were chosen over JSON pointer files specifically because Claude Desktop's MCP config stores a literal path to the host exe, which only the OS can resolve transparently.
- **One Ed25519-signed manifest.** `GET /api/v1/manifest.json` (new) replaces the two `conxa-runtime-manifest`/`conxa-app-manifest` endpoints as the runtime's source of truth (old endpoints kept as deprecated shims reading the same data). Signed server-side with a private key that never touches CI; the runtime verifies against a public key baked into the host exe and discards anything that fails verification, same as a network failure. `runtime/manifest_manager.js` (new) is the client.
- **Real staged rollouts.** Each component version carries a `rollout.percentage`; the runtime deterministically buckets itself (hash of install_id, salted per component) so a canary rollout is stable across polls, not re-randomized every check.
- **Independent per-skill versioning.** `skillpack_update_routes.py`'s delta endpoint now compares each skill's own version (from a new `component_versions` KV namespace) instead of one shared per-company version — republishing one skill never triggers a re-download of the others. `runtime/sync.js` rewritten to match.
- **Selfcheck before activation.** A newly downloaded host exe is spawned once with `--selfcheck` before `current` is ever pointed at it — a matching SHA-256 only proves the download wasn't corrupted, not that the binary boots.
- **Cloud persistence.** Manifest/component-version state moved from process-local Python globals (lost on every Render restart or across worker processes) to the existing `conxa_core.db` KV dual-store, in new `component_versions` and `manifest` namespaces.
- **Installer** now lays out the versioned structure from the start (`installer_builder.py` nests each skill under its own `v`-prefixed version directory; `setup.nsi.tmpl` creates the `current` junctions and registers the MCP command through `conxa-runtime\current\`), so the initial install already matches the layout every later update writes into. No customer migration needed — pre-production, greenfield.

**Result:** Instant no-network rollback (vs. one-step-only before); tamper-proof update manifest (vs. unsigned); staged rollout capability (vs. all-or-nothing); per-skill update granularity (vs. whole-company re-sync).

**Files:** `runtime/version_manager.js` (new), `runtime/manifest_manager.js` (new), `runtime/bootstrap.js`, `runtime/server.js`, `runtime/sync.js`, `runtime/skill_loader.js`, `runtime/test/test_version_manager.js` (new), `runtime/test/test_manifest_manager.js` (new), `runtime/test/gate_replay.js`, `packages/conxa-core/conxa_core/models/manifest.py` (new), `conxa-cloud/backend/app/api/manifest_signer.py` (new), `conxa-cloud/backend/app/api/updates_routes.py`, `skillpack_update_routes.py`, `publish_routes.py`, `conxa-cloud/tests/test_manifest_signing.py` (new), `conxa-builder/python/conxa_compile/installer_builder.py`, `packages/conxa-core/conxa_core/storage/installer_templates/setup.nsi.tmpl`, `.github/workflows/build-runtime-host.yml`, `build-runtime-app.yml`

---

### 2.4 macOS Runtime Support

**What's present:** The build scripts reference macOS targets (`build:mac` in `runtime/package.json`). `CONXA_DIR` resolves to `~/.conxa` on non-Windows. The runtime code is platform-aware.

**What's missing:** No macOS installer builder in `installer_builder.py`. No tested macOS distribution path.

**Fix:**
- Add macOS installer generation (PKG or DMG) to `installer_builder.py`.
- Test runtime on macOS (auth_manager, keytar, Playwright).
- Add macOS to the `updates/runtime-manifest` response.

**Files:** `conxa-builder/python/services/installer_builder.py`, `updates_routes.py`

---

### 2.5 Installer Code Signing

**What's missing:** The Windows `.exe` installer is not code-signed. Windows SmartScreen will block it with an "Unknown Publisher" warning for end users.

**Fix:**
- Obtain Windows EV code signing certificate.
- Add `signtool.exe` step to `installer_builder.py` after NSIS build.
- Configurable via env var (`CONXA_SIGN_TOOL_PATH`, `CONXA_SIGN_CERT_PATH`).

**Files:** `conxa-builder/python/services/installer_builder.py`

---

### 2.6 Selector Cache GC

**✅ Implemented (2026-07-01).** `snapshots_gc.py` only covered session snapshot blobs; the selector
cache had *no* bulk GC (only lazy per-read expiry, which never deleted). Added
`selector_cache.cleanup_expired_entries()` (purges expired KV entries + on-disk cache files) and a
background loop in the cloud lifespan (`main.py`) that runs it plus `cleanup_old_snapshots()` at
startup and every `gc_interval_secs` (default 6h). Test: `tests/test_selector_cache_gc.py`.

**Original notes — What's present:** Selector cache (`conxa_core/storage/selector_cache.py`) has a `ttl_days` config (30 days). GC function exists (`snapshots_gc.py`).

**Was missing:** No scheduled job ran the GC. The cache grew without bound.

**Fix:**
- Add a startup task (or Render cron job) to run selector cache GC on schedule.
- Log items evicted and cache size.

**Files:** `conxa_cloud/backend/app/main.py` (lifespan), `selector_cache.py`, `snapshots_gc.py`

---

### 2.7 Hardened Billing Integration

**✅ Implemented (2026-07-01).** Correction to earlier notes: the payment provider is **Cashfree**
(`cashfree_routes.py`), not Razorpay, and a full entitlements service already existed
(`app/services/entitlements.py`, `PLAN_LIMITS` for Free/Starter/Pro/Enterprise/development) — it was
simply gated off. This item: (a) turned the `entitlements_enforce_*` flags on by default
(`config.py`); (b) added a plan/installer-slot gate at publish (`publish_routes.py`); (c) kept
compile-credit enforcement via the existing reserve→commit→release protocol Build Studio already
drives (`backend.py`), and the Human-Edit token pool at the LLM proxy; (d) reconciled the flat
`llm_metering` token backstop with the plan-aware meters (documented inline in `llm_proxy_routes.py`);
(e) derived the Billing-page feature copy from `PLAN_LIMITS` so numbers can't drift. `development` and
any `None` limit stay unlimited, so local dev is unaffected.

**Files:** `app/services/entitlements.py`, `app/api/publish_routes.py`, `app/api/llm_proxy_routes.py`, `app/api/cashfree_routes.py`, `packages/conxa-core/conxa_core/config.py`

---

### 2.8 Error Code User-Friendly Mapping (UI)

**✅ Implemented (2026-07-01).** Added `renderer/src/lib/errorMessages.ts` (a `Record<code, message>`
covering the full backend `_CommandError` set plus transport codes) and upgraded the shared
`errorMessage(err, fallback)` helper in `workflowApi.ts` to prefer `errorMessages[err.code]`, then the
raw backend message, then the caller's fallback. Direct `.message` display sites (BuildInstallerPage,
CompileProgress, RecordingFeed, SetupWizard, LoginOverlay) now route through the helper; the many
`toast.error(errorMessage(...))` sites improve automatically.

**Files:** `conxa-builder/electron/renderer/src/lib/errorMessages.ts` (new), `renderer/src/api/workflowApi.ts`, and the display sites above

---

## Phase 3 — Enterprise Readiness

**Goal:** Pass enterprise security review and support multi-engineer team workflows.

**Timeline estimate:** 8–12 weeks

---

### 3.1 SSO / SAML

- Enable Clerk Enterprise with SAML support.
- Configure per-organization SSO.
- Map SAML groups to Conxa workspace roles.
- Session management: enforce SSO session timeout policy.

**Dependencies:** Clerk Enterprise plan.

---

### 3.2 Multi-User Workspace Publishing

**Current state:** Only the slug owner can publish updates.

**Fix:**
- Any workspace member with `admin` or `owner` role can publish to a workspace-owned slug.
- Add workspace transfer for slug ownership.
- Implement invitation flow (currently UI exists in Team page but backend not fully wired).

**Files:** `publish_routes.py`, `app/services/saas.py`, `app/services/rbac.py`

---

### 3.3 On-Premise Option

- Package the FastAPI backend as a self-hosted option (Docker Compose).
- Replace Render-specific dependencies with configurable alternatives.
- Document self-hosted configuration.
- Build Studio points to customer's own cloud backend via Settings.

**Files:** `conxa-cloud/backend/Dockerfile` (already exists), `docker-compose.yml` (new)

---

### 3.4 Workflow Version History & Rollback

- Store previous SkillPackage versions (not just the latest).
- Allow publishing a previous version via the dashboard.
- Delta sync serves whichever version the company selects.
- UI shows version timeline.

**Files:** `publish_routes.py`, `skillpack_update_routes.py`, Cloud dashboard

---

### 3.5 Advanced RBAC

- Per-skill access controls (who can read vs. publish specific skills).
- Read-only analyst role (can view telemetry but not trigger builds or publish).
- API key support for CI/CD publishing (Build Studio not required for publishing).

**Files:** `app/services/rbac.py`, `publish_routes.py`

---

### 3.6 Compliance Package

- SOC 2 evidence export (audit log, access controls documentation).
- Data residency option (EU storage).
- Data deletion API (GDPR: delete all telemetry for a run_id or workspace).
- Privacy policy compliance for telemetry (opt-out flag in pack.json).

---

## Phase 4 — AI Agent Platform

**Goal:** Evolve from a packaging/distribution layer into the foundation for AI-native automation products.

**Timeline estimate:** 12–24 weeks (in parallel with Phase 3)

---

### 4.1 Conditional Steps & Branching Logic

**What's needed:** Skills currently execute linearly. Enterprise workflows have conditional paths (e.g. "if the user exists, update them; otherwise create them").

**Design:**
- Add `condition` field to `SkillStep` with a `condition_type` (e.g. `selector_present`, `url_matches`, `assertion_result`).
- Add `branch` field pointing to an alternative skill block.
- Runtime evaluates conditions and branches accordingly.

**Files:** `conxa_core/models/skill_spec.py`, `runtime/run.js`, `conxa-builder/python/conxa_compile/compiler/build.py`

---

### 4.2 Dynamic Input Resolution

**What's needed:** Currently, all inputs must be explicitly provided by the user or Claude before execution starts. Future: Claude derives inputs from conversation context automatically.

**Design:**
- Add `resolve_from_context: bool` flag per input.
- MCP execution tool passes `conversation_context` alongside explicit inputs.
- Runtime uses context for `{{variable}}` substitution when the input is not explicitly set.

**Files:** `runtime/server.js`, `runtime/run.js`, `conxa_core/models/skill_spec.py`

---

### 4.3 Multi-App Skill Sequences

**What's needed:** `execute_sequence` tool already exists and runs skills in a shared browser session. But sequences are ad-hoc (Claude orchestrates). Persistent, named sequences would allow companies to publish "orchestrated workflows" as products.

**Design:**
- Add `SequencePackage` to the skill package schema.
- Publisher defines a sequence: `[{skill: "login"}, {skill: "export_report"}, {skill: "email_report"}]`.
- Runtime `execute_sequence` tool accepts a sequence slug alongside individual skill slugs.

**Files:** `conxa_core/models/`, `runtime/server.js`, `plugin_builder.py`

---

### 4.4 Public Skill Registry / Marketplace

**What's needed:** A searchable directory of published skill packages that any user can browse and install.

**Design:**
- `GET /api/v1/registry/search?q=...&category=...` returns public packages.
- Companies opt-in to public listing at publish time.
- End users install via `install_plugin(slug)` MCP tool (already exists in server.js).
- Marketplace UI in cloud dashboard.

**Files:** Cloud backend new route, Cloud frontend new page, `runtime/server.js` (`install_plugin` tool)

---

### 4.5 API-First Publishing SDK

**What's needed:** Companies want to integrate Conxa publishing into their CI/CD pipeline. Currently requires Build Studio (Windows only).

**Design:**
- Python SDK that wraps the Build Studio compilation pipeline.
- CLI: `conxa compile --session-id ... --output ./dist`.
- CI integration: GitHub Action that compiles + publishes on merge.
- The Build Studio Python backend (`conxa_compile`) is already a self-contained package — the SDK is a thin wrapper.

**Files:** New package in `packages/conxa-sdk/`, GitHub Actions workflow template

---

## Dependency Map

```
Phase 1 (must complete before Phase 2):
  1.1 (auth fix) → 1.2 (token flow) → blocks 2.1 (device registration)
  1.4 (real delta) → blocks 2.2 (drift detection reads manifest)
  1.6 (RBAC wired) → blocks 3.2 (multi-user publishing)

Phase 2 (must complete before Phase 3):
  2.1 (device registration) → blocks 3.3 (on-premise, needs registration model)
  2.3 (audit log) → blocks 3.6 (compliance package)
  2.7 (billing hardened) → blocks Phase 3 (enterprise plans)

Phase 3 and 4 can proceed in parallel.
```

---

## Risk Summary

| Risk | Phase | Severity | Mitigation |
|---|---|---|---|
| Runtime installations without valid tokens break after 1.1 | 1 | High | **Resolved** — replaced by installer-embedded sync_token; no Conxa login required |
| RBAC enforcement breaks existing admin workflows | 1 | Medium | Roll out in audit-only mode first; log violations before enforcing |
| Delta sync format change breaks older runtimes | 1 | Medium | Support both manifest-diff and full-pack responses based on request params |
| macOS Playwright + keytar compatibility unknown | 2 | Medium | Test on macOS before committing to timeline |
| Stripe fields removed breaks env that had them set | 1 | Low | Only removing from config schema; env vars with SKILL_STRIPE_ prefix just get ignored |
| Slug claim race condition | 3 | Low | First publish claims; enforce idempotency within same workspace |
